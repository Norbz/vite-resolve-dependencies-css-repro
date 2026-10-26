// Shows that the chunk file name ignores what `resolveDependencies` writes into
// `__vite__mapDeps`. Each scenario builds the app twice, with and without
// `build.chunkImportMap`, and lists the JS files that keep their name while
// their content differs. A last build with vite.config.js shows that
// `resolveDependencies` never receives the CSS dependencies.
import { readFile, readdir, writeFile } from 'node:fs/promises'
import { build } from 'vite'

const mapDeps = (code) => code.match(/m\.f=(\[[^\]]*\])/)?.[1]

async function buildApp(chunkImportMap, resolveDependencies) {
  await build({ logLevel: 'silent', configFile: false, build: { chunkImportMap, modulePreload: { resolveDependencies } } })
  const files = (await readdir('dist/assets')).filter((file) => file.endsWith('.js'))
  return Object.fromEntries(await Promise.all(files.map(async (file) => [file, await readFile(`dist/assets/${file}`, 'utf8')])))
}

function compare(a, b) {
  let stale = 0
  for (const [file, code] of Object.entries(a)) {
    if (!(file in b) || b[file] === code) continue
    stale++
    console.log(`    Same name, different content: ${file}`)
    console.log(`      build A: ${mapDeps(code)}`)
    console.log(`      build B: ${mapDeps(b[file])}`)
  }
  if (!stale) console.log('    Every changed file got a new name.')
  return stale
}

let stale = 0
const keepAll = (filename, deps) => deps

console.log('Scenario 1: same sources, resolveDependencies drops the entry JS in build B')
for (const chunkImportMap of [false, true]) {
  console.log(`  build.chunkImportMap: ${chunkImportMap}`)
  const a = await buildApp(chunkImportMap, keepAll)
  const b = await buildApp(chunkImportMap, (filename, deps) => deps.filter((dep) => !/^assets\/index-/.test(dep)))
  stale += compare(a, b)
}

console.log('\nScenario 2: resolveDependencies prefixes paths with a CDN origin, build B changes src/panel.js')
const cdn = (filename, deps) => deps.map((dep) => `https://cdn.example.com/${dep}`)
const panel = await readFile('src/panel.js', 'utf8')
for (const chunkImportMap of [false, true]) {
  console.log(`  build.chunkImportMap: ${chunkImportMap}`)
  const a = await buildApp(chunkImportMap, cdn)
  await writeFile('src/panel.js', panel.replace('${text} ${label}', '${text} ${label}!'))
  try {
    stale += compare(a, await buildApp(chunkImportMap, cdn))
  } finally {
    await writeFile('src/panel.js', panel)
  }
}

console.log('\nCSS dependencies: vite.config.js logs what resolveDependencies receives and drops every .css file')
await build({ logLevel: 'silent' })
let css = 0
for (const file of (await readdir('dist/assets')).filter((file) => file.endsWith('.js'))) {
  const deps = mapDeps(await readFile(`dist/assets/${file}`, 'utf8'))
  if (!deps) continue
  const kept = JSON.parse(deps).filter((dep) => dep.endsWith('.css'))
  css += kept.length
  console.log(`  ${file} __vite__mapDeps: ${deps}`)
  if (kept.length) console.log(`    CSS kept despite resolveDependencies: ${kept.join(', ')}`)
}

console.log(`\n${stale} file(s) changed without changing name, ${css} CSS file(s) left in __vite__mapDeps.`)
process.exitCode = stale || css ? 1 : 0
