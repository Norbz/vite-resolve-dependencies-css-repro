// Builds the app, then lists the CSS files that remain in the
// `__vite__mapDeps` array of each emitted JS chunk, although
// `resolveDependencies` in vite.config.js drops every `.css` file.
import { readFile, readdir } from 'node:fs/promises'
import { build } from 'vite'

await build({ logLevel: 'silent' })
console.log()

let found = 0
for (const file of (await readdir('dist/assets')).filter((file) => file.endsWith('.js'))) {
  const deps = (await readFile(`dist/assets/${file}`, 'utf8')).match(/m\.f=(\[[^\]]*\])/)?.[1]
  if (!deps) continue
  const css = JSON.parse(deps).filter((dep) => dep.endsWith('.css'))
  found += css.length
  console.log(`${file} __vite__mapDeps: ${deps}`)
  if (css.length) console.log(`  CSS kept despite resolveDependencies: ${css.join(', ')}`)
}
console.log(found ? `\n${found} CSS file(s) left in __vite__mapDeps.` : 'No CSS file left in __vite__mapDeps.')
process.exitCode = found ? 1 : 0
