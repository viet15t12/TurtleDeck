// src-tauri/src/services/remote_server/protocol.rs — Giao thức dữ liệu trao đổi giữa Laptop và Điện thoại
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthRequest {
    pub pin: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthResponse {
    pub success: bool,
    pub token: Option<String>,
    pub message: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteChoice {
    pub id: String,
    pub text: String,
    #[serde(default)]
    pub selected: bool,
    #[serde(default, alias = "isCorrect")]
    pub is_correct: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteState {
    #[serde(default, alias = "sessionActive")]
    pub session_active: bool,
    #[serde(default)]
    pub mode: String,
    #[serde(default)]
    pub index: usize,
    #[serde(default)]
    pub total: usize,
    #[serde(default)]
    pub kind: String, // 'single', 'multi', 'card', etc.
    #[serde(default, alias = "promptSummary")]
    pub prompt_summary: Option<String>,
    #[serde(default)]
    pub choices: Vec<RemoteChoice>,
    #[serde(default)]
    pub submitted: bool,
    #[serde(default, alias = "cardFlipped")]
    pub card_flipped: bool,
    #[serde(default)]
    pub explanation: Option<String>,
    #[serde(default, alias = "isCorrect")]
    pub is_correct: Option<bool>,
}

impl Default for RemoteState {
    fn default() -> Self {
        Self {
            session_active: false,
            mode: "idle".to_string(),
            index: 0,
            total: 0,
            kind: String::new(),
            prompt_summary: None,
            choices: Vec::new(),
            submitted: false,
            card_flipped: false,
            explanation: None,
            is_correct: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteAction {
    pub action: String, // "SELECT_CHOICE", "SUBMIT", "NEXT", "PREV", "FLIP", "RATE_SRS"
    #[serde(default)]
    pub payload: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteServerInfo {
    pub running: bool,
    pub port: u16,
    pub pin: String,
    pub lan_ips: Vec<String>,
    pub url: String,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_auth_request_serialization() {
        let req = AuthRequest {
            pin: "1234".to_string(),
        };
        let json = serde_json::to_string(&req).expect("serialize");
        assert_eq!(json, "{\"pin\":\"1234\"}");

        let deserialized: AuthRequest = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(deserialized.pin, "1234");
    }

    #[test]
    fn test_remote_state_defaults() {
        let state = RemoteState::default();
        assert!(!state.session_active);
        assert_eq!(state.mode, "idle");
        assert!(!state.submitted);
        assert!(!state.card_flipped);
    }

    #[test]
    fn test_remote_action_parsing() {
        let json = r#"{"action":"SELECT_CHOICE","payload":{"optionId":"B"}}"#;
        let action: RemoteAction = serde_json::from_str(json).expect("parse action");
        assert_eq!(action.action, "SELECT_CHOICE");
        assert_eq!(action.payload["optionId"], "B");
    }
}
