import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    modulePreload: {
      // Logs the dependencies Vite passes in, then drops every CSS file.
      resolveDependencies(filename, deps, { hostId }) {
        console.log(`resolveDependencies("${filename}", ${JSON.stringify(deps)}) from ${hostId}`)
        return deps.filter((dep) => !dep.endsWith('.css'))
      },
    },
  },
})
