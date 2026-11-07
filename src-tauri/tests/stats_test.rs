// src-tauri/tests/stats_test.rs — Test thống kê hiệu năng cao & streak qua nửa đêm
use turtle_deck_lib::db::open_in_memory;
use turtle_deck_lib::db::repositories::srs::{SrsCard, SrsRepository};
use turtle_deck_lib::db::repositories::stats::StatsRepository;

#[test]
fn test_stats_overall_streak_across_midnight_in_asia_saigon() {
    let mut conn = open_in_memory().unwrap();

    // 2026-11-01 23:55 UTC+7 = 2026-11-01 16:55:00 UTC = 1793552100000 ms
    // (Lấy mốc UTC chính xác: Date.UTC(2026, 10, 1, 16, 55, 0) = 1793552100000)
    let day1_ts = 1_793_552_100_000i64;
    // 2026-11-02 00:05 UTC+7 = 2026-11-01 17:05:00 UTC = 1793552700000 ms (cách 10 phút, sang ngày mới ở VN)
    let day2_ts = 1_793_552_700_000i64;

    let card = SrsCard {
        deck_id: Some("d1".to_string()),
        item_id: Some("i1".to_string()),
        direction: Some("fwd".to_string()),
        state: "review".to_string(),
        step: 0,
        ease: 2.5,
        interval: 1,
        due: day1_ts + 86_400_000,
        reps: 1,
        lapses: 0,
        updated_at: Some(day1_ts),
        stability: None,
        difficulty: None,
        last_review: None,
    };

    SrsRepository::record_review(&mut conn, &card, 3, day1_ts, 1200, false).unwrap();
    SrsRepository::record_review(&mut conn, &card, 3, day2_ts, 1500, false).unwrap();

    // Bây giờ là trưa ngày 2026-11-02 (2026-11-02 05:00:00 UTC = 1793595600000)
    let now_day2 = 1_793_595_600_000i64;
    let s1 = StatsRepository::get_overall_streak(&conn, Some("Asia/Saigon"), now_day2).unwrap();
    assert_eq!(s1.current_streak, 2);
    assert_eq!(s1.longest_streak, 2);
    assert_eq!(s1.total_reviews, 2);

    // Bây giờ là trưa ngày 2026-11-03 (hôm nay chưa học, nhưng hôm qua đã học)
    let now_day3 = now_day2 + 86_400_000;
    let s2 = StatsRepository::get_overall_streak(&conn, Some("Asia/Saigon"), now_day3).unwrap();
    assert_eq!(s2.current_streak, 2);
    assert_eq!(s2.longest_streak, 2);

    // Bây giờ là trưa ngày 2026-11-04 (đã bỏ cả ngày 3 và hôm nay chưa học -> đứt chuỗi)
    let now_day4 = now_day3 + 86_400_000;
    let s3 = StatsRepository::get_overall_streak(&conn, Some("Asia/Saigon"), now_day4).unwrap();
    assert_eq!(s3.current_streak, 0);
    assert_eq!(s3.longest_streak, 2);
}

#[test]
fn test_stats_daily_activity_retention_and_leeches() {
    let mut conn = open_in_memory().unwrap();

    let now = 1_700_000_000_000i64;
    let card1 = SrsCard {
        deck_id: Some("d1".to_string()),
        item_id: Some("i1".to_string()),
        direction: Some("fwd".to_string()),
        state: "review".to_string(),
        step: 0,
        ease: 2.5,
        interval: 1,
        due: now,
        reps: 10,
        lapses: 9, // Leech!
        updated_at: Some(now),
        stability: None,
        difficulty: None,
        last_review: None,
    };

    let card2 = SrsCard {
        deck_id: Some("d1".to_string()),
        item_id: Some("i2".to_string()),
        direction: Some("fwd".to_string()),
        state: "review".to_string(),
        step: 0,
        ease: 2.5,
        interval: 1,
        due: now,
        reps: 5,
        lapses: 2, // Not a leech (threshold 8)
        updated_at: Some(now),
        stability: None,
        difficulty: None,
        last_review: None,
    };

    SrsRepository::record_review(&mut conn, &card1, 1, now - 86_400_000, 2000, false).unwrap(); // Again
    SrsRepository::record_review(&mut conn, &card1, 3, now, 1500, false).unwrap(); // Good
    SrsRepository::record_review(&mut conn, &card2, 4, now, 800, false).unwrap(); // Easy

    // Retention breakdown: 1 again, 0 hard, 1 good, 1 easy -> total 3, correct 2 -> 67%
    let ret = StatsRepository::get_retention_breakdown(&conn, Some("d1")).unwrap();
    assert_eq!(ret.again, 1);
    assert_eq!(ret.good, 1);
    assert_eq!(ret.easy, 1);
    assert_eq!(ret.total, 3);
    assert_eq!(ret.retention_percentage, 67);

    // Daily activity
    let act =
        StatsRepository::get_daily_activity(&conn, Some("d1"), 7, Some("Asia/Saigon")).unwrap();
    assert_eq!(act.len(), 2);

    // Leech cards: card1 có 9 lapses >= threshold 8
    let leeches = StatsRepository::get_leech_cards(&conn, Some("d1"), 8).unwrap();
    assert_eq!(leeches.len(), 1);
    assert_eq!(leeches[0].item_id, "i1");
    assert_eq!(leeches[0].lapses, 9);
}
