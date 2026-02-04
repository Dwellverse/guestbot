import { defineConfig } from 'vite';

export default defineConfig({
    root: '.',
    publicDir: 'public',
    build: {
        outDir: 'dist',
        emptyDirBeforeWrite: true,
    },
    server: {
        port: 3001,
    },
});
