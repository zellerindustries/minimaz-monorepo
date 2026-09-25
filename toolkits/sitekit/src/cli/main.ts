#!/usr/bin/env node
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { runCli } from '@minimaz/cli'

const pkgPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'package.json')

await runCli(pkgPath)
