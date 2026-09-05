//
// The `follows` hyperapp module. Holds the current app state in memory and applies
// edits straight through to Tarang — no local sidecar, no CAS, no snapshot rebuild lag
// to reconcile: `GET /tarang/v1/summary` is synchronous against SQLite, so a refetch after a
// write always sees the write. See docs/state-shape.md.
//
// The action names and state keys are dictated by the vendored view — see
// docs/state-shape.md, "Actions the view calls".
//

import { addFollow, ApiError, editFollow, fetchSummary, removeFollow } from '../data/tarang'
import { loadSettings, saveSettings } from './settings.js'

const HOUSE = '\u{1f3e0}'

function tagPath(follow) {
  const category = follow.category || HOUSE
  return `/tag/${encodeURIComponent(category)}?importance=${follow.importance ?? 0}`
}

/** Re-enables the form after a failed save; the view disables it on submit. */
function unfreezeForm() {
  const working = document.getElementById('working')
  if (working) working.removeAttribute('style')
  for (const button of document.querySelectorAll('form button')) button.disabled = false
}

// A slow refresh must not clobber a newer one if it resolves after. Every write to
// `all` claims the next generation; a refresh only applies its result if nothing newer
// was written while it was in flight.
let generation = 0
let refreshTimer = null

export default {
  state: {
    all: {},
    settings: {},
    started: false,
    baseHref: '',
    editing: null,
    feeds: null,
    updating: {},
    urgent: null,
    reader: null,
    refreshError: null
  },

  actions: {
    init: () => async (_state, actions) => {
      actions.set({ settings: loadSettings() })
      await actions.refresh()
      actions.set({ started: true })

      // Tarang's own scheduler fetches feeds server-side, independent of the client, so
      // staying fresh here just means refetching the one cheap synchronous endpoint —
      // no client-side poll scheduling, no cache-merge logic.
      if (typeof window !== 'undefined') {
        refreshTimer = window.setInterval(() => actions.refresh(), 60_000)
        window.addEventListener('focus', () => actions.refresh())
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') actions.refresh()
        })
      }
    },

    refresh: () => async (_state, actions) => {
      const gen = ++generation
      try {
        const all = await fetchSummary()
        if (gen !== generation) return // superseded while this was in flight
        actions.set({ all, refreshError: null })
      } catch (error) {
        if (gen !== generation) return
        console.error('tarangcat: refresh failed', error)
        actions.set({ refreshError: 'Articles could not be refreshed. Check the connection to Tarang and try again.' })
      }
    },

    changeSetting: ({ name, value }) => (state, actions) => {
      const settings = { ...state.settings }
      // Clicking the active setting turns it off, as upstream does.
      if (settings[name] === value) delete settings[name]
      else settings[name] = value
      saveSettings(settings)
      actions.set({ settings })
    },

    setReaderSetting: ({ name, value }) => (state, actions) => {
      const settings = { ...state.settings, [name]: value }
      saveSettings(settings)
      actions.set({ settings })
    },

    closeReader: id => state => state.reader?.post.id === id ? { reader: null } : {},

    //
    // Save a follow, after add or edit.
    //
    save: (follow) => (state, actions) => {
      const run = async () => {
        try {
          if (!follow.id) {
            const id = await addFollow(follow)
            await actions.refresh()
            actions.location.go(tagPath({ ...follow, id }))
            return
          }

          await editFollow(follow.id, follow)
          await actions.refresh()
          actions.location.go(tagPath(follow))
        } catch (error) {
          actions.reportError(error)
        }
      }
      void run()
    },

    //
    // Removing a follow deletes the feed outright: there is no tombstone concept here,
    // Tarang's DB is the only copy of the follow list.
    //
    confirmRemove: (follow) => (state, actions) => {
      const name = follow.title || follow.url
      if (!window.confirm(`Delete ${name}?\n(${follow.url})`)) return

      const run = async () => {
        try {
          await removeFollow(follow.id)
          const all = { ...state.all }
          delete all[follow.id]
          actions.set({ all })
          actions.location.go('/')
        } catch (error) {
          actions.reportError(error)
        }
      }
      void run()
    },

    reportError: (error) => () => {
      unfreezeForm()
      window.alert(error instanceof ApiError ? error.message : String(error?.message ?? error))
    }
  }
}
