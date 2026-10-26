# Vite: the chunk file name ignores `__vite__mapDeps` when `resolveDependencies` is used

Vite writes the preload list of each dynamic import (`__vite__mapDeps`) in
`generateBundle`, after chunk file names are final. What
`build.modulePreload.resolveDependencies` returns is not part of the chunk
hash, so a chunk can keep its file name while its `__vite__mapDeps` changes.
The description of [vitejs/vite#23793](https://github.com/vitejs/vite/pull/23793)
mentions this remaining bug, with and without `build.chunkImportMap`.

`resolveDependencies` also receives the JS chunks only. Vite sets the CSS files
aside before the call and appends them to the returned list, so a config or a
plugin cannot remove a CSS file from `__vite__mapDeps`.

This affects Nuxt, which rewrites imports of its entry chunk to a stable
`#entry` specifier and uses `resolveDependencies` to drop the entry JS from
these lists. The entry CSS stays in the list, and a chunk keeps its file name
while its content changes when only the global CSS changes. See
[nuxt/nuxt#36136](https://github.com/nuxt/nuxt/issues/36136) and the Nuxt
reproduction,
[Norbz/nuxt-entry-css-preload-repro](https://github.com/Norbz/nuxt-entry-css-preload-repro).

## Reproduction

```bash
npm install
npm run repro
```

The app has an entry (`src/main.js`) that imports `src/shared.js`, which
imports the global `src/global.css`. The entry dynamically imports
`src/page.js`, which dynamically imports `src/panel.js` (which imports
`src/shared.js` and `src/panel.css`).

`repro.mjs` runs three checks:

1. Scenario 1 builds the same sources twice. Build A keeps every dependency,
   and build B drops the entry JS in `resolveDependencies`, as Nuxt does.
2. Scenario 2 uses a `resolveDependencies` that prefixes every path with a CDN
   origin, which the docs allow ("their paths modified"). Build B changes one
   string in `src/panel.js`.
3. The last build uses `vite.config.js`, whose `resolveDependencies` logs its
   arguments and filters out every `.css` file.

Scenarios 1 and 2 run with `build.chunkImportMap` off and on, and list the JS
files that keep their name while their content differs.

Actual output (Vite 8.3.5, Node 24.13.0, macOS 26.6.2):

```
Scenario 1: same sources, resolveDependencies drops the entry JS in build B
  build.chunkImportMap: false
    Same name, different content: page-BK1UovQZ.js
      build A: ["assets/panel-BU71OzCG.js","assets/index-BY3cowcZ.js","assets/index-W1erjkBN.css","assets/panel-Ba75kZbn.css"]
      build B: ["assets/panel-BU71OzCG.js","assets/index-W1erjkBN.css","assets/panel-Ba75kZbn.css"]
  build.chunkImportMap: true
    Same name, different content: page-Co8iPJto.js
      build A: ["assets/panel-rBoDydlK.js","assets/index-CkcvmjhV.js","assets/index-CkcvmjhV.css","assets/panel-rBoDydlK.css"]
      build B: ["assets/panel-rBoDydlK.js","assets/index-CkcvmjhV.css","assets/panel-rBoDydlK.css"]

Scenario 2: resolveDependencies prefixes paths with a CDN origin, build B changes src/panel.js
  build.chunkImportMap: false
    Every changed file got a new name.
  build.chunkImportMap: true
    Same name, different content: page-Co8iPJto.js
      build A: ["https://cdn.example.com/assets/panel-Nt0M1OMx.js","https://cdn.example.com/assets/index-O6IKJ1b7.js","assets/index-CkcvmjhV.css","assets/panel-rBoDydlK.css"]
      build B: ["https://cdn.example.com/assets/panel-TDrQEujH.js","https://cdn.example.com/assets/index-O6IKJ1b7.js","assets/index-CkcvmjhV.css","assets/panel-rBoDydlK.css"]

CSS dependencies: vite.config.js logs what resolveDependencies receives and drops every .css file
  resolveDependencies("assets/index-BY3cowcZ.js", []) from index.html
  resolveDependencies("assets/page-BK1UovQZ.js", []) from assets/index-BY3cowcZ.js
  resolveDependencies("assets/panel-BU71OzCG.js", ["assets/panel-BU71OzCG.js","assets/index-BY3cowcZ.js"]) from assets/page-BK1UovQZ.js
  page-BK1UovQZ.js __vite__mapDeps: ["assets/panel-BU71OzCG.js","assets/index-BY3cowcZ.js","assets/index-W1erjkBN.css","assets/panel-Ba75kZbn.css"]
    CSS kept despite resolveDependencies: assets/index-W1erjkBN.css, assets/panel-Ba75kZbn.css

3 file(s) changed without changing name, 2 CSS file(s) left in __vite__mapDeps.
```

In scenario 1, `page-*.js` keeps its name in both modes while its
`__vite__mapDeps` loses the entry JS. In scenario 2 with
`build.chunkImportMap: true`, the prefixed paths bypass the import map keys,
and `page-*.js` keeps its name while its `__vite__mapDeps` lists the new
`panel-*.js` file. Without `chunkImportMap`, `page-*.js` imports
`panel-<hash>.js` by name, so its own name changes too.

The last check shows that `resolveDependencies` receives the two JS chunks
only, and that the entry CSS (`index-W1erjkBN.css`) and the panel CSS
(`panel-Ba75kZbn.css`) remain in `__vite__mapDeps` after the filter.

Expected:

- Every file whose content changes gets a new name, whatever
  `resolveDependencies` returns.
- `resolveDependencies` receives the CSS dependencies too, or another option
  lets a config drop a CSS file that the page already loads, such as the entry
  CSS linked by `index.html`.

## Cause

In `vite:build-import-analysis` (`importAnalysisBuild.ts`), Vite replaces the
preload marker in `generateBundle`, after Rolldown has computed the file names.
Since vitejs/vite#23793, `augmentChunkHash` adds a signature of the preload
dependencies when `build.chunkImportMap` is on, computed from the chunk graph
without calling `resolveDependencies`.

Before the call, Vite splits the dependencies and appends the CSS afterwards:

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
