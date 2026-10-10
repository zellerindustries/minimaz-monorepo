import { cp, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const seedsOut = join(packageRoot, 'dist', 'seeds')

// Clear first so seed files deleted from src/ don't survive in dist/.
await rm(seedsOut, { recursive: true, force: true })
await cp(join(packageRoot, 'src', 'seeds'), seedsOut, {
    recursive: true,
})
