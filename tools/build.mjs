// tools/build.mjs — Script build toàn bộ src sang dist/
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

console.log('Building TypeScript sources...');
execSync('npx tsc', { stdio: 'inherit' });

// Compile preload.ts -> dist/preload.js (CommonJS)
fs.writeFileSync('tsconfig.preload.json', JSON.stringify({
  compilerOptions: {
    target: 'ES2022',
    module: 'CommonJS',
    lib: ['ES2022', 'DOM'],
    strict: true,
    esModuleInterop: true,
    skipLibCheck: true,
    outDir: 'dist'
  },
  include: ['preload.ts']
}, null, 2));
execSync('npx tsc -p tsconfig.preload.json', { stdio: 'inherit' });

// Compile src -> dist
fs.writeFileSync('tsconfig.build.json', JSON.stringify({
  extends: './tsconfig.json',
  compilerOptions: {
    rootDir: 'src',
    outDir: 'dist'
  },
  include: ['src/main/**/*.ts', 'src/core/**/*.ts']
}, null, 2));
execSync('npx tsc -p tsconfig.build.json', { stdio: 'inherit' });

// Copy package.json for dist/main
fs.mkdirSync('dist/main', { recursive: true });
fs.copyFileSync('src/main/package.json', 'dist/main/package.json');

// Copy .js files from src/core to dist/core
fs.mkdirSync('dist/core', { recursive: true });
for (const f of fs.readdirSync('src/core')) {
  if (f.endsWith('.js')) {
    fs.copyFileSync(path.join('src/core', f), path.join('dist/core', f));
  }
}

console.log('Build completed successfully.');
