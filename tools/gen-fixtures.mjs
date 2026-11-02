import fs from 'node:fs';
import path from 'node:path';

fs.mkdirSync('test/fixtures/images-dir/img', { recursive: true });

// 1. TSV 100 tu
const lines = ['term\tdefinition\tphonetic\tpos\texample\tforms\tsynonyms\ttags\timage'];
for (let i = 1; i <= 100; i++) {
  const pad = String(i).padStart(3, '0');
  lines.push(`word_${pad}\tĐịnh nghĩa của từ ${i}\t/wɜːd ${pad}/\tverb\tThis is example sentence for word_${pad}.\tword_${pad}s;word_${pad}ed\tsyn_${pad}\ttag_${i % 5}\timg/pic_${pad}.png`);
}
fs.writeFileSync('test/fixtures/vocab-100.tsv', lines.join('\n'));

// 2. CSV phức tạp: BOM, CRLF, dấu phẩy trong ô, nháy kép "", xuống dòng trong ô, dòng trống
const bom = '\uFEFF';
const csvContent = bom + [
  '"term","definition","phonetic","example"',
  '"mitigate","giảm nhẹ, làm dịu","/\'mɪtɪɡeɪt/","Trees help mitigate the effects of climate change."',
  '"complex, term","định nghĩa có ""dấu nháy kép"" và dấu phẩy,","/\'kɒmpleks/","Line 1\r\nLine 2 of example."',
  '', // dòng trống
  '"multiline","Dòng 1 nghĩa\r\nDòng 2 nghĩa","/\'mʌlti/","Ví dụ dòng 1\r\nVí dụ dòng 2"',
  '"dedupe","Từ đầu tiên","",""',
  '"Dedupe","Từ trùng chữ hoa","",""'
].join('\r\n');
fs.writeFileSync('test/fixtures/complex.csv', csvContent);

// 3. Quizlet với dấu tuỳ ý
const quizletCustom = [
  'ubiquitous - phổ biến, xuất hiện ở khắp nơi',
  'ephemeral - phù du, sớm nở tối tàn\r\n(tồn tại trong thời gian ngắn)',
  'resilient - kiên cường, có khả năng phục hồi nhanh'
].join(';;;');
fs.writeFileSync('test/fixtures/quizlet-custom.txt', quizletCustom);

// 4. Markdown vocab
const mdVocab = `# IELTS Vocabulary

## mitigate | giảm nhẹ, làm dịu
- phonetic: /ˈmɪtɪɡeɪt/
- pos: verb
- example: Trees help mitigate the effects of climate change.
- forms: mitigates; mitigated; mitigating
- tags: ielts; environment
- image: img/mitigate.png

## resilient | kiên cường, có thể phục hồi
- phonetic: /rɪˈzɪliənt/
- pos: adjective
- example: The community remained resilient after the storm.
- synonyms: tough; strong
- tags: ielts; personality
`;
fs.writeFileSync('test/fixtures/vocab-sample.md', mdVocab);

// 5. Markdown quiz có LaTeX (không escape \)
const mdQuiz = `## Q m-001 | single | topic=tich-phan
Tính $\\int_0^1 x^2\\,dx$ (xem đồ thị):

![đồ thị y=x²](img/x2-graph.svg)

- [ ] $\\frac{1}{2}$
- [x] $\\frac{1}{3}$
- [ ] $1$

> $$\\int_0^1 x^2\\,dx=\\left[\\frac{x^3}{3}\\right]_0^1=\\frac13$$

## Q m-002 | fill | topic=dai-so
Nghiệm dương của $x^2-2=0$ (3 chữ số thập phân): ___

answer: 1.414 | 1,414
match: number
tolerance: 0.001
answerDisplay: $\\sqrt{2}\\approx 1{,}414$
`;
fs.writeFileSync('test/fixtures/quiz-latex.md', mdQuiz);

// 6. Ảnh svg và png hợp lệ
const validSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="red"/></svg>';
fs.writeFileSync('test/fixtures/images-dir/img/mitigate.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0])); // valid PNG header
fs.writeFileSync('test/fixtures/images-dir/img/x2-graph.svg', validSvg);
fs.writeFileSync('test/fixtures/images-dir/fake.png', 'not an image data at all');
console.log('Fixtures generated successfully');
