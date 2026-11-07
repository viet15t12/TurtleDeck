use serde_json::json;
use turtle_deck_lib::srs::builder::{
    build_flashcard, build_mc, build_question, build_write, BuilderOptions,
};

#[test]
fn test_build_mc_generates_4_distinct_choices_with_distractor_filtering() {
    let items = vec![
        json!({ "id": "t1", "type": "vocab", "term": "run", "definition": "chạy", "pos": "verb", "tags": ["action"] }),
        json!({ "id": "t2", "type": "vocab", "term": "walk", "definition": "đi bộ", "pos": "verb", "tags": ["action"] }),
        json!({ "id": "t3", "type": "vocab", "term": "jump", "definition": "nhảy", "pos": "verb", "tags": ["action"] }),
        json!({ "id": "t4", "type": "vocab", "term": "swim", "definition": "bơi", "pos": "verb", "tags": ["water"] }),
        json!({ "id": "t5", "type": "vocab", "term": "apple", "definition": "quả táo", "pos": "noun", "tags": ["fruit"] }),
    ];

    let opts = BuilderOptions {
        count: 4,
        seed: Some(42),
    };

    let q = build_mc(&items[0], &items, "fwd", &opts).expect("MC question should be built");
    assert_eq!(q.id, "t1");
    assert_eq!(q.kind, "single");
    assert_eq!(q.prompt, "run");
    assert_eq!(q.choices.as_ref().unwrap().len(), 4);

    // Đáp án đúng "chạy" phải có trong choices và index khớp với answers[0]
    let correct_idx: usize = q.answers.as_ref().unwrap()[0].parse().unwrap();
    assert_eq!(q.choices.as_ref().unwrap()[correct_idx], "chạy");

    // Các distractors cùng từ loại ("verb") và tag ("action") phải được ưu tiên trước
    let choices_set = q.choices.as_ref().unwrap();
    assert!(choices_set.contains(&"đi bộ".to_string()));
    assert!(choices_set.contains(&"nhảy".to_string()));
}

#[test]
fn test_build_write_question() {
    let item = json!({
        "id": "w1",
        "type": "vocab",
        "term": "computer",
        "definition": "máy tính; máy vi tính"
    });

    // Fwd (prompt: definition -> type term)
    let q_rev = build_write(&item, "rev").expect("Write rev question");
    assert_eq!(q_rev.prompt, "máy tính; máy vi tính");
    assert_eq!(q_rev.answers.as_ref().unwrap(), &vec!["computer".to_string()]);

    // Fwd (prompt: term -> type definition)
    let q_fwd = build_write(&item, "fwd").expect("Write fwd question");
    assert_eq!(q_fwd.prompt, "computer");
    let ans_list = q_fwd.answers.as_ref().unwrap();
    assert!(ans_list.contains(&"máy tính".to_string()));
    assert!(ans_list.contains(&"máy vi tính".to_string()));
}

#[test]
fn test_build_flashcard_question() {
    let item = json!({
        "id": "c1",
        "type": "card",
        "front": "Thủ đô của Việt Nam là gì?",
        "back": "Hà Nội"
    });

    let q = build_flashcard(&item, "fwd").expect("Flashcard question");
    assert_eq!(q.kind, "card");
    assert_eq!(q.prompt, "Thủ đô của Việt Nam là gì?");
    assert_eq!(q.explanation.as_deref(), Some("Hà Nội"));
}

#[test]
fn test_build_question_for_quiz_single() {
    let item = json!({
        "id": "q1",
        "type": "single",
        "question": "1 + 1 bằng mấy?",
        "choices": ["1", "2", "3", "4"],
        "answer": [1]
    });

    let q = build_question(&item, "fwd", "quiz", &[], &BuilderOptions::default())
        .expect("Quiz single question");
    assert_eq!(q.kind, "single");
    assert_eq!(q.prompt, "1 + 1 bằng mấy?");
    assert_eq!(q.choices.as_ref().unwrap().len(), 4);
    assert_eq!(q.answers.as_ref().unwrap(), &vec!["1".to_string()]); // index 1
}
