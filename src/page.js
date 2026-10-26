import { label } from './shared.js'

export async function open(from) {
  const { render } = await import('./panel.js')
  render(`${from} ${label}`)
}
