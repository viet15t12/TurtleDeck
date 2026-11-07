# FSRS and Adaptive Shuffling in Rust Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the FSRS (Free Spaced Repetition Scheduler) algorithm and an Adaptive Interleaving question selection engine in Rust (Tauri backend), transitioning study/review scheduling and card progression out of JS/TS into Rust.

**Architecture:**
- Rust backend hosts core learning algorithms:
  - `fsrs.rs`: Computes memory Stability ($S$), Difficulty ($D$), Retrievability ($R$), and scheduled intervals for review ratings.
  - `adaptive_planner.rs`: Adaptive card selection based on urgency / memory decay ($1 - R$, lapses, difficulty) and smart interleaving (minimum gap between related cards and distributed new/due quotas).
- SQLite repository & schema migration:
  - Augments `srs_cards` table with FSRS columns: `stability`, `difficulty`, `last_review`.
  - Migrates legacy SM-2 cards seamlessly.
- Tauri IPC API:
  - Exposes `srs_plan_session` and updates `srs_record_review` to use FSRS in Rust.
- Frontend:
  - Calls Rust backend to generate session queues and persist review progress.

**Tech Stack:**
- Rust (Tauri 2 backend, rusqlite, serde, rand)
- Vanilla JavaScript / ES Modules (Frontend UI)
- Node.js test runner (`npm test`) & Cargo test runner (`cargo test`)

**Spec:** Conversation design approved on 2026-11-07.

## Global Constraints
- All memory modeling and session planning must execute in Rust; JS/TS is thin UI client.
- Backward compatibility: existing users' SM-2 progress must load seamlessly without data loss.
- Deterministic and testable: RNG and timestamps can be injected for unit testing.
- Preserves all existing valid test suites (`cargo test` and `npm test`).

## Review Focus
1. **Migration safety:** Cards with NULL stability/difficulty must default properly without crash.
2. **Anti-adjacency:** Same item cards (fwd/rev or multiple questions) must not appear adjacent in the generated queue.
3. **FSRS interval progression:** Rating 1 (Again) decreases stability and resets interval; Rating 4 (Easy) increases stability significantly.
4. **Offline / Fallback:** Graceful handling if `window.__TAURI_INTERNALS__` is unavailable during headless unit testing.
5. **Fuzz factor:** Prevents card clustering on the same due date while keeping intervals $\ge 1$ day.

---

### Task 1: FSRS Core Engine in Rust

**Files:**
- Create: `src-tauri/src/srs/fsrs.rs`
- Create: `src-tauri/src/srs/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Test: `src-tauri/tests/fsrs_test.rs`

- [x] **Step 1.1: Write failing integration test for FSRS**
- [x] **Step 1.2: Implement FSRS module**
- [x] **Step 1.3: Run tests and verify**
- [x] **Step 1.4: Verified with 32 passed cargo tests**

---

### Task 2: Database Schema Migration & SrsCard Update

**Files:**
- Modify: `src-tauri/src/db/schema.rs`
- Modify: `src-tauri/src/db/repositories/srs.rs`
- Test: `src-tauri/tests/srs_migration_test.rs`

- [x] **Step 2.1: Update SrsCard struct**
- [x] **Step 2.2: Add SQLite migration**
- [x] **Step 2.3: Update SrsRepository queries**
- [x] **Step 2.4: Run repository tests**
- [x] **Step 2.5: Verified with srs_migration_test and 34 cargo tests passing**

---

### Task 3: Adaptive Interleaving Session Planner in Rust

**Files:**
- Create: `src-tauri/src/srs/adaptive_planner.rs`
- Modify: `src-tauri/src/srs/mod.rs`
- Test: `src-tauri/tests/adaptive_planner_test.rs`

- [x] **Step 3.1: Write failing test for Adaptive Interleaving planner**
- [x] **Step 3.2: Implement Adaptive Interleaving logic**
- [x] **Step 3.3: Run tests and verify**
- [x] **Step 3.4: Verified with adaptive_planner_test and 36 cargo tests passing**

---

### Task 4: Tauri Commands & IPC Integration

**Files:**
- Modify: `src-tauri/src/commands/srs.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/platform/channels.js`
- Modify: `src/platform/tauri-api.js`
- Test: `src-tauri/tests/srs_ipc_test.rs`

- [x] **Step 4.1: Add `srs_plan_session` command**
- [x] **Step 4.2: Update `srs_record_review` to use FSRS**
- [x] **Step 4.3: Expose channels and API in JS frontend**
- [x] **Step 4.4: Verify Rust build & test (srs_ipc_test + 37 cargo tests pass)**

---

### Task 5: Frontend Integration with Rust Engine

**Files:**
- Modify: `src/views/session/build-questions.js`
- Modify: `src/app/actions/sessions.js`
- Modify: `src/app/progress.js`
- Test: `npm test` and `cargo test`

- [x] **Step 5.1: Wire `build-questions.js` & `sessions.js` to use Rust `planSession`**
- [x] **Step 5.2: Wire `progress.js` to Rust review recording with FSRS**
- [x] **Step 5.3: Run full JS test suite (186 tests passing)**
- [x] **Step 5.4: Run full Cargo test suite (37 tests passing)**
- [x] **Step 5.5: Final verification and clean-up of obsolete dead code**
