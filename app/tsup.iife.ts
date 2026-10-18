import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { waypost: 'src/snippet.ts' },
  format: ['iife'],
  globalName: 'waypost',
  minify: true,
  sourcemap: false,
  clean: false,
  splitting: false,
  target: 'es2020',
  outDir: 'dist',
  platform: 'browser',
  dts: false,
  outExtension() {
    return { js: '.js' };
  },
});
