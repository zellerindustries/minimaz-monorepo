import { defineConfig } from 'vitest/config';

const workspaceSrcDirs = ['packages/*/src', 'toolkits/*/src', 'tools/*/src', 'app/src'];

export default defineConfig({
    test: {
        include: workspaceSrcDirs.map((dir) => `${dir}/**/*.{test,spec}.ts`),
        passWithNoTests: true,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: workspaceSrcDirs.map((dir) => `${dir}/**/*.ts`),
        },
    },
});
