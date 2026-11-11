// src-tauri/src/services/sdeck_v2/solutions.rs — Quản lý cấu trúc dữ liệu và xử lý tệp solutions.json
// Trách nhiệm duy nhất: Tách và ghép lời giải / đáp án đúng khỏi nội dung câu hỏi phục vụ bảo mật và tối ưu tải dữ liệu.

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;

pub const SOLUTIONS_ENTRY: &str = "solutions.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct SolutionItem {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub answer: Option<Value>,
    #[serde(rename = "answerDisplay", skip_serializing_if = "Option::is_none")]
    pub answer_display: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub explanation: Option<String>,
    #[serde(rename = "explanationImage", skip_serializing_if = "Option::is_none")]
    pub explanation_image: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct SolutionsFile {
    pub version: u32,
    pub solutions: HashMap<String, SolutionItem>,
}

/// Tách items v1 thành danh sách câu hỏi sạch (lưu CSDL) và solutions.json (đáp án & lời giải)
pub fn split_v1_items_to_v2(items: &[Value]) -> (Vec<Value>, SolutionsFile) {
    let mut clean_items = Vec::with_capacity(items.len());
    let mut solutions_map = HashMap::new();

    for it in items {
        let mut clean_it = it.clone();
        let item_id = it
            .get("id")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        let answer = clean_it.as_object_mut().and_then(|m| m.remove("answer"));
        let answer_display = clean_it
            .as_object_mut()
            .and_then(|m| m.remove("answerDisplay"))
            .and_then(|v| v.as_str().map(|s| s.to_string()));
        let explanation = clean_it
            .as_object_mut()
            .and_then(|m| m.remove("explanation"))
            .and_then(|v| v.as_str().map(|s| s.to_string()));
        let explanation_image = clean_it
            .as_object_mut()
            .and_then(|m| m.remove("explanationImage"))
            .and_then(|v| v.as_str().map(|s| s.to_string()));

        if !item_id.is_empty()
            && (answer.is_some()
                || explanation.is_some()
                || answer_display.is_some()
                || explanation_image.is_some())
        {
            solutions_map.insert(
                item_id,
                SolutionItem {
                    answer,
                    answer_display,
                    explanation,
                    explanation_image,
                },
            );
        }

        clean_items.push(clean_it);
    }

    (
        clean_items,
        SolutionsFile {
            version: 1,
            solutions: solutions_map,
        },
    )
}

/// Ghép nối câu hỏi (từ SQLite) và lời giải (từ solutions.json) thành cấu trúc thống nhất
pub fn merge_v2_to_unified_items(db_items: Vec<Value>, solutions: &SolutionsFile) -> Vec<Value> {
    db_items
        .into_iter()
        .map(|mut it| {
            if let Some(id) = it.get("id").and_then(|v| v.as_str()) {
                if let Some(sol) = solutions.solutions.get(id) {
                    if let Some(obj) = it.as_object_mut() {
                        if let Some(ans) = &sol.answer {
                            obj.insert("answer".to_string(), ans.clone());
                        }
                        if let Some(ad) = &sol.answer_display {
                            obj.insert("answerDisplay".to_string(), json!(ad));
                        }
                        if let Some(exp) = &sol.explanation {
                            obj.insert("explanation".to_string(), json!(exp));
                        }
                        if let Some(img) = &sol.explanation_image {
                            obj.insert("explanationImage".to_string(), json!(img));
                        }
                    }
                }
            }
            it
        })
        .collect()
}
