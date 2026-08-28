import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue2';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const resolveTypesOnly = {
    name: 'resolve-types-only',
    resolveId(id: string) {
        if (id.includes('/api') && !id.endsWith('.vue') && !id.endsWith('.ts') && !id.endsWith('.js') && !id.endsWith('.css')) {
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
    plugins: [resolveTypesOnly, vue()],
    base: './',
    resolve: {
        alias: {
            '@': path.resolve(__dirname, './src'),
            vue: path.resolve(__dirname, './node_modules/vue/dist/vue.runtime.esm.js'),
        },
        dedupe: ['vue', 'vuetify'],
        extensions: ['.mjs', '.js', '.ts', '.jsx', '.tsx', '.json', '.vue'],
    },
    esbuild: {
        tsconfigRaw: {
            compilerOptions: {
                experimentalDecorators: true,
                useDefineForClassFields: false,
            },
        },
    },
    build: {
        outDir: 'dist',
        emptyOutDir: true,
    },
});
