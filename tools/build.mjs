// tools/build.mjs — Script build toàn bộ src sang dist/ hỗ trợ cả shell electron và tauri
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const shellArg = process.argv.find((a) => a.startsWith('--shell='))?.split('=')[1] || 'electron';
const isTauri = shellArg === 'tauri';

console.log(`[Build] Target shell: ${isTauri ? 'Tauri' : 'Electron'}`);
console.log('Typechecking TypeScript sources...');
execSync('npx tsc --noEmit', { stdio: 'inherit' });

if (!isTauri) {
  // Compile preload.ts -> dist/preload.js (CommonJS cho Electron)
  fs.writeFileSync(
    'tsconfig.preload.json',
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'CommonJS',
          lib: ['ES2022', 'DOM'],
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          outDir: 'dist',
        },
        include: ['preload.ts'],
      },
      null,
      2
    )
  );
  execSync('npx tsc -p tsconfig.preload.json', { stdio: 'inherit' });

  // Compile TypeScript sources (main & preload & core)
  fs.writeFileSync(
    'tsconfig.build.json',
    JSON.stringify(
      {
        extends: './tsconfig.json',
        compilerOptions: {
          rootDir: 'src',
          outDir: 'dist',
        },
        include: ['src/main/**/*.ts', 'src/core/**/*.ts'],
      },
      null,
      2
    )
  );
  execSync('npx tsc -p tsconfig.build.json', { stdio: 'inherit' });

  // Copy package.json for dist/main
  fs.mkdirSync('dist/main', { recursive: true });
  fs.copyFileSync('src/main/package.json', 'dist/main/package.json');
} else {
  // Với Tauri: compile core TypeScript nếu cần
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
}

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

// Copy renderer assets to dist/
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

// Copy hoặc bundle platform layer
fs.mkdirSync('dist/platform', { recursive: true });
if (isTauri) {
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
} else {
  // Shell Electron: copy shim
  if (fs.existsSync('src/platform/electron-shim.js')) {
    fs.copyFileSync('src/platform/electron-shim.js', 'dist/platform/electron-shim.js');
  }
}

console.log(`Build completed successfully for ${isTauri ? 'Tauri' : 'Electron'}.`);
