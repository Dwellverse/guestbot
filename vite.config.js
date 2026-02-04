import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
    root: '.',
    publicDir: 'public',
    build: {
        outDir: 'dist',
        emptyDirBeforeWrite: true,
        rollupOptions: {
            input: {
                main: resolve(__dirname, 'index.html'),
                chat: resolve(__dirname, 'chat.html'),
            },
        },
    },
    server: {
        port: 3001,
    },
});
