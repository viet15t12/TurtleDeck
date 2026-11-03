import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

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
          if (filePath.includes('/src/')) {
            const distPath = filePath.replace('/src/', '/dist/');
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
          if (filePath.includes('/dist/')) {
            const srcPath = filePath.replace('/dist/', '/src/');
            if (fs.existsSync(srcPath)) {
              return nextResolve(pathToFileURL(srcPath).href, context);
            }
          }
        }
      } catch {
        // Fallback
      }
    }
    throw err;
  }
}
