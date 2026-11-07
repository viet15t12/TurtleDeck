use turtle_deck_lib::srs::fsrs::{calculate_interval, retrievability, schedule_fsrs};
use turtle_deck_lib::db::repositories::srs::{SrsCard, DAY_MS};

#[test]
fn test_fsrs_initial_ratings_for_new_card() {
    let now = 1_700_000_000_000; // ms
    let card = SrsCard::default();

    // Again (1)
    let card_again = schedule_fsrs(&card, 1, now, 0.9, false);
    assert_eq!(card_again.state, "learning");
    assert!(card_again.stability.unwrap() > 0.0);
    assert!(card_again.difficulty.unwrap() >= 1.0 && card_again.difficulty.unwrap() <= 10.0);

    // Good (3)
    let card_good = schedule_fsrs(&card, 3, now, 0.9, false);
    assert_eq!(card_good.state, "review");
    assert!(card_good.stability.unwrap() > card_again.stability.unwrap());
    assert!(card_good.interval >= 1);
    assert!(card_good.due > now);

    // Easy (4)
    let card_easy = schedule_fsrs(&card, 4, now, 0.9, false);
    assert_eq!(card_easy.state, "review");
    assert!(card_easy.stability.unwrap() > card_good.stability.unwrap());
    assert!(card_easy.interval > card_good.interval);
}

#[test]
fn test_fsrs_retrievability_decay() {
    let stability = 10.0; // 10 days
    // At t = 0, R = 1.0
    let r0 = retrievability(0.0, stability);
    assert!((r0 - 1.0).abs() < 1e-4);

    // At t = S = 10 days, R should be exactly 0.9 (90% target retention definition)
    let r_10 = retrievability(10.0, stability);
    assert!((r_10 - 0.9).abs() < 1e-3);

    // As t increases, R decays
    let r_30 = retrievability(30.0, stability);
    assert!(r_30 < 0.9);
    assert!(r_30 > 0.0);
}

#[test]
fn test_fsrs_interval_formula() {
    let stability = 15.0;
    // Target retention 0.9 => interval is roughly stability (15 days)
    let interval = calculate_interval(stability, 0.9);
    assert_eq!(interval, 15);

    // Lower desired retention (e.g. 0.8) allows longer intervals
    let interval_low_retention = calculate_interval(stability, 0.8);
    assert!(interval_low_retention > interval);
}

#[test]
fn test_fsrs_review_progression() {
    let now = 1_700_000_000_000;
    let card = SrsCard {
        deck_id: Some("test_deck".to_string()),
        item_id: Some("item_1".to_string()),
        direction: Some("fwd".to_string()),
        state: "review".to_string(),
        step: 0,
        ease: 2.5,
        interval: 10,
        due: now,
        reps: 2,
        lapses: 0,
        updated_at: Some(now - 10 * DAY_MS),
        stability: Some(10.0),
        difficulty: Some(5.0),
        last_review: Some(now - 10 * DAY_MS),
    };

    // Review Good (3)
    let next_good = schedule_fsrs(&card, 3, now, 0.9, false);
    assert_eq!(next_good.state, "review");
    assert!(next_good.stability.unwrap() > 10.0, "Stability should increase on Good");
    assert!(next_good.interval > 10, "Interval should increase on Good");
    assert_eq!(next_good.reps, 3);
    assert_eq!(next_good.lapses, 0);

    // Review Again (1) -> Lapses and Stability drop
    let next_again = schedule_fsrs(&card, 1, now, 0.9, false);
    assert_eq!(next_again.state, "relearning");
    assert!(next_again.stability.unwrap() < 10.0, "Stability should drop on Again");
    assert_eq!(next_again.lapses, 1);
    assert!(next_again.difficulty.unwrap() > card.difficulty.unwrap(), "Difficulty increases on Again");
}
