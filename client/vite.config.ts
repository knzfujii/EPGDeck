import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const resolveTypesOnly = {
    name: 'resolve-types-only',
    resolveId(id: string) {
        if (id.includes('/api') && !id.endsWith('.svelte') && !id.endsWith('.ts') && !id.endsWith('.js') && !id.endsWith('.css')) {
            return path.resolve(__dirname, '../api.d.ts');
        }
        return null;
    },
    load(id: string) {
        if (id.endsWith('api.d.ts')) {
            return 'export {};';
        }
        return null;
    },
};

export default defineConfig({
    plugins: [
        resolveTypesOnly,
        svelte(),
        tailwindcss(),
    ],
    base: '/',
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
        },
        extensions: ['.mjs', '.js', '.ts', '.json', '.svelte'],
    },
    esbuild: {
        tsconfigRaw: {
            compilerOptions: {
                experimentalDecorators: true,
                useDefineForClassFields: false,
            },
        },
    },
    server: {
        host: '0.0.0.0',
        port: 5173,
        proxy: {
            '/api': 'http://localhost:8889',
            '/thumbnail': 'http://localhost:8889',
            '/streamfiles': 'http://localhost:8889',
            '/icon': 'http://localhost:8889',
            '/img': 'http://localhost:8889',
            '/manifest.json': 'http://localhost:8889',
        },
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
    },
});
