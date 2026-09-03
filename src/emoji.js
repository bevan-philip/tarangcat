//
// A small emoji picker for the tag field.
//
// Replaces @kickscondor/emoji-button (last published 2019) with the same interface the
// vendored view uses: `on('emoji', fn)`, `showPicker(event)`, `hidePicker()` and the
// `pickerVisible` flag. Tags in Fraidycat are usually one of a handful of symbols, so a
// grid of common ones beats a 1600-emoji searchable dialog on a phone.
//

const EMOJI = [
  '🏠', '📚', '🎨', '🎧', '🎬', '📷', '🕹️', '🧪',
  '💻', '📰', '🌍', '🔬', '🍳', '🌱', '🐈', '🐕',
  '⚽', '🚲', '✈️', '🧵', '🎲', '🪩', '🛠️', '💬',
  '❤️', '⭐', '🔥', '💡', '🧠', '📈', '🗺️', '🎵'
]

export default class EmojiButton {
  constructor() {
    this.pickerVisible = false
    this.handlers = { emoji: [] }
    this.element = null
    this.onDocumentClick = (event) => {
      if (this.element && !this.element.contains(event.target)) this.hidePicker()
    }
  }

  on(event, handler) {
    if (!this.handlers[event]) this.handlers[event] = []
    this.handlers[event].push(handler)
    return this
  }

  #emit(event, value) {
    for (const handler of this.handlers[event] ?? []) handler(value)
  }

  showPicker(event) {
    this.hidePicker()

    const anchor = event?.target ?? document.body
    const element = document.createElement('div')
    element.className = 'emoji-picker'

    for (const emoji of EMOJI) {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = emoji
      button.addEventListener('click', (click) => {
        click.preventDefault()
        this.#emit('emoji', emoji)
        this.hidePicker()
      })
      element.appendChild(button)
    }

    const parent = anchor.parentNode ?? document.body
    parent.insertBefore(element, anchor.nextSibling)
    this.element = element
    this.pickerVisible = true
    // Deferred so the click that opened the picker does not immediately close it.
    setTimeout(() => document.addEventListener('click', this.onDocumentClick), 0)
  }

  hidePicker() {
    document.removeEventListener('click', this.onDocumentClick)
    if (this.element?.parentNode) this.element.parentNode.removeChild(this.element)
    this.element = null
    this.pickerVisible = false
  }
}
