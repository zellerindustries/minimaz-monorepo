---
'@minimaz/cli': patch
---

Harden command dispatch: inherited object properties (`constructor`, `toString`, `__proto__`) are now reported as unknown commands instead of being invoked or crashing. `minimaz help <alias>` (e.g. `help i`) now resolves to the aliased command, and help usage lines list the alias on its own `Alias:` line instead of a pipe-separated `init | i`.
