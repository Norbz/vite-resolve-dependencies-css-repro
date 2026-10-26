# Vite: `resolveDependencies` cannot remove CSS from `__vite__mapDeps`

`build.modulePreload.resolveDependencies` receives only the JS chunks of a
dynamic import. Vite sets the CSS files aside before calling it and appends them
to the returned list, so a config or a plugin cannot remove a CSS file from the
`__vite__mapDeps` array written into the importing chunk.

This affects Nuxt, which rewrites imports of its entry chunk to a stable
`#entry` specifier and uses `resolveDependencies` to drop the entry JS from
these lists, so that importers keep their file name when the entry changes. The entry CSS
stays in the list, and a chunk then keeps its file name while its content
changes. See [nuxt/nuxt#36136](https://github.com/nuxt/nuxt/issues/36136) and
the Nuxt reproduction,
[Norbz/nuxt-entry-css-preload-repro](https://github.com/Norbz/nuxt-entry-css-preload-repro).

## Reproduction

```bash
npm install
npm run repro
```

The app has an entry (`src/main.js`) that imports `src/shared.js`, which
imports the global `src/global.css`. The entry dynamically imports
`src/page.js`, which dynamically imports `src/panel.js` (which imports
`src/shared.js` and `src/panel.css`). `vite.config.js` defines a
`resolveDependencies` that logs its arguments and filters out every `.css`
file. `repro.mjs` builds the app and prints the `__vite__mapDeps` array of each
emitted chunk.

Actual output (Vite 8.3.5, Node 24.13.0, macOS 26.6.2):

```
resolveDependencies("assets/index-BY3cowcZ.js", []) from index.html
resolveDependencies("assets/page-BK1UovQZ.js", []) from assets/index-BY3cowcZ.js
resolveDependencies("assets/panel-BU71OzCG.js", ["assets/panel-BU71OzCG.js","assets/index-BY3cowcZ.js"]) from assets/page-BK1UovQZ.js

page-BK1UovQZ.js __vite__mapDeps: ["assets/panel-BU71OzCG.js","assets/index-BY3cowcZ.js","assets/index-W1erjkBN.css","assets/panel-Ba75kZbn.css"]
  CSS kept despite resolveDependencies: assets/index-W1erjkBN.css, assets/panel-Ba75kZbn.css

2 CSS file(s) left in __vite__mapDeps.
```

`resolveDependencies` receives the two JS chunks only. The entry CSS
(`index-W1erjkBN.css`) and the panel CSS (`panel-Ba75kZbn.css`) remain in
`__vite__mapDeps` after the filter.

Expected: `resolveDependencies` receives the CSS dependencies too, or another
option lets a config drop a CSS file that the page already loads, such as the
entry CSS linked by `index.html`.

## Cause

In `vite:build-import-analysis` (`importAnalysisBuild.ts`, `generateBundle`),
Vite splits the dependencies before the call and appends the CSS afterwards:

```ts
for (const dep of depsArray) (dep.endsWith('.css') ? cssDeps : otherDeps).push(dep)
depsArray = [...resolveDependencies(normalizedFile, otherDeps, { hostId: file, hostType: 'js' }), ...cssDeps]
```

[vitejs/vite#9938](https://github.com/vitejs/vite/pull/9938) introduced this
split, because the same mechanism inserts the stylesheets that a lazy chunk
needs.

## Versions

- `vite` 8.3.5 (pinned in `package.json`), with `rolldown` 1.2.15
- Node 24.13.0
- macOS 26.6.2
