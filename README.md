# Study App

Ứng dụng Electron offline để học bằng flashcard và trắc nghiệm. Đặc tả sản phẩm và kế hoạch theo giai đoạn nằm trong [study-app.md](./study-app.md) và [study-app-phases.md](./study-app-phases.md).

## Môi trường phát triển

- Fedora Linux
- Node.js LTS (Node.js 20 trở lên) và npm

## Cài đặt và chạy

```bash
npm install
npm start
```

Ở lần chạy đầu, Electron có thể tải binary runtime nếu máy chưa có sẵn.

Chạy kiểm thử:

```bash
npm test
```

Hiện tại repo có bộ khung Electron tối thiểu; chức năng đọc/ghi bộ thẻ và các luồng học sẽ được triển khai ở các giai đoạn tiếp theo.
