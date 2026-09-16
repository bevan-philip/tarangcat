// Tarang API adapter. Summary refetches read the current SQLite state after writes.
// Authentication is supplied by the deployment boundary.

import type { Follow, Post, WireArticle, WireCategory, WireFeed, WireFeedDetail, WireSummary, WireStarredArticle } from './types'

/** Set at build time (build.mjs); '' means same-origin. */
declare const __TARANG_API_BASE__: string
const API_BASE = typeof __TARANG_API_BASE__ === 'undefined' ? '' : __TARANG_API_BASE__

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const response = await fetch(`${API_BASE}${path}`, init)
  if (!response.ok) {
    let message = `${init.method ?? 'GET'} ${path} failed with ${response.status}`
    try {
      const body = (await response.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      // Non-JSON error body; the status line is all we have.
    }
    throw new ApiError(response.status, message)
  }
  return response
}

async function apiJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await apiFetch(path, init)
  if (response.status === 204 || response.headers.get('content-length') === '0') {
    return undefined as T
  }
  return (await response.json()) as T
}

function jsonBody(method: string, body: unknown): RequestInit {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

//
// Importance <-> refresh_interval. Fraidycat's five tiers map onto Tarang's per-feed
// refresh_interval (seconds); there is no schema change on the backend for this, it is
// purely an adapter-side convention.
//
const IMPORTANCE_TO_INTERVAL: Record<number, number> = {
  0: 300,
  1: 3600,
  7: 21600,
  30: 43200,
  365: 86400
}
const INTERVAL_TIERS = Object.entries(IMPORTANCE_TO_INTERVAL).map(
  ([importance, interval]) => [Number(importance), interval] as const
)

function importanceForInterval(intervalSeconds: number): number {
  let best = INTERVAL_TIERS[0]!
  let bestDiff = Math.abs(intervalSeconds - best[1])
  for (const tier of INTERVAL_TIERS.slice(1)) {
    const diff = Math.abs(intervalSeconds - tier[1])
    if (diff < bestDiff) {
      best = tier
      bestDiff = diff
    }
  }
  return best[0]
}

function intervalForImportance(importance: number): number {
  return IMPORTANCE_TO_INTERVAL[importance] ?? IMPORTANCE_TO_INTERVAL[0]!
}

function toPost(article: WireFeed['articles'][number]): Post {
  const publishedAtSeconds = article.published_at ?? article.retrieved_at
  const publishedAt = new Date(publishedAtSeconds * 1000)
  return {
    id: String(article.pk),
    isRead: article.is_read === true,
    isStarred: article.is_starred === true,
    title: article.title?.trim() || '',
    url: article.url,
    content: '',
    summary: article.summary ?? null,
    publishedAt,
    // Tarang does not track a separate "updated" time; the view reads this field by
    // name when settings['mode-updates'] is set, so it has to exist.
    updatedAt: publishedAt
  }
}

function toFollow(feed: WireFeed): Follow {
  const follow: Follow = {
    id: String(feed.pk),
    url: feed.display_url || feed.url,
    feed: feed.url,
    title: feed.name,
    importance: importanceForInterval(feed.refresh_interval),
    fetchesContent: true,
    posts: feed.articles.map(toPost),
    // Deferred: sparkpoints() treats a missing/empty array as
    // "nothing to draw" and renders no sparkline.
    activity: []
  }
  // Absent when there is no category: the view treats this as the home category.
  if (feed.category) follow.category = feed.category.name
  return follow
}

export async function fetchSummary(): Promise<Record<string, Follow>> {
  const wire = await apiJson<WireSummary>('/tarang/v1/summary')
  const follows: Record<string, Follow> = {}
  for (const feed of wire.feeds) follows[String(feed.pk)] = toFollow(feed)
  // Only fetch missing fallback text for articles the feed list can display.
  await Promise.all(Object.values(follows).flatMap(follow => follow.posts.slice(0, 10)
    .filter(post => !post.title && !post.summary?.trim())
    .map(async post => {
      try {
        const { post: full } = await fetchArticle(post.id)
        post.content = full.content
        post.summary = full.summary
      } catch {
        // An unavailable article must not hide the rest of the feed.
      }
    })))
  return follows
}

export async function fetchArticle(id: string): Promise<{ post: Post, feedId: string }> {
  const article = await apiJson<WireArticle>(`/tarang/v1/article/${encodeURIComponent(id)}`)
  return { post: { ...toPost(article), content: article.content ?? '' }, feedId: String(article.feed) }
}

export async function updateArticleState(id: string, flags: { is_read?: boolean, is_starred?: boolean }): Promise<{ is_read: boolean, is_starred: boolean }> {
  return apiJson(`/tarang/v1/article/${encodeURIComponent(id)}`, jsonBody('PATCH', flags))
}

export async function fetchStarred(): Promise<Array<Post & { feedTitle: string }>> {
  const articles = await apiJson<WireStarredArticle[]>('/tarang/v1/starred')
  return articles.map(article => ({ ...toPost({ ...article, pk: article.article_id, feed: article.feed_id }), feedTitle: article.feed_name }))
}

export async function fetchFollow(id: string): Promise<Follow> {
  const { feed } = await apiJson<WireFeedDetail>(`/tarang/v1/feed/${encodeURIComponent(id)}`)
  const category = feed.category_id == null ? null
    : (await listCategories()).find(category => category.pk === feed.category_id) ?? null
  return toFollow({ ...feed, category, articles: [] })
}

export async function listCategories(): Promise<WireCategory[]> {
  return apiJson<WireCategory[]>('/tarang/v1/category')
}

/**
 * Creates a category if it doesn't already exist, and returns its id either way.
 * `POST /tarang/v1/category/{name}` isn't idempotent at the HTTP level (a duplicate name
 * is a 409), so idempotency is implemented here: a 409 means someone already made it,
 * so look it up instead of failing.
 */
async function ensureCategory(name: string): Promise<number> {
  try {
    const created = await apiJson<{ id: number }>(
      `/tarang/v1/category/${encodeURIComponent(name)}`,
      { method: 'POST' }
    )
    return created.id
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 409) throw error
    const categories = await listCategories()
    const existing = categories.find((c) => c.name === name)
    if (!existing) throw error
    return existing.pk
  }
}

