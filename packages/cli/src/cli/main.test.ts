import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runCli } from './main.js';

describe('runCli', () => {
    let dir: string;
    let originalArgv: string[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let logSpy: any;

    beforeEach(async () => {
        dir = await mkdtemp(path.join(tmpdir(), 'run-cli-'));
        originalArgv = process.argv;
        logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    });

    afterEach(async () => {
        process.argv = originalArgv;
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
        logSpy.mockRestore();
        await rm(dir, { recursive: true, force: true });
    });

    it('reports the version from the given pkgPath, not its own package.json', async () => {
        const pkgPath = path.join(dir, 'package.json');
        await writeFile(pkgPath, JSON.stringify({ version: '9.9.9' }));

        process.argv = ['node', 'main.js', 'version'];
        await runCli(pkgPath);

        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('9.9.9'));
    });
});
