import { register } from 'node:module';
import { fileURLToPath } from 'node:url';

register('./test-loader.mjs', import.meta.url);

const selfPath = fileURLToPath(import.meta.url);
if (!process.env.NODE_OPTIONS?.includes(selfPath)) {
  process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS || ''} --import ${selfPath}`.trim();
}
