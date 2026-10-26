import { label } from './shared.js'

document.querySelector('#open').addEventListener('click', async () => {
  const { open } = await import('./page.js')
  open(label)
})
