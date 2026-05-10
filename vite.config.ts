import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: path.resolve(__dirname, 'src/client'),
  build: {
    outDir: path.resolve(__dirname, 'dist/client'),
    emptyOutDir: true,
  },
  server: {
    port: 3000,
  },
});
