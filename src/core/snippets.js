// src/core/snippets.js — Danh mục ký hiệu và mẫu công thức LaTeX cho Popover (§7.2, §13.1)
import { stripAccents } from './deckmodel.js';

export const SNIPPET_TABS = [
  'Thường dùng',
  'Hy Lạp',
  'So sánh',
  'Mũi tên',
  'Hàm & giới hạn',
  'Ma trận',
];

export const SNIPPETS = [
  // ── Thường dùng ────────────────────────────────────────────────────────────
  { id: 'frac', tab: 'Thường dùng', latex: '\\frac{▢}{▢}', name: 'Phân số', kw: ['phan so', 'fraction', 'chia'] },
  { id: 'sqrt', tab: 'Thường dùng', latex: '\\sqrt{▢}', name: 'Căn bậc hai', kw: ['can', 'sqrt', 'can bac hai'] },
  { id: 'nthroot', tab: 'Thường dùng', latex: '\\sqrt[▢]{▢}', name: 'Căn bậc n', kw: ['can bac n', 'root'] },
  { id: 'pow', tab: 'Thường dùng', latex: '^{▢}', name: 'Số mũ / Luỹ thừa', kw: ['mu', 'luy thua', 'power', 'sup'] },
  { id: 'sub', tab: 'Thường dùng', latex: '_{▢}', name: 'Chỉ số dưới', kw: ['chi so', 'subscript'] },
  { id: 'inf', tab: 'Thường dùng', latex: '\\infty', name: 'Vô cực', kw: ['vo cuc', 'infinity'] },
  { id: 'pm', tab: 'Thường dùng', latex: '\\pm', name: 'Cộng trừ', kw: ['cong tru', 'plus minus'] },
  { id: 'times', tab: 'Thường dùng', latex: '\\times', name: 'Dấu nhân', kw: ['nhan', 'times'] },
  { id: 'cdot', tab: 'Thường dùng', latex: '\\cdot', name: 'Chấm nhân', kw: ['cham nhan', 'dot'] },
  { id: 'div', tab: 'Thường dùng', latex: '\\div', name: 'Dấu chia', kw: ['chia', 'divide'] },
  { id: 'abs', tab: 'Thường dùng', latex: '\\left|▢\\right|', name: 'Trị tuyệt đối', kw: ['tri tuyet doi', 'abs'] },
  { id: 'paren', tab: 'Thường dùng', latex: '\\left(▢\\right)', name: 'Ngoặc co giãn', kw: ['ngoac', 'parentheses'] },
  { id: 'binom', tab: 'Thường dùng', latex: '\\binom{▢}{▢}', name: 'Tổ hợp nCk', kw: ['to hop', 'binom'] },
  { id: 'deriv', tab: 'Thường dùng', latex: '\\frac{d}{dx}\\left(▢\\right)', name: 'Đạo hàm', kw: ['dao ham', 'derivative'] },

  // ── Hy Lạp ─────────────────────────────────────────────────────────────────
  { id: 'alpha', tab: 'Hy Lạp', latex: '\\alpha', name: 'Alpha (α)', kw: ['alpha', 'hy lap'] },
  { id: 'beta', tab: 'Hy Lạp', latex: '\\beta', name: 'Beta (β)', kw: ['beta', 'hy lap'] },
  { id: 'gamma', tab: 'Hy Lạp', latex: '\\gamma', name: 'Gamma (γ)', kw: ['gamma', 'hy lap'] },
  { id: 'delta', tab: 'Hy Lạp', latex: '\\delta', name: 'Delta (δ)', kw: ['delta', 'hy lap'] },
  { id: 'eps', tab: 'Hy Lạp', latex: '\\varepsilon', name: 'Epsilon (ε)', kw: ['epsilon', 'hy lap'] },
  { id: 'theta', tab: 'Hy Lạp', latex: '\\theta', name: 'Theta (θ)', kw: ['theta', 'goc'] },
  { id: 'lambda', tab: 'Hy Lạp', latex: '\\lambda', name: 'Lambda (λ)', kw: ['lambda', 'buoc song'] },
  { id: 'mu', tab: 'Hy Lạp', latex: '\\mu', name: 'Mu (μ)', kw: ['mu', 'micro'] },
  { id: 'pi', tab: 'Hy Lạp', latex: '\\pi', name: 'Pi (π)', kw: ['pi', 'hang so'] },
  { id: 'rho', tab: 'Hy Lạp', latex: '\\rho', name: 'Rho (ρ)', kw: ['rho', 'dien tro suat'] },
  { id: 'sigma', tab: 'Hy Lạp', latex: '\\sigma', name: 'Sigma (σ)', kw: ['sigma', 'phuong sai'] },
  { id: 'tau', tab: 'Hy Lạp', latex: '\\tau', name: 'Tau (τ)', kw: ['tau'] },
  { id: 'phi', tab: 'Hy Lạp', latex: '\\varphi', name: 'Phi (φ)', kw: ['phi', 'pha'] },
  { id: 'omega', tab: 'Hy Lạp', latex: '\\omega', name: 'Omega (ω)', kw: ['omega', 'tan so goc'] },
  { id: 'Delta', tab: 'Hy Lạp', latex: '\\Delta', name: 'Delta hoa (Δ)', kw: ['delta hoa', 'biet thuc'] },
  { id: 'Sigma', tab: 'Hy Lạp', latex: '\\Sigma', name: 'Sigma hoa (Σ)', kw: ['sigma hoa'] },
  { id: 'Omega', tab: 'Hy Lạp', latex: '\\Omega', name: 'Omega hoa (Ω)', kw: ['omega hoa', 'ohm'] },
  { id: 'Gamma', tab: 'Hy Lạp', latex: '\\Gamma', name: 'Gamma hoa (Γ)', kw: ['gamma hoa'] },

  // ── So sánh & Tập hợp ──────────────────────────────────────────────────────
  { id: 'le', tab: 'So sánh', latex: '\\le', name: 'Nhỏ hơn hoặc bằng (≤)', kw: ['nho hon hoac bang', 'le', '<='] },
  { id: 'ge', tab: 'So sánh', latex: '\\ge', name: 'Lớn hơn hoặc bằng (≥)', kw: ['lon hon hoac bang', 'ge', '>='] },
  { id: 'neq', tab: 'So sánh', latex: '\\neq', name: 'Khác (≠)', kw: ['khac', 'neq', '!='] },
  { id: 'approx', tab: 'So sánh', latex: '\\approx', name: 'Xấp xỉ (≈)', kw: ['xap xi', 'approx'] },
  { id: 'equiv', tab: 'So sánh', latex: '\\equiv', name: 'Đồng dư / Tương đương (≡)', kw: ['dong du', 'tuong duong', 'equiv'] },
  { id: 'in', tab: 'So sánh', latex: '\\in', name: 'Thuộc (∈)', kw: ['thuoc', 'in', 'tap hop'] },
  { id: 'notin', tab: 'So sánh', latex: '\\notin', name: 'Không thuộc (∉)', kw: ['khong thuoc', 'notin'] },
  { id: 'subset', tab: 'So sánh', latex: '\\subset', name: 'Tập con (⊂)', kw: ['tap con', 'subset'] },
  { id: 'subseteq', tab: 'So sánh', latex: '\\subseteq', name: 'Tập con hoặc bằng (⊆)', kw: ['tap con', 'subseteq'] },
  { id: 'cup', tab: 'So sánh', latex: '\\cup', name: 'Hợp (∪)', kw: ['hop', 'union', 'cup'] },
  { id: 'cap', tab: 'So sánh', latex: '\\cap', name: 'Giao (∩)', kw: ['giao', 'intersection', 'cap'] },
  { id: 'empty', tab: 'So sánh', latex: '\\emptyset', name: 'Tập rỗng (∅)', kw: ['tap rong', 'empty'] },
  { id: 'forall', tab: 'So sánh', latex: '\\forall', name: 'Với mọi (∀)', kw: ['voi moi', 'forall'] },
  { id: 'exists', tab: 'So sánh', latex: '\\exists', name: 'Tồn tại (∃)', kw: ['ton tai', 'exists'] },

  // ── Mũi tên ────────────────────────────────────────────────────────────────
  { id: 'to', tab: 'Mũi tên', latex: '\\to', name: 'Mũi tên sang phải (→)', kw: ['mui ten', 'suy ra', 'tiem can', 'to'] },
  { id: 'gets', tab: 'Mũi tên', latex: '\\leftarrow', name: 'Mũi tên sang trái (←)', kw: ['mui ten trai', 'leftarrow'] },
  { id: 'lrarrow', tab: 'Mũi tên', latex: '\\leftrightarrow', name: 'Mũi tên hai chiều (↔)', kw: ['hai chieu', 'leftrightarrow'] },
  { id: 'implies', tab: 'Mũi tên', latex: '\\Rightarrow', name: 'Suy ra (⇒)', kw: ['suy ra', 'keo theo', 'implies'] },
  { id: 'iff', tab: 'Mũi tên', latex: '\\Leftrightarrow', name: 'Tương đương (⇔)', kw: ['tuong duong', 'khi va chi khi', 'iff'] },
  { id: 'mapsto', tab: 'Mũi tên', latex: '\\mapsto', name: 'Ánh xạ tới (↦)', kw: ['anh xa', 'mapsto'] },
  { id: 'uparrow', tab: 'Mũi tên', latex: '\\uparrow', name: 'Mũi tên lên (↑)', kw: ['mui ten len', 'tang'] },
  { id: 'downarrow', tab: 'Mũi tên', latex: '\\downarrow', name: 'Mũi tên xuống (↓)', kw: ['mui ten xuong', 'giam'] },

  // ── Hàm & giới hạn ─────────────────────────────────────────────────────────
  { id: 'int', tab: 'Hàm & giới hạn', latex: '\\int_{▢}^{▢} ▢\\,dx', name: 'Tích phân xác định', kw: ['tich phan', 'integral'] },
  { id: 'indefint', tab: 'Hàm & giới hạn', latex: '\\int ▢\\,dx', name: 'Nguyên hàm', kw: ['nguyen ham', 'tich phan'] },
  { id: 'sum', tab: 'Hàm & giới hạn', latex: '\\sum_{i=1}^{▢} ▢', name: 'Tổng Sigma', kw: ['tong', 'sigma', 'sum'] },
  { id: 'prod', tab: 'Hàm & giới hạn', latex: '\\prod_{i=1}^{▢} ▢', name: 'Tích Pi', kw: ['tich', 'prod'] },
  { id: 'lim', tab: 'Hàm & giới hạn', latex: '\\lim_{x \\to ▢} ▢', name: 'Giới hạn (lim)', kw: ['gioi han', 'lim', 'limit'] },
  { id: 'liminf', tab: 'Hàm & giới hạn', latex: '\\lim_{n \\to \\infty} ▢', name: 'Giới hạn tại vô cực', kw: ['gioi han vo cuc', 'lim'] },
  { id: 'log', tab: 'Hàm & giới hạn', latex: '\\log_{▢}(▢)', name: 'Logarit cơ số a', kw: ['logarit', 'log'] },
  { id: 'ln', tab: 'Hàm & giới hạn', latex: '\\ln(▢)', name: 'Logarit tự nhiên (ln)', kw: ['ln', 'logarit tu nhien'] },
  { id: 'sin', tab: 'Hàm & giới hạn', latex: '\\sin(▢)', name: 'Hàm sin', kw: ['sin', 'luong giac'] },
  { id: 'cos', tab: 'Hàm & giới hạn', latex: '\\cos(▢)', name: 'Hàm cos', kw: ['cos', 'luong giac'] },
  { id: 'vec', tab: 'Hàm & giới hạn', latex: '\\vec{▢}', name: 'Vectơ', kw: ['vecto', 'vector'] },
  { id: 'bar', tab: 'Hàm & giới hạn', latex: '\\overline{▢}', name: 'Gạch ngang trên', kw: ['gach ngang', 'trung binh', 'overline'] },

  // ── Ma trận & Hệ ───────────────────────────────────────────────────────────
  {
    id: 'cases',
    tab: 'Ma trận',
    latex: '\\begin{cases} ▢ \\\\ ▢ \\end{cases}',
    name: 'Hệ phương trình / Hàm từng phần',
    kw: ['he phuong trinh', 'cases', 'ngoac nhon'],
  },
  {
    id: 'pmatrix',
    tab: 'Ma trận',
    latex: '\\begin{pmatrix} ▢ & ▢ \\\\ ▢ & ▢ \\end{pmatrix}',
    name: 'Ma trận 2×2 ngoặc tròn',
    kw: ['ma tran', 'pmatrix', 'matrix'],
  },
  {
    id: 'bmatrix',
    tab: 'Ma trận',
    latex: '\\begin{bmatrix} ▢ & ▢ \\\\ ▢ & ▢ \\end{bmatrix}',
    name: 'Ma trận 2×2 ngoặc vuông',
    kw: ['ma tran vuong', 'bmatrix', 'matrix'],
  },
  {
    id: 'vmatrix',
    tab: 'Ma trận',
    latex: '\\begin{vmatrix} ▢ & ▢ \\\\ ▢ & ▢ \\end{vmatrix}',
    name: 'Định thức 2×2 (det)',
    kw: ['dinh thuc', 'det', 'vmatrix'],
  },
];

