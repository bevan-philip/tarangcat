//
// The `follows` hyperapp module. Holds the current app state in memory and applies
// edits straight through to Tarang — no local sidecar, no CAS, no snapshot rebuild lag
// to reconcile: `GET /tarang/v1/summary` is synchronous against SQLite, so a refetch after a
// write always sees the write.
//
// The action names and state keys are dictated by the vendored view.
//

import { addFollow, ApiError, editFollow, fetchArticle, fetchFollow, fetchSummary, removeFollow } from '../data/tarang'
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
let readerGeneration = 0
let editGeneration = 0

export default {
  state: {
    all: {},
    settings: {},
    started: false,
    baseHref: '',
    editing: null,
    editId: null,
    editError: null,
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
      // refresh the summary while a feed list is visible.
      if (typeof window !== 'undefined') {
        refreshTimer = window.setInterval(() => actions.refresh(), 60_000)
        window.addEventListener('hashchange', () => actions.refresh())
        window.addEventListener('focus', () => actions.refresh())
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') actions.refresh()
        })
      }
    },

    refresh: () => async (_state, actions) => {
      const gen = ++generation
      if (/^#!\/(edit|view|add|settings)(\/|\?|$)/.test(window.location.hash)) return
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

    openReader: id => async (state, actions) => {
      const gen = ++readerGeneration
      actions.set({ reader: { id, loading: true } })
      try {
        const { post, feedId } = await fetchArticle(id)
        let follow = state.all[feedId]
        if (!follow) {
          try { follow = await fetchFollow(feedId) } catch { /* Content remains readable without feed metadata. */ }
        }
        if (gen !== readerGeneration) return
        actions.set({ reader: { id, post, title: follow?.title || '', back: follow ? tagPath(follow) : '/' } })
      } catch (error) {
        if (gen !== readerGeneration) return
        actions.set({ reader: { id, error: error instanceof ApiError && error.status === 404
          ? 'This article is no longer available in Tarang.'
          : 'The article could not be loaded. Check the connection to Tarang and try again.' } })
      }
    },

    closeReader: id => state => {
      if (state.reader?.id !== id) return {}
      ++readerGeneration
      return { reader: null }
    },

    loadEditing: id => async (_state, actions) => {
      const gen = ++editGeneration
      actions.set({ editId: id, editing: null, editError: null })
      try {
        const editing = await fetchFollow(id)
        if (gen === editGeneration) actions.set({ editing })
      } catch (error) {
        if (gen === editGeneration) actions.set({ editError: error instanceof ApiError && error.status === 404
          ? 'This feed is no longer available in Tarang.' : 'The feed could not be loaded. Try again.' })
      }
    },

    closeEditing: id => state => {
      if (state.editId !== id) return {}
      ++editGeneration
      return { editId: null, editing: null, editError: null }
    },

    //
    // Save a follow, after add or edit.
    //
    save: (follow) => (state, actions) => {
      const run = async () => {
        try {
          if (!follow.id) {
            const id = await addFollow(follow)
            actions.location.go(tagPath({ ...follow, id }))
            return
          }

          await editFollow(follow.id, follow)
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
