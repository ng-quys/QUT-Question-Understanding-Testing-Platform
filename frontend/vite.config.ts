import { defineConfig } from 'vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  plugins: [react(), babel({presets:[reactCompilerPreset()]}), tailwindcss()],
  define: { 'import.meta.env.VITE_APP_KIND': JSON.stringify('portal') },
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('../frontend-shared/src', import.meta.url)) },
    dedupe: ['react','react-dom','react-router-dom','motion'],
  },
  server: { host:'127.0.0.1', port:5173, strictPort:true, fs:{allow:[fileURLToPath(new URL('..',import.meta.url))]} },
  preview: { port:4173, strictPort:true },
});
