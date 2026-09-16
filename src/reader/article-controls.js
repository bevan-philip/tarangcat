import { h } from 'hyperapp'
import { articleLabel, safeUrl } from './content.js'

export const StarButton = ({ post }) => ({ follows }, actions) => <button type="button"
  class="article-star" aria-label={`${post.isStarred ? 'Unstar' : 'Star'} ${articleLabel(post)}`}
  title={post.isStarred ? 'Unstar article' : 'Star article'}
  aria-pressed={post.isStarred ? 'true' : 'false'} disabled={!!follows.articlePending[post.id]}
  onclick={() => actions.follows.saveArticleState({ id: post.id, flags: { is_starred: !post.isStarred } })}>
  {post.isStarred ? '★' : '☆'}
</button>

export const ArticleError = ({ id }) => ({ follows }, actions) => {
  const error = follows.articleErrors[id]
  return error && <span class="article-error" role="alert">{error.message}{' '}
    <button type="button" disabled={!!follows.articlePending[id]}
      onclick={() => actions.follows.saveArticleState({ id, flags: error.flags })}>Try again</button>
  </span>
}

export const ArticleLink = ({ post, back }, children) => (_state, actions) => {
  const markRead = () => {
    if (!post.isRead) actions.follows.saveArticleState({ id: post.id, flags: { is_read: true } })
  }
  return <a class={`article-link${post.isRead ? ' is-read' : ''}`}
    href={safeUrl(post.url) || `#!/view/${post.id}`} rel="noopener noreferrer"
    onauxclick={event => { if (event.button === 1) markRead() }}
    onclick={event => {
      if (event.defaultPrevented || event.button !== 0) return
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) { markRead(); return }
      event.preventDefault()
      actions.follows.set({ readerReturn: back || null })
      actions.location.go(`/view/${post.id}`)
    }}>{children.length ? children : articleLabel(post)}</a>
}

export const StarredArticles = () => ({ follows }, actions) => <div id="starred" key="starred">
  <h2>Starred articles</h2>
  {follows.refreshError && <p role="alert">{follows.refreshError}{' '}
    <button type="button" onclick={() => actions.follows.refresh()}>Try again</button></p>}
  {follows.starred === null ? !follows.refreshError && <p role="status">Loading starred articles…</p>
    : follows.starred.length === 0 ? <p>Star an article to keep it here.</p>
      : <ol class="starred-list">{follows.starred.map(post => <li key={post.id}>
        <StarButton post={post} />
        <div><ArticleLink post={post} back="/starred" />
          <p class="starred-source">{post.feedTitle}{' · '}{post.publishedAt.toLocaleDateString()}</p>
          <ArticleError id={post.id} />
        </div>
      </li>)}</ol>}
</div>
