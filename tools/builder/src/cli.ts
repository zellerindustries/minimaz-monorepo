#!/usr/bin/env node
import { buildPackage, discoverPackageDirs } from './core.js';
import { handleCliError } from '@minimaz/errors';

async function main(): Promise<void> {
    const useAll = process.argv.includes('--all');

    try {
        if (useAll) {
            const dirs = await discoverPackageDirs(process.cwd());

            for (const dir of dirs) {
                try {
                    await buildPackage(dir);
                } catch (error: unknown) {
                    const message = error instanceof Error ? error.message : String(error);
                    throw new Error(`${dir}: ${message}`, { cause: error });
                }
            }
        } else {
            await buildPackage(process.cwd());
        }
    } catch (error: unknown) {
        handleCliError(error);
    }
}

await main();
