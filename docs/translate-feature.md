# Đặc tả Kỹ thuật: Dạng bài tập "Dịch câu có sử dụng từ gợi ý" (.sdeck v1)

> **Mục tiêu:** Bổ sung dạng bài tập dịch câu tiếng Việt sang tiếng Anh có sử dụng từ gợi ý (Key Word Transformation / Sentence Translation with Given Word) vào định dạng `.sdeck v1`, tuân thủ nguyên tắc đơn trách nhiệm (Single Responsibility Principle), chấm điểm phân tầng chống bắt lỗi cứng nhắc, hỗ trợ xuất Markdown cho giáo viên chấm và tích hợp linh hoạt với bất kỳ dịch vụ AI nào.

---

## 1. Cấu trúc dữ liệu trong `.sdeck v1` (`deck.json`)

Mục câu hỏi thuộc dạng `type: "translate"` được lưu trực tiếp trong mảng `items` của `deck.json`:

```json
{
  "id": "trans-001",
  "type": "translate",
  "topic": "Collocations & Patterns",
  "vi": "Tôi đã ngăn anh ấy bỏ cuộc.",
  "keyword": "prevent",
  "pos": "v",
  "pattern": "prevent\\s+\\w+\\s+from\\s+\\w+ing",
  "answers": [
    "I prevented him from giving up.",
    "I prevented him from quitting."
  ],
  "acceptableForms": ["prevent", "prevents", "prevented", "preventing"],
  "explanation": "Cấu trúc: prevent someone from doing something (quá khứ đơn: prevented)."
}
```

### Các trường dữ liệu:
* **`vi`** *(Bắt buộc)*: Câu tiếng Việt hoàn chỉnh mang đầy đủ ngữ cảnh và thì.
* **`keyword`** *(Bắt buộc)*: Từ/cụm từ gợi ý (mỏ neo / anchor).
* **`pos`** *(Tùy chọn)*: Từ loại (`v`, `n`, `adj`, `phr`...).
* **`pattern`** *(Tùy chọn)*: Biểu thức chính quy (Regex) kiểm tra cấu trúc cú pháp đi kèm (ví dụ: `prevent\s+\w+\s+from\s+\w+ing`). Nếu bỏ trống, bỏ qua bước kiểm tra cấu trúc.
* **`answers`** *(Bắt buộc)*: Mảng chứa ít nhất 1 câu tiếng Anh mẫu chấp nhận được.
* **`acceptableForms`** *(Tùy chọn)*: Danh sách các dạng chia hợp lệ của từ gợi ý. Nếu không khai báo, hệ thống tự động suy diễn theo từ điển hình thái học tiếng Anh (morphology).
* **`explanation`** *(Tùy chọn)*: Lời giải thích ngữ pháp / cấu trúc sau khi làm bài.

---

## 2. Kiến trúc Mô-đun (Single Responsibility Principle)

Nhằm tránh một tệp code phải gánh quá nhiều trách nhiệm, toàn bộ logic được phân rã thành các mô-đun độc lập đặt tại `src/core/translate/`:

```text
src/core/translate/
├── types.ts                  # Định nghĩa interface & kiểu dữ liệu TypeScript
├── morphology.ts             # Phân tích hình thái từ, sinh biến thể từ vựng & kiểm tra mỏ neo (Layer 1)
├── pattern-matcher.ts        # So khớp cấu trúc ngữ pháp bằng Regex (Layer 2)
├── sentence-normalizer.ts    # Chuẩn hoá câu tiếng Anh (dấu câu, hoa thường, co rút) & so khớp mẫu (Layer 3)
├── evaluator.ts              # Bộ điều phối chấm điểm phân tầng (Layered Evaluator)
├── md-exporter.ts            # Định dạng và xuất kết quả bài làm ra file Markdown (.md) cho giáo viên
├── llm-grader.ts             # Chấm điểm nâng cao qua API LLM chuẩn OpenAI-Compatible
└── index.ts                  # Barrel export
```

---

## 3. Cơ chế Chấm điểm Phân tầng (Layered Evaluation)

Thay vì so khớp chuỗi cứng nhắc làm nản lòng người học, hệ thống vận hành theo 3 tầng kiểm tra:

1. **Tầng 1 — Kiểm tra Mỏ neo (Anchor / Keyword Check):**
   - Quét câu trả lời xem có chứa từ gợi ý hoặc biến thể hợp lệ của nó không (`prevent / prevented / preventing / prevents`).
   - Nếu trượt: Trả về trạng thái `incorrect` (0 điểm) kèm phản hồi: *"Chưa sử dụng từ gợi ý bắt buộc"*.
