import { register } from 'node:module';

register('./test-loader.mjs', import.meta.url);

const selfUrl = import.meta.url;
if (!process.env.NODE_OPTIONS?.includes('register-test-hooks.mjs')) {
  process.env.NODE_OPTIONS = `${process.env.NODE_OPTIONS || ''} --import ${selfUrl}`.trim();
}

