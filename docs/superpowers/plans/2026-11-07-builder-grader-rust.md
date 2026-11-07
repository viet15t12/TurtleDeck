# Question Builder and Answer Grader in Rust Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Port the Question Builder (`buildMC`, distractors, cloze, write, flashcard) and Answer Grader (exact, normalized, Levenshtein typo-tolerant fuzzy matching, number with tolerance, LaTeX, choices) from JS/TS into Rust, and integrate them with the Adaptive Session Planner and Review API so question generation and evaluation run entirely in the Rust backend.

**Architecture:**
- `src-tauri/src/srs/grader.rs`:
  - `levenshtein(a, b)`: UTF-8 aware edit distance.
  - `grade_text(input, answers, mode, tolerance)`: exact, normalized, regex, number with tolerance, latex, and fuzzy typo tolerance.
  - `grade_choices(selected, correct)`: single & multiple choice set comparison.
- `src-tauri/src/srs/builder.rs`:
  - `build_mc`: Generates 4-choice multiple choice questions with distractors prioritized by part-of-speech (`pos`) and `tags`, filtered by Levenshtein distance.
  - `build_write`, `build_cloze`, `build_flashcard`, `build_listen`, `build_question`.
- Integration into `adaptive_planner.rs` & `commands/srs.rs`:
  - `srs_plan_session` builds complete, ready-to-render questions (prompt, choices, answers, explanation) directly in Rust.
  - `srs_grade_and_review` (or updated `srs_record_review`) evaluates user input in Rust and updates FSRS in one atomic IPC call.
- Frontend:
  - Consumes ready-made questions without having to run distractor generation or Levenshtein in JavaScript.

**Tech Stack:**
- Rust (Tauri 2 backend, rusqlite, serde, regex)
- Vanilla JavaScript (Frontend UI)
- Node.js test runner (`npm test`) & Cargo test runner (`cargo test`)

**Spec:** Conversation design approved on 2026-11-07.

## Global Constraints
- Preserve exact scoring compatibility with existing tests in `test/grader.test.mjs` and `test/builder.test.mjs`.
- Unicode NFC normalization and case-insensitivity for text matching.
- Deterministic random seeding capability for tests.
- Zero regressions in existing 37 Rust tests and 186 JS tests.

## Review Focus
1. **Vietnamese diacritics / Unicode in Levenshtein:** Must count composite/accented characters as single characters, not byte offsets.
2. **Distractor quality:** Distractors must not duplicate correct answer or be too close (Levenshtein distance $\le 1$ or $\le 2$ for long words is filtered out).
3. **Number tolerance:** Correctly parses integers, decimals, and scientific notation with tolerance comparisons.
4. **Offline fallback:** Frontend continues to work seamlessly in web/mock environments.

---

### Task 1: Answer Grader in Rust (`grader.rs`)

**Files:**
- Create: `src-tauri/src/srs/grader.rs`
- Modify: `src-tauri/src/srs/mod.rs`
- Test: `src-tauri/tests/grader_test.rs`

- [x] **Step 1.1: Write failing tests for Grader**
- [x] **Step 1.2: Implement Grader module**
- [x] **Step 1.3: Run tests and verify**
- [x] **Step 1.4: Verified with grader_test and 42 cargo tests passing**

---

### Task 2: Question Builder & Distractor Generator in Rust (`builder.rs`)

**Files:**
- Create: `src-tauri/src/srs/builder.rs`
- Modify: `src-tauri/src/srs/mod.rs`
- Test: `src-tauri/tests/builder_test.rs`

- [x] **Step 2.1: Write failing tests for Builder**
- [x] **Step 2.2: Implement Builder module**
- [x] **Step 2.3: Run tests and verify**
- [x] **Step 2.4: Verified with builder_test and 46 cargo tests passing**

---

### Task 3: Integrate Builder with Adaptive Planner & IPC

**Files:**
- Modify: `src-tauri/src/srs/adaptive_planner.rs`
- Modify: `src-tauri/src/commands/srs.rs`
- Modify: `src/platform/tauri-api.js`
- Modify: `src/app/actions/sessions.js`
- Test: `src-tauri/tests/srs_ipc_test.rs` and `npm test`

- [x] **Step 3.1: Embed built question inside PlannedCardItem**
  In `src-tauri/src/srs/adaptive_planner.rs`:
  - Use `build_question` to automatically construct `question: BuiltQuestion` for each planned card.
  - Return complete questions with generated choices and distractors directly from Rust.

- [x] **Step 3.2: Expose grading command in Tauri IPC**
  In `src-tauri/src/commands/srs.rs`:
  - Add `#[tauri::command] pub async fn srs_grade_answer(...)`.
  - Update `srs_record_review` to accept user answer and grade it in Rust if rating not pre-determined.

- [x] **Step 3.3: Wire frontend to consume pre-built questions**
  In `src/app/actions/sessions.js`:
  - Directly map pre-built questions from Rust into session state without running JS `buildQuestion`.

- [x] **Step 3.4: Verify all Rust and JS test suites**
  Run `cargo test --manifest-path src-tauri/Cargo.toml`.
  Run `npm test`.

- [x] **Step 3.5: Final verification & clean up**
  All Rust unit/integration tests and JS test suites pass.
