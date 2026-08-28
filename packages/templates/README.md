# @minimaz/templates

Manages the global `~/.minimaz` directory: settings and template CRUD.

## Install

```bash
npm install @minimaz/templates
```

## Usage

```ts
import {
    getGlobalDir,
    getTemplatesDir,
    listTemplates,
    saveTemplate,
    deleteTemplate,
    updateTemplateFrom,
    writeSettings,
    seedDefaults,
} from "@minimaz/templates";

const globalDir = getGlobalDir();
const templatesDir = getTemplatesDir(globalDir);
const names = await listTemplates(templatesDir);
```

## API

- `getGlobalDir()` — the global `~/.minimaz` directory path.
- `getTemplatesDir(globalDir)` — the templates subdirectory path.
- `getTemplatePath(templatesDir, name)` — resolves a single template's path.
- `listTemplates(templatesDir)` — lists saved template names.
- `saveTemplate(...)` — saves the current (or a given) folder as a template.
- `deleteTemplate(templatesDir, name)` — deletes a saved template.
- `updateTemplateFrom(...)` — updates a single template from cwd, or all templates from the package's bundled
  defaults.
- `writeSettings(...)` — creates/patches `~/.minimaz/settings.json`, adding missing keys and warning on unknown
  ones without auto-removing anything.
- `seedDefaults(...)` — copies the bundled `default`/`simple` templates into `~/.minimaz/templates`.
- `TemplateNotFoundError`, `InvalidTemplateNameError`.

Depends on [`@minimaz/core`](../core) and [`@minimaz/logger`](../logger).
