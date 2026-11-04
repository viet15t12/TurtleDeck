// tools/build.mjs — Script đóng gói toàn bộ frontend và platform layer sang dist/ cho Tauri
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

console.log('[Build] Building Turtle Deck frontend for Tauri...');
console.log('Typechecking TypeScript sources...');
execSync('npx tsc --noEmit', { stdio: 'inherit' });

// Compile core TypeScript nếu có
fs.writeFileSync(
  'tsconfig.build.json',
  JSON.stringify(
    {
      extends: './tsconfig.json',
      compilerOptions: {
        rootDir: 'src',
        outDir: 'dist',
      },
      include: ['src/core/**/*.ts'],
    },
    null,
    2
  )
);
execSync('npx tsc -p tsconfig.build.json', { stdio: 'inherit' });

// Bundle renderer app.js via esbuild
console.log('Bundling renderer with esbuild...');
execSync('npx esbuild src/app.js --bundle --format=esm --sourcemap --outfile=dist/app.js', { stdio: 'inherit' });

// Copy package.json và các file .js trong core
fs.mkdirSync('dist/core', { recursive: true });
if (fs.existsSync('src/core/package.json')) {
  fs.copyFileSync('src/core/package.json', 'dist/core/package.json');
}
for (const f of fs.readdirSync('src/core')) {
  if (f.endsWith('.js')) {
    fs.copyFileSync(path.join('src/core', f), path.join('dist/core', f));
  }
}

// Copy renderer static assets to dist/
const staticFiles = ['index.html', 'shortcuts.js', 'theme-init.js', 'tts.js', 'styles.css'];
for (const f of staticFiles) {
  const srcPath = path.join('src', f);
  if (fs.existsSync(srcPath)) {
    fs.copyFileSync(srcPath, path.join('dist', f));
  }
}

const staticDirs = ['views', 'styles', 'vendor', 'assets'];
for (const d of staticDirs) {
  const srcDir = path.join('src', d);
  if (fs.existsSync(srcDir)) {
    fs.cpSync(srcDir, path.join('dist', d), { recursive: true });
  }
}

// Bundle Tauri platform API layer
fs.mkdirSync('dist/platform', { recursive: true });
console.log('Bundling Tauri platform API layer...');
execSync(
  'npx esbuild src/platform/tauri-api.js --bundle --format=esm --sourcemap --outfile=dist/platform/tauri-api.js',
  { stdio: 'inherit' }
);
if (fs.existsSync('src/platform/channels.js')) {
  fs.copyFileSync('src/platform/channels.js', 'dist/platform/channels.js');
}

// Cập nhật dist/index.html cho Tauri: chèn tauri-api.js và cập nhật CSP
let html = fs.readFileSync('dist/index.html', 'utf8');

// Cập nhật CSP
const tauriCsp =
  "default-src 'self' asset: ipc: http://ipc.localhost; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' asset: data:; font-src 'self' data:; connect-src 'self' asset: ipc: http://ipc.localhost; object-src 'none'; base-uri 'none'; frame-src 'none';";
html = html.replace(/<meta\s+http-equiv="Content-Security-Policy"[^>]*>/i, `<meta http-equiv="Content-Security-Policy" content="${tauriCsp}">`);

// Chèn script tauri-api.js trước app.js
if (!html.includes('tauri-api.js')) {
  html = html.replace(
    '<script type="module" src="./app.js"></script>',
    '<script type="module" src="./platform/tauri-api.js"></script>\n    <script type="module" src="./app.js"></script>'
  );
}

fs.writeFileSync('dist/index.html', html, 'utf8');

console.log('Build completed successfully for Tauri.');
