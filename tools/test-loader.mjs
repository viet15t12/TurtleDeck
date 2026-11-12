import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

function replaceLast(filePath, fromDir, toDir) {
  const slashPattern = '/' + fromDir + '/';
  const backslashPattern = '\\' + fromDir + '\\';
  const idx = Math.max(filePath.lastIndexOf(slashPattern), filePath.lastIndexOf(backslashPattern));
  if (idx === -1) return null;
  const sep = filePath[idx];
  return filePath.slice(0, idx) + sep + toDir + sep + filePath.slice(idx + fromDir.length + 2);
}

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (err.code === 'ERR_MODULE_NOT_FOUND' && context.parentURL) {
      try {
        const resolvedUrl = new URL(specifier, context.parentURL);
        if (resolvedUrl.protocol === 'file:') {
          const filePath = fileURLToPath(resolvedUrl);

          // 1. Chuyển hướng src -> dist khi module TypeScript đã build sang dist/
          const distPath = replaceLast(filePath, 'src', 'dist');
          if (distPath) {
            if (fs.existsSync(distPath)) {
              return nextResolve(pathToFileURL(distPath).href, context);
            }
            // Hỗ trợ import file TS trong src (ví dụ .ts khi gọi đuôi .js)
            const tsPath = filePath.replace(/\.js$/, '.ts');
            if (fs.existsSync(tsPath)) {
              return nextResolve(pathToFileURL(tsPath).href, context);
            }
          }

          // 2. Chuyển hướng dist -> src khi module/vendor chưa compile hoặc ở dạng JS nguồn
          const srcPath = replaceLast(filePath, 'dist', 'src');
          if (srcPath) {
            if (fs.existsSync(srcPath)) {
              return nextResolve(pathToFileURL(srcPath).href, context);
            }
            const tsSrcPath = srcPath.replace(/\.js$/, '.ts');
            if (fs.existsSync(tsSrcPath)) {
              return nextResolve(pathToFileURL(tsSrcPath).href, context);
            }
          }

          // 3. Hỗ trợ import file TS nói chung khi import đuôi .js nhưng chỉ có file .ts
          const directTsPath = filePath.replace(/\.js$/, '.ts');
          if (fs.existsSync(directTsPath)) {
            return nextResolve(pathToFileURL(directTsPath).href, context);
          }
        }
      } catch {
        // Fallback
      }
    }
    throw err;
  }
}
