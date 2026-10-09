---
'@minimaz/templates': patch
---

Restore the `npmGlobalPath` field to `~/.minimaz/settings.json`, matching `minimaz-cli`'s schema — its absence caused a spurious "Unknown key" warning for anyone who'd previously run `minimaz-cli`'s `config` command. Computed from `npm_config_prefix` (when set) instead of shelling out to `npm config get prefix`, since the field is write-only and never read back. The path now points at `node_modules/@minimaz/sitekit` (the package that publishes the `minimaz`/`mz` bin), the field is optional in `Settings` and omitted when no absolute path can be derived (e.g. `APPDATA` unset on Windows, which previously yielded a relative path), and a missing `npmGlobalPath` in an existing settings file no longer logs an "Added missing key" warning.
