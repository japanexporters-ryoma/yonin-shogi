import { defineConfig } from 'vite';

// GitHub Pages のサブパスでも動くよう、相対パスで出力する。
export default defineConfig({
  base: './',
});
