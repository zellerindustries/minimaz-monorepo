// Copies `src/seeds` to `dist/seeds` for the current package. Run from a package directory, after `tsc`:
// `node ../../scripts/copy-seeds.mjs`.
import { cp, rm } from 'node:fs/promises'

// Clear first so seed files deleted from src/ don't survive in dist/.
await rm('dist/seeds', { recursive: true, force: true })
await cp('src/seeds', 'dist/seeds', { recursive: true })
