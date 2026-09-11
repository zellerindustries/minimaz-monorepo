import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { log } from '@minimaz/logger';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { findMarkdownFiles } from './walk.js';

describe('findMarkdownFiles', () => {
    let dir: string;

    beforeEach(async () => {
        dir = await mkdtemp(path.join(tmpdir(), 'docs-walk-'));
    });

    afterEach(async () => {
        await rm(dir, { recursive: true, force: true });
    });

    it('finds .md files recursively and skips non-.md files with a warning', async () => {
        await writeFile(path.join(dir, 'a.md'), '# A');
        await writeFile(path.join(dir, 'notes.txt'), 'not markdown');
        await mkdir(path.join(dir, 'sub'));
        await writeFile(path.join(dir, 'sub', 'b.md'), '# B');

        const warn = vi.spyOn(log, 'warn').mockImplementation(() => undefined);
        const files = await findMarkdownFiles(dir);

        expect(files.sort()).toEqual(
            [path.join(dir, 'a.md'), path.join(dir, 'sub', 'b.md')].sort(),
        );
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('notes.txt'));
        warn.mockRestore();
    });

    it('returns an empty array for an empty directory', async () => {
        expect(await findMarkdownFiles(dir)).toEqual([]);
    });
});
