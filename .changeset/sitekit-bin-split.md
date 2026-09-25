---
'@minimaz/cli': minor
---

@minimaz/sitekit is now the published minimaz/mz CLI bin, wrapping @minimaz/cli's commands.
@minimaz/cli no longer publishes its own bin, and its postinstall script (which bootstrapped
~/.minimaz/) was removed — install @minimaz/sitekit instead, which publishes the bin and runs
the equivalent postinstall bootstrap.
