use serde_json::json;
use turtle_deck_lib::db::open_in_memory;
use turtle_deck_lib::db::repositories::deck::DeckRepository;
use turtle_deck_lib::db::repositories::srs::SrsRepository;
use turtle_deck_lib::srs::adaptive_planner::{plan_adaptive_session, PlannerConfig};
use turtle_deck_lib::srs::fsrs::schedule_fsrs;

#[test]
fn test_srs_plan_and_review_flow_in_rust() {
    let mut conn = open_in_memory().unwrap();

    let deck = json!({
        "meta": { "id": "deck-test", "title": "Test Deck", "kind": "vocab" },
        "items": [
            { "id": "it-1", "type": "vocab", "term": "run", "definition": "chạy" },
            { "id": "it-2", "type": "vocab", "term": "walk", "definition": "đi bộ" },
            { "id": "it-3", "type": "vocab", "term": "jump", "definition": "nhảy" },
        ]
    });
    DeckRepository::sync_deck(&mut conn, &deck, Some("/fake/deck-test.sdeck")).unwrap();

    let now = 1_700_000_000_000i64;
    let config = PlannerConfig {
        deck_id: Some("deck-test".to_string()),
        deck_kind: Some("vocab".to_string()),
        mode: Some("srs".to_string()),
        direction: Some("both".to_string()),
        new_cards_per_day: 10,
        target_retention: 0.9,
        max_count: Some(6),
        min_gap: 2,
        seed: None,
    };

    let items = DeckRepository::get_items(&conn, "deck-test").unwrap();
    let cards = SrsRepository::get_deck_cards(&conn, "deck-test").unwrap();

    // 1. Lập lịch phiên học (Adaptive Plan)
    let planned = plan_adaptive_session(&items, &cards, &config, now);
    assert_eq!(planned.len(), 6);
    assert!(
        planned[0].question.is_some(),
        "Question should be pre-built by Rust"
    );
    let q = planned[0].question.as_ref().unwrap();
    assert!(!q.prompt.is_empty());

    // 2. Thực hiện review câu đầu tiên bằng FSRS (Good = 3)
    let first = &planned[0];
    let next_card = schedule_fsrs(&first.card, 3, now, 0.9, false);
    assert_eq!(next_card.state, "review");
    assert!(next_card.stability.unwrap() > 0.0);

    SrsRepository::record_review(&mut conn, &next_card, 3, now, 1200, true).unwrap();

    // 3. Kiểm tra DB đã cập nhật thẻ với FSRS
    let saved = SrsRepository::get_card(&conn, "deck-test", &first.item_id, &first.direction)
        .unwrap()
        .expect("Card must be in DB");
    assert_eq!(saved.state, "review");
    assert!(saved.stability.unwrap() > 0.0);
    assert!(saved.interval >= 1);
}
