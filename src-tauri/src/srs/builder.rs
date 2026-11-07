// src-tauri/src/srs/builder.rs — Dựng câu hỏi thống nhất và thuật toán chọn đáp án nhiễu (Distractors) trong Rust
use crate::srs::grader::{levenshtein, normalize_text};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashSet;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuilderOptions {
    pub count: usize,
    pub seed: Option<u64>,
}

impl Default for BuilderOptions {
    fn default() -> Self {
        Self {
            count: 4,
            seed: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuiltQuestion {
    pub id: String,
    pub kind: String, // "single", "multi", "fill", "command", "card"
    pub prompt: String,
    pub choices: Option<Vec<String>>,
    pub answers: Option<Vec<String>>,
    pub direction: String,
    pub explanation: Option<String>,
    pub topic: Option<String>,
    pub tags: Option<Vec<String>>,
    pub phonetic: Option<String>,
    pub image: Option<String>,
    pub answer_image: Option<String>,
}

fn pseudo_shuffle<T>(items: &mut [T], seed: u64) {
    if items.len() <= 1 {
        return;
    }
    let mut state = seed.wrapping_add(0x9e3779b97f4a7c15);
    for i in (1..items.len()).rev() {
        state = state.wrapping_mul(6364136223846793005).wrapping_add(1);
        let j = ((state >> 33) as usize) % (i + 1);
        items.swap(i, j);
    }
}

pub fn build_mc(
    item: &Value,
    all_items: &[Value],
    dir: &str,
    options: &BuilderOptions,
) -> Option<BuiltQuestion> {
    let item_id = item.get("id").and_then(|v| v.as_str())?;
    let term = item.get("term").and_then(|v| v.as_str()).unwrap_or("");
    let definition = item.get("definition").and_then(|v| v.as_str()).unwrap_or("");

    if term.is_empty() || definition.is_empty() {
        return None;
    }

    let is_fwd = dir == "fwd";
    let prompt = if is_fwd { term } else { definition };
    let correct_answer = if is_fwd { definition } else { term };
    let norm_correct = normalize_text(correct_answer).to_lowercase();

    if norm_correct.is_empty() {
        return None;
    }

    let target_key = if is_fwd { "definition" } else { "term" };
    let item_pos = item
        .get("pos")
        .and_then(|v| v.as_str())
        .map(|p| normalize_text(p).to_lowercase());

    let item_tags: HashSet<String> = item
        .get("tags")
        .and_then(|v| v.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|t| t.as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();

    let mut group_pos = Vec::new();
    let mut group_tag = Vec::new();
    let mut group_other = Vec::new();

    let max_d = if norm_correct.chars().count() >= 8 { 2 } else { 1 };

    for cand in all_items {
        let _cand_id = match cand.get("id").and_then(|v| v.as_str()) {
            Some(id) if id != item_id => id,
            _ => continue,
        };

        let cand_target = match cand.get(target_key).and_then(|v| v.as_str()) {
            Some(t) if !t.is_empty() => t,
            _ => continue,
        };

        let norm_cand = normalize_text(cand_target).to_lowercase();
        if norm_cand == norm_correct || norm_cand.is_empty() {
            continue;
        }

        // Loại bỏ các đáp án quá giống nhau (tránh bẫy nhầm đáp án gõ sai)
        let d = levenshtein(&norm_cand, &norm_correct);
        if d <= max_d {
            continue;
        }

        let cand_pos = cand
            .get("pos")
            .and_then(|v| v.as_str())
            .map(|p| normalize_text(p).to_lowercase());

        let has_shared_tag = cand
            .get("tags")
            .and_then(|v| v.as_array())
            .map(|arr| {
                arr.iter().any(|t| {
                    t.as_str()
                        .map(|s| item_tags.contains(s))
                        .unwrap_or(false)
                })
            })
            .unwrap_or(false);

        if item_pos.is_some() && item_pos == cand_pos {
            group_pos.push(cand_target.to_string());
        } else if has_shared_tag {
            group_tag.push(cand_target.to_string());
        } else {
            group_other.push(cand_target.to_string());
        }
    }

    let seed = options.seed.unwrap_or(12345);
    pseudo_shuffle(&mut group_pos, seed);
    pseudo_shuffle(&mut group_tag, seed.wrapping_add(1));
    pseudo_shuffle(&mut group_other, seed.wrapping_add(2));

    let mut chosen_distractors: Vec<String> = Vec::new();
    let mut seen_norm = HashSet::new();
    seen_norm.insert(norm_correct);

    for cand_text in group_pos.into_iter().chain(group_tag).chain(group_other) {
        let n = normalize_text(&cand_text).to_lowercase();
        if !seen_norm.contains(&n) {
            seen_norm.insert(n);
            chosen_distractors.push(cand_text);
            if chosen_distractors.len() >= options.count.saturating_sub(1) {
                break;
            }
        }
    }

    let mut total_choices = vec![correct_answer.to_string()];
    total_choices.extend(chosen_distractors);

    if total_choices.len() < 2 {
        return None;
    }

    pseudo_shuffle(&mut total_choices, seed.wrapping_add(3));
    let correct_idx = total_choices
        .iter()
        .position(|c| c == correct_answer)
        .unwrap_or(0);

    let explanation = item.get("example").and_then(|v| v.as_str()).map(|ex| {
        format!("*Ví dụ:* {ex}")
    }).or_else(|| {
        item.get("explanation").and_then(|v| v.as_str()).map(|e| e.to_string())
    });

    let phonetic = item.get("phonetic").and_then(|v| v.as_str()).map(|s| s.to_string());
    let topic = item.get("pos").and_then(|v| v.as_str()).map(|s| s.to_string());
    let image = if is_fwd {
        item.get("image").and_then(|v| v.as_str()).map(|s| s.to_string())
    } else {
        None
    };

    Some(BuiltQuestion {
        id: item_id.to_string(),
        kind: "single".to_string(),
        prompt: prompt.to_string(),
        choices: Some(total_choices),
        answers: Some(vec![correct_idx.to_string()]),
        direction: dir.to_string(),
        explanation,
        topic,
        tags: item.get("tags").and_then(|t| serde_json::from_value(t.clone()).ok()),
        phonetic,
        image,
        answer_image: None,
    })
}

pub fn build_write(item: &Value, dir: &str) -> Option<BuiltQuestion> {
    let item_id = item.get("id").and_then(|v| v.as_str())?;
    let term = item.get("term").and_then(|v| v.as_str()).unwrap_or("");
    let definition = item.get("definition").and_then(|v| v.as_str()).unwrap_or("");

    if term.is_empty() || definition.is_empty() {
        return None;
    }

    let is_rev = dir == "rev";
    let (prompt, answers) = if is_rev {
        (definition.to_string(), vec![term.to_string()])
    } else {
        let mut ans_list = vec![definition.to_string()];
        for part in definition.split(';') {
            let trimmed = part.trim();
            if !trimmed.is_empty() && !ans_list.contains(&trimmed.to_string()) {
                ans_list.push(trimmed.to_string());
            }
        }
        (term.to_string(), ans_list)
    };

    Some(BuiltQuestion {
        id: item_id.to_string(),
        kind: "fill".to_string(),
        prompt,
        choices: None,
        answers: Some(answers),
        direction: dir.to_string(),
        explanation: item.get("explanation").and_then(|v| v.as_str()).map(|s| s.to_string()),
        topic: item.get("pos").and_then(|v| v.as_str()).map(|s| s.to_string()),
        tags: item.get("tags").and_then(|t| serde_json::from_value(t.clone()).ok()),
        phonetic: item.get("phonetic").and_then(|v| v.as_str()).map(|s| s.to_string()),
        image: item.get("image").and_then(|v| v.as_str()).map(|s| s.to_string()),
        answer_image: None,
    })
}

pub fn build_flashcard(item: &Value, dir: &str) -> Option<BuiltQuestion> {
    let item_id = item.get("id").and_then(|v| v.as_str())?;
    let is_vocab = item.get("type").and_then(|v| v.as_str()) == Some("vocab");
    let is_fwd = dir == "fwd";

    let (front, back) = if is_vocab {
        let t = item.get("term").and_then(|v| v.as_str()).unwrap_or("");
        let d = item.get("definition").and_then(|v| v.as_str()).unwrap_or("");
        if is_fwd { (t, d) } else { (d, t) }
    } else {
        let f = item.get("front").and_then(|v| v.as_str()).unwrap_or("");
        let b = item.get("back").and_then(|v| v.as_str()).unwrap_or("");
        if is_fwd { (f, b) } else { (b, f) }
    };

    Some(BuiltQuestion {
        id: item_id.to_string(),
        kind: "card".to_string(),
        prompt: front.to_string(),
        choices: None,
        answers: None,
        direction: dir.to_string(),
        explanation: Some(back.to_string()),
        topic: item.get("topic").or_else(|| item.get("pos")).and_then(|v| v.as_str()).map(|s| s.to_string()),
        tags: item.get("tags").and_then(|t| serde_json::from_value(t.clone()).ok()),
        phonetic: item.get("phonetic").and_then(|v| v.as_str()).map(|s| s.to_string()),
        image: item.get("frontImage").or_else(|| item.get("image")).and_then(|v| v.as_str()).map(|s| s.to_string()),
        answer_image: item.get("backImage").or_else(|| item.get("answerImage")).and_then(|v| v.as_str()).map(|s| s.to_string()),
    })
}

pub fn build_question(
    item: &Value,
    dir: &str,
    mode: &str,
    all_items: &[Value],
    options: &BuilderOptions,
) -> Option<BuiltQuestion> {
    let item_type = item.get("type").and_then(|v| v.as_str()).unwrap_or("vocab");

    if item_type == "vocab" {
        if mode == "mc" {
            return build_mc(item, all_items, dir, options);
        } else if mode == "write" {
            return build_write(item, dir);
        } else {
            return build_flashcard(item, dir);
        }
    }

    if item_type == "card" {
        return build_flashcard(item, dir);
    }

    let item_id = item.get("id").and_then(|v| v.as_str())?;
    let prompt = item.get("question").and_then(|v| v.as_str()).unwrap_or("");

    let choices: Option<Vec<String>> = item.get("choices").and_then(|c| {
        c.as_array().map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                .collect()
        })
    });

    let answers: Option<Vec<String>> = if let Some(ans_arr) = item.get("answer").and_then(|a| a.as_array()) {
        Some(ans_arr.iter().map(|v| v.to_string().trim_matches('"').to_string()).collect())
    } else if let Some(ans_str) = item.get("answer").and_then(|a| a.as_str()) {
        Some(vec![ans_str.to_string()])
    } else {
        None
    };

    Some(BuiltQuestion {
        id: item_id.to_string(),
        kind: item_type.to_string(),
        prompt: prompt.to_string(),
        choices,
        answers,
        direction: dir.to_string(),
        explanation: item.get("explanation").and_then(|v| v.as_str()).map(|s| s.to_string()),
        topic: item.get("topic").and_then(|v| v.as_str()).map(|s| s.to_string()),
        tags: item.get("tags").and_then(|t| serde_json::from_value(t.clone()).ok()),
        phonetic: None,
        image: item.get("image").and_then(|v| v.as_str()).map(|s| s.to_string()),
        answer_image: item.get("answerImage").and_then(|v| v.as_str()).map(|s| s.to_string()),
    })
}
