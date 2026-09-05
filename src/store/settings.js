//
// Display settings (sort order, theme, expand mode) are device-local: Tarang has no
// concept of them, so they live only in this browser's localStorage.
//

const KEY = 'tarangcat.settings'

export function loadSettings() {
  try {
    const raw = window.localStorage.getItem(KEY)
    const settings = raw ? JSON.parse(raw) : {}
    return settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {}
  } catch {
    return {}
  }
}

export function saveSettings(settings) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(settings))
  } catch {
    // Private mode: settings just do not persist.
  }
}
