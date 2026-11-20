// src-tauri/src/models/deck.rs — Định nghĩa cấu trúc Deck, DeckMeta, TranslationOverride hỗ trợ đa ngôn ngữ
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

/// Enum untagged hỗ trợ đọc cả chuỗi "vi" lẫn mảng ["en", "vi"]
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(untagged)]
pub enum DeckLang {
    Single(String),
    Multiple(Vec<String>),
}

impl DeckLang {
    pub fn to_vec(&self) -> Vec<String> {
        match self {
            DeckLang::Single(s) => {
                let trimmed = s.trim().to_lowercase();
                if trimmed.is_empty() {
                    vec!["vi".to_string()]
                } else {
                    vec![trimmed]
                }
            }
            DeckLang::Multiple(arr) => {
                let mut res = Vec::new();
                for item in arr {
                    let trimmed = item.trim().to_lowercase();
                    if !trimmed.is_empty() && !res.contains(&trimmed) {
                        res.push(trimmed);
                    }
                }
                if res.is_empty() {
                    vec!["vi".to_string()]
                } else {
                    res
                }
            }
        }
    }

    pub fn primary_lang(&self) -> String {
        self.to_vec()
            .into_iter()
            .next()
            .unwrap_or_else(|| "vi".to_string())
    }
}

/// Các trường dịch được ghi đè ở mỗi item
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct TranslationOverride {
    pub front: Option<String>,
    pub back: Option<String>,
    pub question: Option<String>,
    pub choices: Option<Value>,
    pub explanation: Option<String>,
    #[serde(rename = "answerDisplay")]
    pub answer_display: Option<String>,
    pub answer: Option<Value>,
    pub term: Option<String>,
    pub definition: Option<String>,
    pub example: Option<String>,
    pub phonetic: Option<String>,
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DeckMetaModel {
    pub id: String,
    pub title: Option<String>,
    pub kind: Option<String>,
    pub lang: Option<DeckLang>,
    pub description: Option<String>,
    pub created: Option<i64>,
    pub updated: Option<i64>,
    #[serde(rename = "totalItems")]
    pub total_items: Option<usize>,
    #[serde(rename = "formatVersion")]
    pub format_version: Option<u32>,
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DeckItemModel {
    pub id: String,
    #[serde(rename = "type")]
    pub item_type: Option<String>,
    pub topic: Option<String>,
    pub tags: Option<Vec<String>>,
    pub explanation: Option<String>,
    pub image: Option<String>,
    #[serde(rename = "answerImage")]
    pub answer_image: Option<String>,
    pub starred: Option<bool>,
    pub note: Option<String>,
    pub translations: Option<HashMap<String, TranslationOverride>>,
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DeckModel {
    pub meta: DeckMetaModel,
    pub items: Vec<DeckItemModel>,
    #[serde(rename = "formatVersion")]
    pub format_version: Option<u32>,
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

impl DeckModel {
    /// Kiểm tra xem bộ thẻ có sử dụng tính năng đa ngôn ngữ mới (formatVersion 2) hay không
    pub fn has_multi_language_feature(&self) -> bool {
        if let Some(ref l) = self.meta.lang {
            if l.to_vec().len() > 1 {
                return true;
            }
        }
        for item in &self.items {
            if let Some(ref trans) = item.translations {
                if !trans.is_empty() {
                    return true;
                }
            }
        }
        false
    }
}