async function categoryIdForName(name: string | undefined): Promise<number | null> {
  const trimmed = (name ?? '').trim()
  return trimmed ? ensureCategory(trimmed) : null
}

export interface FollowDraft {
  /** Website URL when editing; subscription/input URL when adding. */
  url?: string
  title?: string
  category?: string
  importance?: number
}

/** New follow: resolve the optional category, then include it in the feed POST. */
export async function addFollow(draft: FollowDraft): Promise<string> {
  const url = (draft.url ?? '').trim()
  const title = (draft.title ?? '').trim()
  const categoryId = await categoryIdForName(draft.category)
  const created = await apiJson<{ id: number }>(
    '/tarang/v1/feed',
    jsonBody('POST', {
      ...(title ? { name: title } : {}),
      url,
      discovery: true,
      refresh_interval: intervalForImportance(draft.importance ?? 0),
      category_id: categoryId
    })
  )
  return String(created.id)
}

/**
 * Existing follow: PATCH the changed fields, including the optional category. An empty
 * title is treated as "leave the name alone" — Tarang has
 * no separate "feed's own title" to fall back to the way Miniflux does.
 */
export async function editFollow(
  id: string,
  draft: FollowDraft
): Promise<void> {
  const feedId = Number(id)
  const trimmedTitle = (draft.title || '').trim()
  const categoryId = await categoryIdForName(draft.category)
  await apiFetch(
    `/tarang/v1/feed/${feedId}`,
    jsonBody('PATCH', {
      ...(trimmedTitle ? { name: trimmedTitle } : {}),
      ...(draft.url === undefined ? {} : { display_url: draft.url.trim() }),
      refresh_interval: intervalForImportance(draft.importance ?? 0),
      category_id: categoryId
    })
  )
}

export async function removeFollow(id: string): Promise<void> {
  await apiFetch(`/tarang/v1/feed/${id}`, { method: 'DELETE' })
}

/** Resolve a bulk edit once, then PATCH only the requested field on each feed. */
export async function prepareFollowUpdate(change: { category?: string, importance?: number }): Promise<(id: string) => Promise<void>> {
  const body = change.category !== undefined
    ? { category_id: await categoryIdForName(change.category) }
    : { refresh_interval: intervalForImportance(change.importance ?? 0) }
  return async id => {
    await apiFetch(`/tarang/v1/feed/${encodeURIComponent(id)}`, jsonBody('PATCH', body))
  }
}
