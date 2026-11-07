// src-tauri/src/srs/grader.rs — Chấm điểm câu hỏi thông minh trong Rust (hỗ trợ so khớp mờ, regex, latex, trắc nghiệm)
use regex::Regex;
use serde::{Deserialize, Serialize};
use std::collections::BTreeSet;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GradeResult {
    pub ok: bool,
    pub near: bool,
}

// Chuẩn hoá khoảng trắng
pub fn normalize_text(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

// Tính khoảng cách Levenshtein theo ký tự Unicode (hỗ trợ tiếng Việt)
pub fn levenshtein(a: &str, b: &str) -> usize {
    let a_chars: Vec<char> = a.chars().collect();
    let b_chars: Vec<char> = b.chars().collect();
    let m = a_chars.len();
    let n = b_chars.len();

    if m == 0 {
        return n;
    }
    if n == 0 {
        return m;
    }

    let mut dp = vec![vec![0usize; n + 1]; m + 1];

    for i in 0..=m {
        dp[i][0] = i;
    }
    for j in 0..=n {
        dp[0][j] = j;
    }

    for i in 1..=m {
        for j in 1..=n {
            let cost = if a_chars[i - 1] == b_chars[j - 1] { 0 } else { 1 };
            dp[i][j] = (dp[i - 1][j] + 1)
                .min(dp[i][j - 1] + 1)
                .min(dp[i - 1][j - 1] + cost);
        }
    }

    dp[m][n]
}

// Chấm điểm số học kèm khoảng sai số (tolerance)
pub fn grade_number(input: &str, answers: &[&str], tol: f64) -> GradeResult {
    let parsed_input: Result<f64, _> = input.trim().parse();
    let x = match parsed_input {
        Ok(val) => val,
        Err(_) => return GradeResult { ok: false, near: false },
    };

    let ok = answers.iter().any(|&a| {
        if let Ok(target) = a.trim().parse::<f64>() {
            (target - x).abs() <= tol
        } else {
            false
        }
    });

    GradeResult { ok, near: false }
}

// Chuẩn hoá công thức LaTeX
pub fn normalize_latex(s: &str) -> String {
    s.replace("\\left", "")
        .replace("\\right", "")
        .replace("\\dfrac", "\\frac")
        .replace("\\tfrac", "\\frac")
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect()
}

// Chấm điểm LaTeX
pub fn grade_latex(input: &str, answers: &[&str]) -> GradeResult {
    let norm_input = normalize_latex(input);
    let ok = answers.iter().any(|&a| normalize_latex(a) == norm_input);
    GradeResult { ok, near: false }
}

// Chấm điểm trắc nghiệm (đơn hoặc nhiều lựa chọn, không phân biệt thứ tự)
pub fn grade_choices(selected: &[i64], correct: &[i64]) -> GradeResult {
    let set_a: BTreeSet<i64> = selected.iter().copied().collect();
    let set_b: BTreeSet<i64> = correct.iter().copied().collect();
    GradeResult {
        ok: set_a == set_b,
        near: false,
    }
}

// Chấm điểm văn bản thông minh (Exact, Regex, Number, LaTeX, Normalized kèm dung sai Levenshtein)
pub fn grade_text(
    input: &str,
    answers: &[&str],
    mode: &str,
    tolerance: Option<f64>,
) -> GradeResult {
    let raw_input = input.trim();

    if mode == "exact" {
        return GradeResult {
            ok: answers.iter().any(|&a| a == raw_input),
            near: false,
        };
    }

    if mode == "regex" {
        let normalized = normalize_text(raw_input);
        let ok = answers.iter().any(|&r| {
            if let Ok(re) = Regex::new(r) {
                re.is_match(&normalized)
            } else {
                false
            }
        });
        return GradeResult { ok, near: false };
    }

    if mode == "number" {
        let tol = tolerance.unwrap_or(1e-9);
        return grade_number(raw_input, answers, tol);
    }

    if mode == "latex" {
        return grade_latex(raw_input, answers);
    }

    // Mặc định: normalized (không phân biệt hoa thường, khoảng trắng, và cho phép sai 1-2 ký tự typo)
    let x = normalize_text(raw_input).to_lowercase();
    let normalized_answers: Vec<String> = answers
        .iter()
        .map(|a| normalize_text(a).to_lowercase())
        .collect();

    // Khớp chính xác hoàn toàn sau khi chuẩn hoá
    if normalized_answers.contains(&x) {
        return GradeResult { ok: true, near: false };
    }

    if x.is_empty() {
        return GradeResult { ok: false, near: false };
    }

    // Dung sai Levenshtein: từ dài cho phép sai 1-2 ký tự (gần đúng - near)
    for a in &normalized_answers {
        let max_len = x.chars().count().max(a.chars().count());
        let max_d = if max_len >= 9 {
            2
        } else if max_len >= 5 {
            1
        } else {
            0
        };

        if max_d > 0 && levenshtein(a, &x) <= max_d {
            return GradeResult { ok: true, near: true };
        }
    }

    GradeResult { ok: false, near: false }
}
