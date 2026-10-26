import { label } from './shared.js'
import './panel.css'

export function render(text) {
  document.body.append(`${text} ${label}`)
}
