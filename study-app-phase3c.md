Đã hoàn thành GIAI ĐOẠN 3C: TÁI CẤU TRÚC (REFACTOR, KHÔNG THÊM TÍNH NĂNG).

Toàn bộ mã nguồn trong src/ đã được tổ chức lại theo nguyên tắc: tách theo trách nhiệm, mỗi file làm một việc rõ ràng, không có code trùng lặp, giữ nguyên 100% hành vi giao diện lẫn logic backend.

(a) Cấu trúc thư mục mới của src/
text
src/
├── index.html                  # Khung HTML nạp stylesheet và script app
├── styles.css                  # File tổng hợp (aggregator) import các file trong styles/
├── styles/
│   ├── tokens.css              # Design tokens: màu sắc, typography, spacing, radius, transitions
│   ├── controls.css            # Component controls dùng chung: btn, input, select, switch, checkbox, chips
│   ├── base.css                # CSS reset, layout khung app, page-head, notices, modal cơ sở, KaTeX, lightbox
│   ├── home.css                # Giao diện Trang chủ: dải Hôm nay, thanh lọc/tìm/sắp xếp, lưới thẻ deck, empty states
│   ├── deck.css                # Chi tiết bộ thẻ: hero stats, lưới chế độ học, bảng danh sách câu hỏi, cảnh báo lỗi
│   ├── session.css             # Màn hình phiên học: tiến độ chia đoạn, thẻ câu hỏi, lật flashcard, 2-cột feedback, rating SRS
│   ├── result.css              # Màn hình kết quả: vòng tròn điểm SVG, stat cards, bảng xem lại câu sai, nút thao tác
│   ├── editor.css              # Giao diện Deck Editor: danh sách câu, thanh dạng, form soạn, ảnh, math snippets
│   └── settings.css            # Màn hình Cài đặt: nhịp độ học SRS, panel đặt lại tiến trình
├── app.js                      # Store trạng thái, router màn hình, IPC glue (rút gọn từ 742 dòng xuống 461 dòng)
├── core/                       # Logic thuần ES module, 0 dependency DOM/Electron (giữ nguyên để test độc lập)
│   ├── deckkinds.js
│   ├── deckstats.js
│   ├── deckmodel.js
│   ├── grader.js
│   ├── parser.js
│   ├── planner.js
│   ├── richtext.js
│   ├── sdeck.js
│   ├── srs.js
│   ├── stats.js
│   └── validate.js
└── views/
    ├── home.js                 # Màn hình Home (gọi component dùng chung stackedbar)
    ├── deck.js                 # Màn hình Deck (gọi component dùng chung stackedbar)
    ├── session.js              # Màn hình Session (chỉ lo logic tương tác phiên học)
    ├── result.js               # Màn hình Result (render kết quả, vòng tròn điểm SVG, bảng câu sai)
    ├── settings.js             # Màn hình Settings
    ├── editor.js               # Màn hình Deck Editor
    ├── notify.js               # Tiện ích thông báo toast
    ├── components/             # Các component UI tái sử dụng giữa nhiều màn hình
    │   ├── stackedbar.js       # renderStackedBar(st) vẽ thanh tiến độ xếp chồng 4 màu
    │   └── lightbox.js         # Phóng to ảnh (showLightbox, attachImageHandlers)
    └── modals/                 # Các hộp thoại pop-up tương tác
        ├── sessionsetup.js     # Hộp thoại thiết lập phiên học (chọn chế độ, phạm vi, xáo trộn)
        ├── newdeck.js          # Hộp thoại tạo bộ thẻ mới (3 ô chọn loại Thẻ ghi nhớ / Đề luyện thi / Từ vựng)
        └── deckinfo.js         # Hộp thoại thông tin bộ thẻ (tên, loại, mô tả) + cảnh báo lệch mục
