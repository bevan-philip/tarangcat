//
// The `follows` hyperapp module. Holds the current app state in memory and applies
// edits straight through to Tarang — no local sidecar, no CAS, no snapshot rebuild lag
// to reconcile: `GET /tarang/v1/summary` is synchronous against SQLite, so a refetch after a
// write always sees the write.
//
// The action names and state keys are dictated by the vendored view.
//

import { addFollow, ApiError, editFollow, fetchArticle, fetchFollow, fetchSummary, fetchStarred, updateArticleState, listCategories, removeFollow } from '../data/tarang'
import { loadSettings, saveSettings } from './settings.js'
import { visibleCategories } from './categories.js'
import { prepareFollowUpdate } from '../data/tarang'

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
let categoryGeneration = 0
const articleWrites = new Map()
const articleResults = new Map()
let activeWrites = 0

export default {
  state: {
    all: {},
    summaryLoaded: false,
    settings: {},
    started: false,
    baseHref: '',
    editing: null,
    editId: null,
    editError: null,
    categories: null,
    categoryError: null,
    bulk: null,
    bulkBusy: false,
    feeds: null,
    updating: {},
    urgent: null,
    reader: null,
    readerReturn: null,
    starred: null,
    articlePending: {},
    articleErrors: {},
    refreshError: null
  },

  actions: {
    openBulk: ({ category, frequency }) => (_state, actions) => {
      actions.set({ bulk: { category, frequency, selected: {}, operation: 'importance', importance: frequency, destination: '', pending: false, message: '' } })
      actions.loadCategories()
    },
    closeBulk: () => ({ bulk: null }),
    changeBulk: patch => state => state.bulk && !state.bulk.pending ? { bulk: { ...state.bulk, ...patch } } : {},
    applyBulk: () => async (state, actions) => {
      const bulk = state.bulk
      if (!bulk || bulk.pending || state.bulkBusy) return
      const ids = Object.keys(bulk.selected).filter(id => bulk.selected[id] && state.all[id] && (state.all[id].category || HOUSE) === bulk.category && state.all[id].importance === bulk.frequency)
      if (!ids.length) return
      if (bulk.operation === 'delete' && !window.confirm(`Delete ${ids.length} selected feed${ids.length === 1 ? '' : 's'} and their cached articles? This cannot be undone.`)) return
      actions.set({ bulkBusy: true, bulk: { ...bulk, pending: true, message: '' } })
      ++generation
      ++activeWrites
      const failed = []
      try {
        const change = bulk.operation === 'category' ? { category: bulk.destination.trim() } : { importance: bulk.importance }
        const write = bulk.operation === 'delete' ? removeFollow : await prepareFollowUpdate(change)
        // Keep requests bounded for large OPML imports and retain individual failures.
        for (const id of ids) {
          try {
            await write(id)
            actions.applyBulkResult({ id, change, operation: bulk.operation })
          } catch { failed.push(id) }
        }
        actions.finishBulk({ original: bulk, failed, message: `${ids.length - failed.length} of ${ids.length} feeds updated.${failed.length ? ' Failed feeds remain selected. Try again.' : ''}` })
      } catch {
        actions.finishBulk({ original: bulk, failed: ids, message: 'Could not prepare this update. Your selection is unchanged. Try again.' })
      } finally {
        ++generation
        --activeWrites
        actions.set({ bulkBusy: false })
        if (!activeWrites) actions.refresh()
      }
    },
    applyBulkResult: ({ id, change, operation }) => state => {
      const all = { ...state.all }
      if (operation === 'delete') delete all[id]
      else if (all[id]) all[id] = { ...all[id], ...change }
      return { all }
    },
    finishBulk: ({ original, failed, message }) => state => {
      if (!state.bulk || state.bulk.category !== original.category || state.bulk.frequency !== original.frequency || !state.bulk.pending) return {}
      return { bulk: { ...state.bulk, pending: false, selected: Object.fromEntries(failed.map(id => [id, true])), message } }
    },
    saveArticleState: ({ id, flags }) => (_state, actions) => {
      ++generation
      ++activeWrites
      actions.articleWriteStarted(id)
      // Serialize writes to each article: PATCH returns both flags, so concurrent
      // responses could otherwise undo a more recent read or star change locally.
      const write = (articleWrites.get(id) || Promise.resolve()).then(async () => {
        try {
          const result = await updateArticleState(id, flags)
          actions.applyArticleState({ id, result })
        } catch {
          actions.articleWriteFailed({ id, flags })
        } finally {
          ++generation
          --activeWrites
          actions.articleWriteFinished(id)
        }
      })
      articleWrites.set(id, write)
      void write.then(() => {
        if (articleWrites.get(id) === write) articleWrites.delete(id)
        if (!activeWrites) actions.refresh()
      })
      return write
    },

    articleWriteStarted: id => state => ({
      articlePending: { ...state.articlePending, [id]: (state.articlePending[id] || 0) + 1 },
      articleErrors: { ...state.articleErrors, [id]: null }
    }),
    articleWriteFinished: id => state => ({
      articlePending: { ...state.articlePending, [id]: state.articlePending[id] - 1 }
    }),
    articleWriteFailed: ({ id, flags }) => state => ({
      articleErrors: { ...state.articleErrors, [id]: { flags,
        message: flags.is_read ? 'Could not mark this article as read.' : 'Could not save this article’s star.' } }
    }),
    applyArticleState: ({ id, result }) => state => {
      articleResults.set(id, result)
      const update = post => post.id === id ? { ...post, isRead: result.is_read, isStarred: result.is_starred } : post
      return {
        all: Object.fromEntries(Object.entries(state.all).map(([key, follow]) => [key, { ...follow, posts: follow.posts.map(update) }])),
        starred: state.starred?.map(update).filter(post => post.isStarred) ?? null,
        reader: state.reader?.post ? { ...state.reader, post: update(state.reader.post) } : state.reader
      }
    },

    loadCategories: ({ usedOnly = false } = {}) => async (state, actions) => {
      const gen = ++categoryGeneration
      if (usedOnly && state.summaryLoaded) {
        actions.set({ categories: visibleCategories(state.all).map(name => ({ pk: name, name })), categoryError: null })
        return
      }
      actions.set({ categories: null, categoryError: null })
      try {
        const categories = usedOnly
          ? visibleCategories(await fetchSummary()).map(name => ({ pk: name, name }))
          : await listCategories()
        if (gen === categoryGeneration) actions.set({ categories })
      } catch {
        if (gen === categoryGeneration) actions.set({ categoryError: 'Categories could not be loaded. You can still type a category.' })
      }
    },

    closeCategories: () => () => {
      ++categoryGeneration
      return { categories: null, categoryError: null }
    },

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
      if (activeWrites) return
      if (/^#!\/(edit|view|add|settings)(\/|\?|$)/.test(window.location.hash)) return
      try {
        if (/^#!\/starred(?:\?|$)/.test(window.location.hash)) {
          const starred = await fetchStarred()
          if (gen === generation) actions.set({ starred, refreshError: null })
          return
        }
        const all = await fetchSummary()
        if (gen !== generation) return // superseded while this was in flight
        actions.set({ all, summaryLoaded: true, refreshError: null })
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
      const previousResult = articleResults.get(id)
      const readerReturn = state.readerReturn || (state.reader?.id === id ? state.reader.back : null)
      actions.set({ reader: { id, loading: true, back: readerReturn }, readerReturn: null })
      try {
        let { post, feedId } = await fetchArticle(id)
        let follow = state.all[feedId]
        if (!follow) {
          try { follow = await fetchFollow(feedId) } catch { /* Content remains readable without feed metadata. */ }
        }
        if (gen !== readerGeneration) return
        // A PATCH may finish while the article or feed metadata is loading.
        const latestResult = articleResults.get(id)
        if (latestResult && latestResult !== previousResult) {
          post = { ...post, isRead: latestResult.is_read, isStarred: latestResult.is_starred }
        }
        actions.set({ reader: { id, post, title: follow?.title || '', back: readerReturn || (follow ? tagPath(follow) : '/') } })
        if (!post.isRead) actions.saveArticleState({ id, flags: { is_read: true } })
      } catch (error) {
        if (gen !== readerGeneration) return
        actions.set({ reader: { id, back: readerReturn, error: error instanceof ApiError && error.status === 404
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
