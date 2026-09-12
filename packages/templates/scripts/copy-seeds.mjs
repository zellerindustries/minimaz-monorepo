import { cp } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)))

await cp(join(packageRoot, 'src', 'seeds'), join(packageRoot, 'dist', 'seeds'), {
    recursive: true,
})
