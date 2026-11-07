use serde_json::json;
use turtle_deck_lib::db::repositories::srs::{SrsCard, DAY_MS};
use turtle_deck_lib::srs::adaptive_planner::{plan_adaptive_session, PlannerConfig};

#[test]
fn test_adaptive_planner_prioritizes_low_retrievability_and_lapses() {
    let now = 1_700_000_000_000i64;

    let items = vec![
        json!({ "id": "item-high-r", "term": "apple", "definition": "quả táo" }),
        json!({ "id": "item-low-r", "term": "banana", "definition": "quả chuối" }),
        json!({ "id": "item-high-lapse", "term": "orange", "definition": "quả cam" }),
        json!({ "id": "item-new", "term": "grape", "definition": "quả nho" }),
    ];

    let cards = vec![
        // item-high-r: ôn gần đây, R cao (~0.95), do due chỉ mới tới
        SrsCard {
            deck_id: Some("d1".to_string()),
            item_id: Some("item-high-r".to_string()),
            direction: Some("fwd".to_string()),
            state: "review".to_string(),
            step: 0,
            ease: 2.5,
            interval: 20,
            due: now,
            reps: 5,
            lapses: 0,
            updated_at: Some(now - 10 * DAY_MS),
            stability: Some(30.0), // S lớn -> R cao
            difficulty: Some(4.0),
            last_review: Some(now - 10 * DAY_MS),
        },
        // item-low-r: quá hạn nhiều, R rất thấp (< 0.6)
        SrsCard {
            deck_id: Some("d1".to_string()),
            item_id: Some("item-low-r".to_string()),
            direction: Some("fwd".to_string()),
            state: "review".to_string(),
            step: 0,
            ease: 2.5,
            interval: 5,
            due: now - 15 * DAY_MS,
            reps: 2,
            lapses: 1,
            updated_at: Some(now - 20 * DAY_MS),
            stability: Some(5.0), // S nhỏ nhưng elapsed 20 ngày -> R rất thấp
            difficulty: Some(6.0),
            last_review: Some(now - 20 * DAY_MS),
        },
        // item-high-lapse: nhiều lần quên (lapses = 4)
        SrsCard {
            deck_id: Some("d1".to_string()),
            item_id: Some("item-high-lapse".to_string()),
            direction: Some("fwd".to_string()),
            state: "review".to_string(),
            step: 0,
            ease: 2.0,
            interval: 3,
            due: now - 1 * DAY_MS,
            reps: 6,
            lapses: 4,
            updated_at: Some(now - 4 * DAY_MS),
            stability: Some(4.0),
            difficulty: Some(7.5),
            last_review: Some(now - 4 * DAY_MS),
        },
    ];

    let config = PlannerConfig {
        deck_id: Some("d1".to_string()),
        deck_kind: Some("vocab".to_string()),
        mode: Some("srs".to_string()),
        direction: Some("fwd".to_string()),
        new_cards_per_day: 10,
        target_retention: 0.9,
        max_count: Some(10),
        min_gap: 2,
        seed: Some(42),
    };

    let planned = plan_adaptive_session(&items, &cards, &config, now);

    assert_eq!(planned.len(), 4);
    // Thẻ sắp quên (item-low-r) hoặc hay sai (item-high-lapse) phải được xếp trước thẻ có R cao (item-high-r)
    let first_id = &planned[0].item_id;
    assert!(
        first_id == "item-low-r" || first_id == "item-high-lapse",
        "Top priority must be low retention or high lapses, got: {first_id}"
    );

    let low_r_pos = planned.iter().position(|p| p.item_id == "item-low-r").unwrap();
    let high_r_pos = planned.iter().position(|p| p.item_id == "item-high-r").unwrap();
    assert!(low_r_pos < high_r_pos, "low R must come before high R");
}

#[test]
fn test_adaptive_planner_interleaving_and_minimum_gap() {
    let now = 1_700_000_000_000i64;

    // Bộ thẻ 2 chiều (both): mỗi từ có cả fwd và rev
    let items = vec![
        json!({ "id": "t1", "term": "dog", "definition": "chó" }),
        json!({ "id": "t2", "term": "cat", "definition": "mèo" }),
        json!({ "id": "t3", "term": "bird", "definition": "chim" }),
        json!({ "id": "t4", "term": "fish", "definition": "cá" }),
    ];

    let config = PlannerConfig {
        deck_id: Some("d1".to_string()),
        deck_kind: Some("vocab".to_string()),
        mode: Some("srs".to_string()),
        direction: Some("both".to_string()),
        new_cards_per_day: 10,
        target_retention: 0.9,
        max_count: Some(8),
        min_gap: 2,
        seed: Some(123),
    };

    let planned = plan_adaptive_session(&items, &[], &config, now);
    assert_eq!(planned.len(), 8); // 4 mục * 2 chiều = 8 thẻ

    // Kiểm tra không có 2 thẻ cùng item_id đứng cách nhau < min_gap
    for i in 0..planned.len() {
        for j in (i + 1)..planned.len() {
            if planned[i].item_id == planned[j].item_id {
                let distance = j - i;
                assert!(
                    distance >= 2,
                    "Cards with same item_id '{id}' are too close (distance {distance} < 2) at index {i} and {j}",
                    id = planned[i].item_id
                );
            }
        }
    }
}
