---
'@minimaz/cli': patch
---

Fix `init`'s `npm install` step failing with `EALLOWSCRIPTS` when the invoking shell has a global `allow-scripts` npm config set. The nested `npm` command spawned in the new project directory now runs without the inherited `allow-scripts` config variable (`npm_config_allow_scripts`, matched in any case with `-` or `_`); every other `npm_config_*` variable (registry, proxy, auth) is still inherited.
