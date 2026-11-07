use turtle_deck_lib::srs::grader::{
    grade_choices, grade_latex, grade_number, grade_text, levenshtein,
};

#[test]
fn test_levenshtein_distance() {
    assert_eq!(levenshtein("", ""), 0);
    assert_eq!(levenshtein("a", ""), 1);
    assert_eq!(levenshtein("kitten", "sitting"), 3);
    assert_eq!(levenshtein("học tập", "học tap"), 1); // Unicode char comparison
    assert_eq!(levenshtein("tiếng việt", "tiếng việt"), 0);
}

#[test]
fn test_grade_text_modes() {
    // 1. Exact
    let res_exact = grade_text("Hello", &["Hello"], "exact", None);
    assert!(res_exact.ok);
    assert!(!res_exact.near);

    let res_exact_fail = grade_text("hello", &["Hello"], "exact", None);
    assert!(!res_exact_fail.ok);

    // 2. Normalized
    let res_norm = grade_text("  Xin   chào  ", &["xin chào"], "normalized", None);
    assert!(res_norm.ok);
    assert!(!res_norm.near);

    // 3. Typo-tolerant (near)
    // "elephant" (len 8 >= 5) với 1 lỗi typo "elephent"
    let res_typo = grade_text("elephent", &["elephant"], "normalized", None);
    assert!(res_typo.ok);
    assert!(res_typo.near, "1 typo in 8-char word should be counted as near");

    // 4. Regex
    let res_regex = grade_text("systemctl status nginx", &["^systemctl (status|restart) nginx$"], "regex", None);
    assert!(res_regex.ok);

    let res_regex_fail = grade_text("systemctl stop nginx", &["^systemctl (status|restart) nginx$"], "regex", None);
    assert!(!res_regex_fail.ok);
}

#[test]
fn test_grade_number() {
    let res = grade_number("3.14159", &["3.1416"], 0.001);
    assert!(res.ok);

    let res_fail = grade_number("3.14", &["3.1416"], 0.0001);
    assert!(!res_fail.ok);
}

#[test]
fn test_grade_latex() {
    let res = grade_latex("\\dfrac{1}{2}", &["\\frac{1}{2}"]);
    assert!(res.ok);

    let res2 = grade_latex("\\left( x + 1 \\right)", &["(x+1)"]);
    assert!(res2.ok);
}

#[test]
fn test_grade_choices() {
    // Single choice
    assert!(grade_choices(&[1], &[1]).ok);
    assert!(!grade_choices(&[0], &[1]).ok);

    // Multi choice (order independent and deduplicated)
    assert!(grade_choices(&[2, 0, 1], &[0, 1, 2]).ok);
    assert!(grade_choices(&[1, 1, 0], &[0, 1]).ok);
    assert!(!grade_choices(&[0, 1], &[0, 1, 2]).ok);
}
