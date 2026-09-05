import { h } from 'hyperapp'
import { Link } from '@kickscondor/router'
import { renderArticle, safeUrl } from './content.js'

export const fonts = [
  ['serif', 'IBM Plex Serif'],
  ['sans', 'Inter'],
  ['mono', 'iA Writer Duospace'],
]

function selectSetting(actions, name) {
  return event => actions.follows.setReaderSetting({ name, value: event.target.value })
}

export function ReaderControls({ settings, actions }) {
  const font = fonts.some(([key]) => key === settings['reader-font']) ? settings['reader-font'] : 'serif'
  const size = ['small', 'medium', 'large'].includes(settings['reader-size']) ? settings['reader-size'] : 'medium'
  return <div class="reader-controls" aria-label="Reading preferences">
    <label>Font<select aria-label="Reader font" value={font} onchange={selectSetting(actions, 'reader-font')}>
      {fonts.map(([key, label]) => <option value={key} selected={font === key}>{label}</option>)}
    </select></label>
    <label>Size<select aria-label="Reader text size" onchange={selectSetting(actions, 'reader-size')}>
      {[['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']].map(([key, label]) =>
        <option value={key} selected={size === key}>{label}</option>)}
    </select></label>
    <label>Appearance<select aria-label="Reader appearance" onchange={selectSetting(actions, 'mode-theme')}>
      {[['auto', 'System'], ['light', 'Light'], ['dark', 'Dark']].map(([key, label]) =>
        <option value={key} selected={(settings['mode-theme'] || 'auto') === key}>{label}</option>)}
    </select></label>
  </div>
}

export const ReaderPane = ({ match }) => ({ follows }, actions) => {
  const id = match.params.id
  let selected = follows.reader?.post.id === id ? follows.reader : null
  if (!selected) {
    for (const follow of Object.values(follows.all)) {
      const post = follow.posts.find(post => post.id === id)
      if (post) {
        selected = { post: { ...post }, title: follow.title,
          back: `/tag/${encodeURIComponent(follow.category || '\u{1f3e0}')}?importance=${follow.importance}` }
        break
      }
    }
  }
  const font = fonts.some(([key]) => key === follows.settings['reader-font']) ? follows.settings['reader-font'] : 'serif'
  const size = ['small', 'medium', 'large'].includes(follows.settings['reader-size']) ? follows.settings['reader-size'] : 'medium'
  const back = selected?.back || '/'
  const focusTitle = element => {
    if (selected) actions.follows.set({ reader: selected })
    window.scrollTo(0, 0)
    element.querySelector('h1')?.focus({ preventScroll: true })
  }
  return <main class={`reader-shell reader-font-${font} reader-size-${size}`} key={`reader-${id}`}
    oncreate={focusTitle}
    onupdate={element => {
      if (selected && follows.reader !== selected) focusTitle(element)
    }}
    ondestroy={() => actions.follows.closeReader(id)}
    onkeydown={event => {
      if (event.key === 'Escape' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) actions.location.go(back)
    }}>
    <nav class="reader-toolbar" aria-label="Reader navigation">
      <Link to={back}>← Back to feeds</Link>
      <ReaderControls settings={follows.settings} actions={actions} />
    </nav>
    {selected ? <div class="reader-page">
      <header class="reader-heading">
        <p class="reader-source">{selected.title}</p>
        <h1 tabindex="-1">{selected.post.title}</h1>
        <div class="reader-meta">
          {Number.isFinite(Number(selected.post.publishedAt)) && <time datetime={selected.post.publishedAt.toISOString()}>
            {selected.post.publishedAt.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
          </time>}
          {safeUrl(selected.post.url) && <a href={safeUrl(selected.post.url)} target="_blank" rel="noopener noreferrer">Open original ↗</a>}
        </div>
      </header>
      <div class="reader-content" oncreate={el => renderArticle(el, selected.post)} onupdate={el => renderArticle(el, selected.post)} />
    </div> : <div class="reader-page">
      <h1 tabindex="-1">Article unavailable</h1>
      <p>{follows.refreshError || 'This article is not in the current cache. It may have aged out of the latest ten articles or its feed may have been removed.'}</p>
      <button type="button" onclick={() => actions.follows.refresh()}>Try again</button>
    </div>}
  </main>
}