2. **Tầng 2 — Kiểm tra Cấu trúc (Pattern Check):**
   - So khớp cú pháp qua `pattern` regex (tự động hỗ trợ biến thể của từ khóa trong regex).
   - Nếu trượt: Trả về trạng thái `incorrect` (30 điểm) kèm phản hồi: *"Đã dùng từ gợi ý nhưng chưa đúng cấu trúc ngữ pháp yêu cầu"*.
3. **Tầng 3 — So khớp Câu mẫu (Normalized Sentence Match):**
   - Chuẩn hóa: chữ thường, xóa dấu câu, mở rộng từ co rút (`I'm` $\leftrightarrow$ `I am`, `don't` $\leftrightarrow$ `do not`, `can't` $\leftrightarrow$ `cannot`...).
   - Nếu khớp bất kỳ câu nào trong `answers`: Trả về `correct` (100 điểm tuyệt đối).
4. **Cơ chế Fallback ("Cần xem lại" / `needs_review`):**
   - Nếu người học vượt qua **Tầng 1** và **Tầng 2** nhưng câu viết khác danh sách `answers` mẫu:
   - Hệ thống đánh dấu trạng thái **`needs_review` (75 điểm)** thay vì phạt sai. Người học có thể tự đối chiếu câu mẫu hoặc chọn xuất Markdown gửi giáo viên.

---

## 4. Xuất bài làm ra Markdown (.md) cho Giáo viên

Tệp Markdown xuất ra được tổ chức theo từng câu dạng **Heading** (tránh vỡ bảng khi câu dài), điền sẵn kết quả quét tự động để người chấm tiết kiệm thời gian:

```markdown
# Bài tập Dịch câu có sử dụng từ gợi ý
- **Học viên:** Nguyễn Văn A
- **Thời gian nộp:** 05/11/2026, 19:45:00
- **Tổng hợp tự động:**
  - Sử dụng từ gợi ý (Tầng 1): 5/5
  - Đúng cấu trúc ngữ pháp (Tầng 2): 5/5
  - Khớp tuyệt đối đáp án mẫu (Tầng 3): 4/5
  - Số câu cần người chấm thẩm định: 1/5

---

### Câu 1: [prevent (v)]
- **Đề bài (Tiếng Việt):** Tôi đã ngăn anh ấy bỏ cuộc.
- **Từ gợi ý (Anchor):** `prevent`
- **Mẫu cấu trúc yêu cầu:** `prevent\s+\w+\s+from\s+\w+ing`
- **Bài làm của học viên:** *I prevented him from giving up.*

**Kết quả kiểm tra tự động:**
- [x] Dùng từ gợi ý (Phát hiện: `prevented`)
- [x] Khớp cấu trúc ngữ pháp yêu cầu
- [x] Khớp nguyên văn đáp án mẫu

**Đáp án mẫu tham khảo:**
  1. I prevented him from giving up.
  2. I prevented him from quitting.
- *Giải thích:* prevent someone from doing something (quá khứ đơn: prevented)

- **Điểm:** 10/10
- **Nhận xét của người chấm:**
  > 
---
```

---

## 5. Tích hợp AI / LLM Grader (Chuẩn OpenAI-Compatible)

Module `llm-grader.ts` cho phép người dùng kết nối tới **bất kỳ nhà cung cấp AI nào** (OpenAI, DeepSeek, Groq, OpenRouter hoặc Ollama chạy offline trên máy) thông qua cấu hình `AIGradingConfig`:

* **`baseUrl`**: URL của endpoint (vd: `https://api.openai.com/v1` hoặc `http://localhost:11434/v1`).
* **`apiKey`**: Khóa API cá nhân.
* **`model`**: Tên model mong muốn (`gpt-4o-mini`, `deepseek-chat`, `llama3.2`...).

AI sẽ trả về JSON thẩm định gồm:
```json
{
  "usesKeyword": true,
  "patternOk": true,
  "grammarScore": 10,
  "meaningScore": 9,
  "feedback": "Câu dịch tự nhiên, thì quá khứ chia chính xác.",
  "suggestedSentence": "I prevented him from giving up."
}
```

---

## 6. Kiểm thử & Tương thích ngược

* **Bộ kiểm thử:** Tệp `test/translate.test.mjs` bao phủ 100% các tình huống:
  1. Morphology & Lemmatization từ vựng.
  2. Pattern Regex matching & linh hoạt biến thể thì.
  3. Sentence normalizer & contraction expansion.
  4. Phân tầng 3 lớp & Fallback `needs_review`.
  5. Xuất tài liệu Markdown.
  6. Xây dựng prompt & xử lý JSON phản hồi từ LLM.
  7. Tích hợp Deck Model (`newItem('translate')`) và Validator (`validateItem`).
* **Kết quả:** Toàn bộ **186/186** bài kiểm thử Node.js và **28/28** bài kiểm thử Rust đều vượt qua thành công (100% Pass).