// Các nút chèn nhanh trên thanh công cụ Markdown (§7.1)
export const QUICK_TOOLBAR_SNIPPETS = [
  { id: 'frac', label: 'a/b', title: 'Phân số (\\frac)', latex: '\\frac{▢}{▢}' },
  { id: 'sqrt', label: '√', title: 'Căn bậc hai (\\sqrt)', latex: '\\sqrt{▢}' },
  { id: 'pow', label: 'xⁿ', title: 'Số mũ (^{})', latex: '^{▢}' },
  { id: 'sub', label: 'xᵢ', title: 'Chỉ số dưới (_{})', latex: '_{▢}' },
  { id: 'sum', label: '∑', title: 'Tổng Sigma (\\sum)', latex: '\\sum_{i=1}^{▢} ▢' },
  { id: 'int', label: '∫', title: 'Tích phân (\\int)', latex: '\\int_{▢}^{▢} ▢\\,dx' },
];

/**
 * Lọc danh sách snippet theo từ khoá (bỏ dấu tiếng Việt) và tab.
 * Nếu có từ khoá `query`, tìm trên toàn bộ các tab.
 */
export function filterSnippets(query = '', activeTab = 'Thường dùng') {
  const q = stripAccents(String(query || '').trim());
  if (!q) {
    return SNIPPETS.filter(s => s.tab === activeTab);
  }
  return SNIPPETS.filter(s => {
    const nameNorm = stripAccents(s.name);
    const latexNorm = s.latex.toLowerCase();
    const kwMatch = (s.kw || []).some(k => stripAccents(k).includes(q));
    return nameNorm.includes(q) || latexNorm.includes(q) || kwMatch;
  });
}