(b) Bảng đối chiếu "file cũ -> file mới" cho JS và CSS
1. CSS
File cũ	File mới	Trách nhiệm & Thay đổi
styles.css (2.238 dòng)	styles/base.css	Reset, app layout, topbar, toolbar, modal container cơ sở, thông báo toast, KaTeX & lightbox ảnh
	styles/home.css	Dải tiến độ Hôm nay, thanh tìm kiếm/lọc/sắp xếp, lưới thẻ bộ thẻ, trạng thái rỗng
	styles/deck.css	Khung chi tiết bộ thẻ, hero stats, lưới thẻ chế độ học, bảng mục câu hỏi, cảnh báo lỗi
	styles/session.css	Dải tiến độ phân đoạn, thẻ câu hỏi, lật Flashcard, giao diện phản hồi 2 cột, nút SRS
	styles/result.css	Màn hình kết quả, vòng tròn điểm SVG, stat cards, bảng câu sai
	styles/settings.css	Form cấu hình số thẻ mới/ngày, learning steps, vùng đặt lại tiến trình
	(Loại bỏ)	Đã dọn sạch ~500 dòng CSS Editor dư thừa cũ trong styles.css (trước đây bị ghi đè bởi editor.css)
	styles.css (9 dòng)	Giữ vai trò entry point aggregator import tất cả file CSS con
2. JavaScript
File cũ	File mới	Trách nhiệm & Thay đổi
app.js (742 dòng)	views/modals/sessionsetup.js	Tách hàm renderSessionModal(entry, onStart, onCancel)
	views/modals/newdeck.js	Tách hàm renderNewDeckModal(onCreate, onCancel, preselectedKind)
	views/modals/deckinfo.js	Tách hàm renderDeckInfoModal(deck, onSave, onCancel)
	views/notify.js	Tách hàm hiển thị thông báo notify(text, level, timeout)
	app.js (461 dòng)	Chỉ còn giữ State Store, Router chuyển view, và IPC event bindings
session.js (712 dòng)	views/result.js	Tách hoàn toàn màn hình Kết quả (renderResult), tính toán SVG ring, thống kê khoảng cách ôn tập tiếp theo
	session.js (466 dòng)	Chỉ quản lý vòng lặp phiên học (nạp câu hỏi, tương tác đáp án, lật thẻ, chấm điểm, chuyển câu)
Code lặp trong home.js & deck.js	views/components/stackedbar.js	Gộp hàm vẽ thanh tiến độ renderStackedBar(st) thành component dùng chung
Code lặp xử lý ảnh	views/components/lightbox.js	Gộp popup xem ảnh to showLightbox và attachImageHandlers
(c) Phân tích các chỗ nghi ngờ có thể bị đổi hành vi

Trong quá trình refactor, các điểm nhạy cảm sau đã được rà soát và kiểm chứng:

Thứ tự nạp CSS (Cascading order):
Nghi ngờ ban đầu: Khi tách styles.css ra thành từng file riêng, thứ tự import có thể làm thay đổi độ ưu tiên của một số selector ghi đè (override).
Biện pháp & Kiểm chứng: index.html và styles.css giữ đúng thứ tự: tokens.css → controls.css → base.css → các view chuyên biệt (home.css, deck.css, session.css, result.css, settings.css, editor.css). Các class và biến CSS hoạt động đồng nhất ở cả 1920×1080 và 1280×720.
Khai báo và liên kết notify():
Nghi ngờ ban đầu: Các view gọi notify qua đối số actions.notify hoặc trực tiếp.
Biện pháp & Kiểm chứng: notify.js xuất export hàm notify độc lập, đồng thời actions.notify trong app.js vẫn được truyền vào các view để tương thích 100% với chữ ký hàm hiện tại.
Màn hình Result tách khỏi Session:
Nghi ngờ ban đầu: Phiên học khi hoàn thành gọi renderResult, liệu việc thoát hoặc ôn tiếp có bị mất trạng thái activeSession hoặc router bị lệch?
Biện pháp & Kiểm chứng: renderResult nhận trọn vẹn actions (exit, restart, studyDue) từ session.js, hỗ trợ đầy đủ cờ isTrial (dải Học thử không lưu tiến độ). Tương tác thoát về Deck/Home và làm lại phiên học đã được kiểm thử tự động thành công.
Bộ câu hỏi trắc nghiệm nhiều đáp án (Multi-choice checkbox):
Đảm bảo giữ đúng cải tiến trước: nhấp vào dòng đáp án vẫn chọn được (gắn <label>), kích thước ô checkbox 20×20px rõ ràng, không làm gãy UI.
