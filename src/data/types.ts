//
// The client's view of Tarang's wire format, and of the shape the vendored view expects.
//
// Tarang's timestamps are Unix seconds
// (SQLite's unixepoch()); the vendored view compares Date objects with `>` and divides by
// 1000, so every timestamp is converted to a Date before the view sees it.
//

export interface WireCategory {
  pk: number
  name: string
}

export interface WireArticle {
  pk: number
  feed: number
  url: string
  guid: string
  title: string | null
  content: string
  summary: string | null
  published_at: number | null
  retrieved_at: number
}

export interface WireFeed {
  pk: number
  name: string
  url: string
  metadata: string
  refresh_interval: number
  last_refresh: number | null
  next_poll_at: number | null
  category_id: number | null
  /** A feed has at most one category; unassigned feeds carry null. */
  category: WireCategory | null
  articles: WireArticle[]
}

export interface WireSummary {
  categories: WireCategory[]
  feeds: WireFeed[]
}

/** Post fields consumed by the vendored view. */
export interface Post {
  id: string
  title: string
  url: string
  publishedAt: Date
  updatedAt: Date
}

export interface Follow {
  id: string
  url: string
  feed: string
  title: string
  /** Absent means the follow appears under Fraidycat's home category. */
  category?: string
  importance: number
  fetchesContent: false
  posts: Post[]
  activity: number[]
}
