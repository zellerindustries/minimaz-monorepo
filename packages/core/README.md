# @minimaz/core

Filesystem utilities (path checks, JSON reads, copy/remove/output helpers) shared across the Minimaz ecosystem.

## Install

```bash
npm install @minimaz/core
```

## Usage

```ts
import {
    pathExists,
    readJsonFile,
    outputFile,
    copy,
    remove,
} from "@minimaz/core";

if (await pathExists("minimaz.config.json")) {
    const config = await readJsonFile<Record<string, unknown>>(
        "minimaz.config.json",
    );
}

await outputFile("dist/index.html", "<html></html>");
```

## API

- `pathExists(path)` — whether a path exists.
- `readJsonFile<T>(file)` — reads and `JSON.parse`s a file.
- `getDirElements(dir)` — lists a directory's entries.
- `isDirectory(path)` — whether a path is a directory.
- `getFileContent(path)` — reads a file as UTF-8 text.
- `copy(src, dest, overwrite?)` — copies a file or directory.
- `remove(path)` — removes a file or directory.
- `ensureDir(path)` — creates a directory (and parents) if missing.
- `outputFile(path, data, options?)` — writes a file, creating parent directories first.
- Re-exports `basename`, `dirname`, `extname`, `isAbsolute`, `join`, `normalize`, `resolve` from `node:path`.

Depends on [`@minimaz/logger`](../logger).
