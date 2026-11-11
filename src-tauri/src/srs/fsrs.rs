// src-tauri/src/srs/fsrs.rs — Thuật toán FSRS v4.5 / v5 (Free Spaced Repetition Scheduler) thuần trong Rust
use crate::db::repositories::srs::{SrsCard, DAY_MS, MINUTE_MS};

pub const DEFAULT_WEIGHTS: [f64; 17] = [
    0.40255, 1.18385, 3.173, 15.69105, // w0..w3: Initial stability for ratings 1, 2, 3, 4
    7.1949, 0.5345, 1.4604, 0.0046, // w4..w7: Initial difficulty & difficulty adjustment
    1.5457, 0.1192, 1.0192, // w8..w10: Stability update on Recall
    1.9395, 0.11, 0.29605, 0.22695, // w11..w14: Stability update on Forgetting (Again)
    0.2315, 2.9898, // w15..w16: Hard penalty & Easy bonus
];

pub const FACTOR: f64 = 19.0 / 81.0;

#[derive(Debug, Clone)]
pub struct FsrsParameters {
    pub weights: [f64; 17],
    pub target_retention: f64,
}

impl Default for FsrsParameters {
    fn default() -> Self {
        Self {
            weights: DEFAULT_WEIGHTS,
            target_retention: 0.9,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct FsrsState {
    pub stability: f64,
    pub difficulty: f64,
}

// Tính Retrievability R(t, S)
pub fn retrievability(elapsed_days: f64, stability: f64) -> f64 {
    if elapsed_days <= 0.0 {
        return 1.0;
    }
    let s = stability.max(0.1);
    (1.0 + FACTOR * (elapsed_days / s)).powf(-0.5)
}

// Khởi tạo stability ban đầu theo rating 1..4
pub fn init_stability(rating: i64, weights: &[f64; 17]) -> f64 {
    let idx = (rating.clamp(1, 4) - 1) as usize;
    weights[idx].max(0.1)
}

// Khởi tạo difficulty ban đầu theo rating 1..4 (thang 1.0..10.0)
pub fn init_difficulty(rating: i64, weights: &[f64; 17]) -> f64 {
    let g = rating.clamp(1, 4) as f64;
    let d = weights[4] - (weights[5] * (g - 1.0)).exp() + 1.0;
    d.clamp(1.0, 10.0)
}

// Cập nhật difficulty tiếp theo
pub fn next_difficulty(d: f64, rating: i64, weights: &[f64; 17]) -> f64 {
    let g = rating.clamp(1, 4) as f64;
    let delta = -weights[6] * (g - 3.0);
    let d_init_3 = init_difficulty(3, weights);
    let d_next = weights[7] * d_init_3 + (1.0 - weights[7]) * (d + delta);
    d_next.clamp(1.0, 10.0)
}

// Cập nhật stability khi nhớ thành công (rating >= 2)
pub fn next_stability_recall(d: f64, s: f64, r: f64, rating: i64, weights: &[f64; 17]) -> f64 {
    let s_clean = s.max(0.1);
    let d_clean = d.clamp(1.0, 10.0);
    let r_clean = r.clamp(0.01, 1.0);

    let hard_penalty = if rating == 2 {
        weights[15]
    } else if rating == 4 {
        weights[16]
    } else {
        1.0
    };

    let inc = 1.0
        + weights[8].exp()
            * (11.0 - d_clean)
            * s_clean.powf(-weights[9])
            * ((weights[10] * (1.0 - r_clean)).exp() - 1.0)
            * hard_penalty;

    (s_clean * inc).max(s_clean + 0.1)
}

// Cập nhật stability khi quên (rating == 1: Again)
pub fn next_stability_forget(d: f64, s: f64, r: f64, weights: &[f64; 17]) -> f64 {
    let s_clean = s.max(0.1);
    let d_clean = d.clamp(1.0, 10.0);
    let r_clean = r.clamp(0.01, 1.0);

    let s_f = weights[11]
        * d_clean.powf(-weights[12])
        * ((s_clean + 1.0).powf(weights[13]) - 1.0)
        * (weights[14] * (1.0 - r_clean)).exp();

    s_f.clamp(0.1, (s_clean * 0.95).max(0.2))
}

// Tính khoảng cách ngày tối ưu theo độ ổn định (S) và xác suất nhớ mục tiêu (r)
pub fn calculate_interval(stability: f64, target_retention: f64) -> i64 {
    let r = target_retention.clamp(0.7, 0.98);
    let s = stability.max(0.1);
    let interval_float = (1.0 / FACTOR) * s * (r.powf(-2.0) - 1.0);
    interval_float.round().max(1.0) as i64
}

// Áp dụng Fuzz factor để tránh thẻ bị dồn vào cùng một ngày
pub fn apply_fuzz(interval: i64, seed_id: &str, now: i64) -> i64 {
    if interval < 3 {
        return interval;
    }
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();
    seed_id.hash(&mut hasher);
    now.hash(&mut hasher);
    let hash_val = hasher.finish();

    let fuzz_range = (interval as f64 * 0.05).round().max(1.0) as i64;
    let offset = ((hash_val % (fuzz_range as u64 * 2 + 1)) as i64) - fuzz_range;
    (interval + offset).max(1)
}

// Lên lịch thẻ theo thuật toán FSRS
pub fn schedule_fsrs(
    card: &SrsCard,
    rating: i64,
    now: i64,
    target_retention: f64,
    enable_fuzz: bool,
) -> SrsCard {
    let weights = &DEFAULT_WEIGHTS;
    let r_clean = rating.clamp(1, 4);
    let mut c = card.clone();

    let is_new = c.state == "new" || (c.reps == 0 && c.stability.is_none());
    let elapsed_days = if let Some(last_rev) = c.last_review {
        ((now - last_rev).max(0) as f64) / (DAY_MS as f64)
    } else if c.due > 0 && c.interval > 0 {
        c.interval as f64
    } else {
        0.0
    };

    let current_stability = c.stability.unwrap_or_else(|| {
        if c.interval > 0 {
            c.interval as f64
        } else {
            init_stability(3, weights)
        }
    });

    let current_difficulty = c.difficulty.unwrap_or_else(|| {
        // Tương thích ngược từ ease (2.5 -> diff 5.0)
        let ease = if c.ease > 0.0 { c.ease } else { 2.5 };
        ((3.0 - ease) * 4.0 + 5.0).clamp(1.0, 10.0)
    });

    if is_new {
        let s0 = init_stability(r_clean, weights);
        let d0 = init_difficulty(r_clean, weights);
        c.stability = Some(s0);
        c.difficulty = Some(d0);
        c.last_review = Some(now);
        c.updated_at = Some(now);

        if r_clean == 1 {
            c.state = "learning".to_string();
            c.step = 0;
            c.interval = 0;
            c.due = now + MINUTE_MS;
            c.lapses += 1;
        } else {
            c.state = "review".to_string();
            c.step = 0;
            c.reps = 1;
            let mut interval = calculate_interval(s0, target_retention);
            if enable_fuzz {
                interval = apply_fuzz(interval, c.item_id.as_deref().unwrap_or(""), now);
            }
            c.interval = interval;
            c.due = now + interval * DAY_MS;
        }
        return c;
    }

    // Thẻ đã qua ít nhất 1 lần học
    let current_r = retrievability(elapsed_days, current_stability);
    let next_d = next_difficulty(current_difficulty, r_clean, weights);
    c.difficulty = Some(next_d);
    c.last_review = Some(now);
    c.updated_at = Some(now);

    if r_clean == 1 {
        // Quên (Again)
        let next_s = next_stability_forget(next_d, current_stability, current_r, weights);
        c.stability = Some(next_s);
        c.state = "relearning".to_string();
        c.step = 0;
        c.lapses += 1;
        // Interval tạm thời 1 ngày khi tốt nghiệp relearning, hiện tại cần ôn lại sau 1 phút
        c.interval = 1;
        c.due = now + MINUTE_MS;
    } else {
        // Nhớ được (Hard, Good, Easy)
        let next_s = next_stability_recall(next_d, current_stability, current_r, r_clean, weights);
        c.stability = Some(next_s);
        c.state = "review".to_string();
        c.reps += 1;

        let mut interval = calculate_interval(next_s, target_retention);
        if r_clean == 2 {
            // Hard: tối thiểu bằng interval cũ + 1
            interval = interval.max(c.interval + 1);
        } else {
            interval = interval.max(c.interval + 1);
        }

        if enable_fuzz {
            interval = apply_fuzz(interval, c.item_id.as_deref().unwrap_or(""), now);
        }

        c.interval = interval;
        c.due = now + interval * DAY_MS;
    }

    c
}
