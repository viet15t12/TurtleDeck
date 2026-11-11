// src-tauri/src/srs/adaptive_planner.rs — Lập lịch và trộn câu thích ứng (Adaptive & Interleaving)
use crate::db::repositories::srs::{SrsCard, DAY_MS};
use crate::srs::builder::{build_question, BuilderOptions, BuiltQuestion};
use crate::srs::fsrs::retrievability;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::{HashMap, VecDeque};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannerConfig {
    pub deck_id: Option<String>,
    pub deck_kind: Option<String>,
    pub mode: Option<String>,
    pub direction: Option<String>,
    pub new_cards_per_day: usize,
    pub target_retention: f64,
    pub max_count: Option<usize>,
    pub min_gap: usize,
    pub seed: Option<u64>,
}

impl Default for PlannerConfig {
    fn default() -> Self {
        Self {
            deck_id: None,
            deck_kind: Some("vocab".to_string()),
            mode: Some("srs".to_string()),
            direction: Some("both".to_string()),
            new_cards_per_day: 20,
            target_retention: 0.9,
            max_count: None,
            min_gap: 3,
            seed: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlannedCardItem {
    pub item_id: String,
    pub direction: String,
    pub category: String, // "due", "learning", "new"
    pub priority: f64,
    pub retrievability: Option<f64>,
    pub card: SrsCard,
    pub item: Value,
    pub question: Option<BuiltQuestion>,
}

pub fn plan_adaptive_session(
    items: &[Value],
    cards: &[SrsCard],
    config: &PlannerConfig,
    now: i64,
) -> Vec<PlannedCardItem> {
    let mut card_map = HashMap::new();
    for c in cards {
        let iid = c.item_id.as_deref().unwrap_or("");
        let dir = c.direction.as_deref().unwrap_or("fwd");
        if !iid.is_empty() {
            card_map.insert(format!("{iid}:{dir}"), c.clone());
        }
    }

    let deck_id = config.deck_id.as_deref().unwrap_or("deck");
    let deck_kind = config.deck_kind.as_deref().unwrap_or("vocab");
    let target_dir = config.direction.as_deref().unwrap_or("both");

    let directions: Vec<&str> = if deck_kind == "vocab" {
        match target_dir {
            "fwd" => vec!["fwd"],
            "rev" => vec!["rev"],
            _ => vec!["fwd", "rev"],
        }
    } else {
        vec!["fwd"]
    };

    let mut due_bucket: Vec<PlannedCardItem> = Vec::new();
    let mut learning_bucket: Vec<PlannedCardItem> = Vec::new();
    let mut new_bucket: Vec<PlannedCardItem> = Vec::new();

    let build_mode =
        config
            .mode
            .as_deref()
            .unwrap_or(if deck_kind == "vocab" { "mc" } else { "quiz" });
    let builder_opts = BuilderOptions {
        count: 4,
        seed: config.seed,
    };

    for &dir in &directions {
        for it in items {
            let item_id = match it.get("id").and_then(|v| v.as_str()) {
                Some(id) if !id.is_empty() => id.to_string(),
                _ => continue,
            };

            let key = format!("{item_id}:{dir}");
            let mut existing_card = card_map.get(&key).cloned().unwrap_or_else(|| SrsCard {
                deck_id: Some(deck_id.to_string()),
                item_id: Some(item_id.clone()),
                direction: Some(dir.to_string()),
                state: "new".to_string(),
                ..Default::default()
            });
            if existing_card.deck_id.is_none() {
                existing_card.deck_id = Some(deck_id.to_string());
            }

            let elapsed_days = if let Some(last_rev) = existing_card.last_review {
                ((now - last_rev).max(0) as f64) / (DAY_MS as f64)
            } else if existing_card.due > 0 && existing_card.interval > 0 {
                existing_card.interval as f64
            } else {
                0.0
            };

            let stability = existing_card
                .stability
                .unwrap_or(existing_card.interval.max(1) as f64);
            let difficulty = existing_card.difficulty.unwrap_or(5.0);
            let r = retrievability(elapsed_days, stability);
            let question = build_question(it, dir, build_mode, items, &builder_opts);

            if existing_card.state == "review" {
                if existing_card.due <= now {
                    // Thẻ review đến hạn: tính điểm ưu tiên theo độ suy giảm trí nhớ và lapses
                    let priority = (1.0 - r) * 5.0
                        + (existing_card.lapses as f64) * 0.8
                        + (difficulty / 10.0) * 0.2;
                    due_bucket.push(PlannedCardItem {
                        item_id: item_id.clone(),
                        direction: dir.to_string(),
                        category: "due".to_string(),
                        priority,
                        retrievability: Some(r),
                        card: existing_card,
                        item: it.clone(),
                        question,
                    });
                }
            } else if existing_card.state == "learning" || existing_card.state == "relearning" {
                // Thẻ đang học dở: ưu tiên cao nhất để củng cố bước học
                let priority = 10.0 + (1.0 - r) * 2.0 + (existing_card.lapses as f64) * 0.5;
                learning_bucket.push(PlannedCardItem {
                    item_id: item_id.clone(),
                    direction: dir.to_string(),
                    category: "learning".to_string(),
                    priority,
                    retrievability: Some(r),
                    card: existing_card,
                    item: it.clone(),
                    question,
                });
            } else {
                // Thẻ mới
                new_bucket.push(PlannedCardItem {
                    item_id: item_id.clone(),
                    direction: dir.to_string(),
                    category: "new".to_string(),
                    priority: 0.0,
                    retrievability: None,
                    card: existing_card,
                    item: it.clone(),
                    question,
                });
            }
        }
    }

    // Sắp xếp các thẻ do ưu tiên giảm dần
    due_bucket.sort_by(|a, b| {
        b.priority
            .partial_cmp(&a.priority)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    learning_bucket.sort_by(|a, b| {
        b.priority
            .partial_cmp(&a.priority)
            .unwrap_or(std::cmp::Ordering::Equal)
    });

    // Giới hạn hạn ngạch thẻ mới trong ngày
    let selected_new: Vec<PlannedCardItem> = new_bucket
        .into_iter()
        .take(config.new_cards_per_day)
        .collect();

    // 1. Gộp và xen kẽ (Interleave) thẻ mới với thẻ ôn tập
    let mut review_pool: VecDeque<PlannedCardItem> =
        learning_bucket.into_iter().chain(due_bucket).collect();

    let mut combined_pool: Vec<PlannedCardItem> = Vec::new();
    if review_pool.is_empty() {
        combined_pool.extend(selected_new);
    } else if selected_new.is_empty() {
        combined_pool.extend(review_pool);
    } else {
        // Phân tán đều thẻ mới vào danh sách thẻ ôn
        let mut new_iter = selected_new.into_iter();
        let stride = (review_pool.len() / (new_iter.len() + 1)).max(1);

        let mut count = 0;
        while let Some(rev_card) = review_pool.pop_front() {
            combined_pool.push(rev_card);
            count += 1;
            if count % stride == 0 {
                if let Some(new_card) = new_iter.next() {
                    combined_pool.push(new_card);
                }
            }
        }
        for remaining_new in new_iter {
            combined_pool.push(remaining_new);
        }
    }

    // 2. Thuật toán Interleaving chống trùng lặp gần nhau (Minimum Gap)
    let min_gap = config.min_gap.max(1);
    let mut final_queue: Vec<PlannedCardItem> = Vec::new();
    let mut remaining = combined_pool;

    while !remaining.is_empty() {
        // Xác định tập các item_id đã xuất hiện trong min_gap câu gần nhất
        let history_start = if final_queue.len() >= min_gap {
            final_queue.len() - min_gap
        } else {
            0
        };
        let recent_ids: Vec<&str> = final_queue[history_start..]
            .iter()
            .map(|q| q.item_id.as_str())
            .collect();

        // Tìm candidate đầu tiên có item_id không thuộc recent_ids
        let candidate_idx = remaining
            .iter()
            .position(|q| !recent_ids.contains(&q.item_id.as_str()));

        let chosen_idx = match candidate_idx {
            Some(idx) => idx,
            None => {
                // Nếu tất cả candidate đều đã xuất hiện gần đây, chọn candidate có lần xuất hiện xa nhất
                let mut best_idx = 0;
                let mut earliest_pos = usize::MAX;
                for (idx, cand) in remaining.iter().enumerate() {
                    let last_seen = final_queue
                        .iter()
                        .rposition(|q| q.item_id == cand.item_id)
                        .unwrap_or(0);
                    if last_seen < earliest_pos {
                        earliest_pos = last_seen;
                        best_idx = idx;
                    }
                }
                best_idx
            }
        };

        let card = remaining.remove(chosen_idx);
        final_queue.push(card);
    }

    // Post-repair để loại bỏ triệt để xung đột khoảng cách min_gap nếu có
    if final_queue.len() > 2 {
        for i in 0..final_queue.len() {
            if !is_position_valid(&final_queue, i, min_gap) {
                for j in 0..final_queue.len() {
                    if i == j {
                        continue;
                    }
                    final_queue.swap(i, j);
                    if is_position_valid(&final_queue, i, min_gap)
                        && is_position_valid(&final_queue, j, min_gap)
                    {
                        break;
                    } else {
                        final_queue.swap(i, j);
                    }
                }
            }
        }
    }

    // Giới hạn max_count nếu có
    if let Some(max_c) = config.max_count {
        if max_c > 0 && max_c < final_queue.len() {
            final_queue.truncate(max_c);
        }
    }

    final_queue
}

fn is_position_valid(queue: &[PlannedCardItem], pos: usize, min_gap: usize) -> bool {
    let start = pos.saturating_sub(min_gap);
    let end = (pos + min_gap + 1).min(queue.len());
    let target_id = &queue[pos].item_id;
    for (idx, item) in queue[start..end].iter().enumerate() {
        let actual_idx = start + idx;
        if actual_idx != pos && &item.item_id == target_id {
            return false;
        }
    }
    true
}
