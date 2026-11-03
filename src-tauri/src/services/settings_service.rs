// src-tauri/src/services/settings_service.rs — Quản lý nạp và lưu file cài đặt (settings.json)
use crate::error::{AppError, AppResult};
use serde_json::Value;
use std::fs;
use std::path::Path;

pub fn normalize_settings(raw: Value) -> Value {
    let mut base = match raw {
        Value::Object(map) => map,
        _ => serde_json::Map::new(),
    };

    // Ensure version: 1
    base.insert("version".to_string(), Value::Number(1.into()));

    // Ensure decks: array of strings
    let decks = base
        .get("decks")
        .and_then(|d| d.as_array())
        .map(|arr| {
            arr.iter()
                .filter_map(|item| item.as_str().map(|s| Value::String(s.to_string())))
                .collect()
        })
        .unwrap_or_else(Vec::new);
    base.insert("decks".to_string(), Value::Array(decks));

    // Ensure newCardsPerDay: >= 0 integer
    let new_cards_per_day = base
        .get("newCardsPerDay")
        .and_then(|v| v.as_i64())
        .unwrap_or(20)
        .max(0);
    base.insert(
        "newCardsPerDay".to_string(),
        Value::Number(new_cards_per_day.into()),
    );

    // Ensure learnSteps: array of numbers
    let learn_steps = base
        .get("learnSteps")
        .and_then(|v| {
            if let Some(arr) = v.as_array() {
                let nums: Vec<Value> = arr
                    .iter()
                    .filter_map(|item| {
                        item.as_i64()
                            .filter(|&n| n > 0)
                            .map(|n| Value::Number(n.into()))
                    })
                    .collect();
                if !nums.is_empty() {
                    Some(nums)
                } else {
                    None
                }
            } else if let Some(s) = v.as_str() {
                let nums: Vec<Value> = s
                    .split(|c: char| c == ',' || c == ';' || c.is_whitespace())
                    .filter_map(|part| part.trim().parse::<i64>().ok())
                    .filter(|&n| n > 0)
                    .map(|n| Value::Number(n.into()))
                    .collect();
                if !nums.is_empty() {
                    Some(nums)
                } else {
                    None
                }
            } else {
                None
            }
        })
        .unwrap_or_else(|| vec![Value::Number(1.into()), Value::Number(10.into())]);

    base.insert("learnSteps".to_string(), Value::Array(learn_steps));

    Value::Object(base)
}

pub fn load_settings(settings_file: &Path) -> Value {
    if !settings_file.exists() {
        return normalize_settings(Value::Null);
    }

    match fs::read_to_string(settings_file) {
        Ok(text) => match serde_json::from_str::<Value>(&text) {
            Ok(val) => normalize_settings(val),
            Err(_) => {
                let corrupt_bak = settings_file.with_extension("json.corrupt.bak");
                let _ = fs::copy(settings_file, corrupt_bak);
                normalize_settings(Value::Null)
            }
        },
        Err(_) => normalize_settings(Value::Null),
    }
}

pub fn save_settings(settings_file: &Path, patch: &Value) -> AppResult<Value> {
    if !patch.is_object() {
        return Err(AppError::Custom("Dữ liệu cài đặt không hợp lệ.".into()));
    }

    if let Some(parent) = settings_file.parent() {
        fs::create_dir_all(parent)?;
    }

    let current = load_settings(settings_file);
    let mut current_map = match current {
        Value::Object(m) => m,
        _ => serde_json::Map::new(),
    };

    if let Some(patch_map) = patch.as_object() {
        for (k, v) in patch_map {
            current_map.insert(k.clone(), v.clone());
        }
    }

    let normalized = normalize_settings(Value::Object(current_map));
    let content = serde_json::to_string_pretty(&normalized)?;

    // Ghi nguyên tử bằng file tạm
    let temp_file = settings_file.with_extension("json.tmp");
    fs::write(&temp_file, content)?;
    fs::rename(&temp_file, settings_file)?;

    Ok(serde_json::json!({ "ok": true, "settings": normalized }))
}
