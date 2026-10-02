import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// Build de saída em ./dist, pronta para subir no bucket S3 servido pelo CloudFront
export default defineConfig({
    plugins: [react()],
    base: './', // caminhos relativos: importante para servir via S3/CloudFront em qualquer prefixo
    define: {
        global: 'globalThis',
    },
    build: {
        outDir: 'dist',
        sourcemap: false,
    },
});
