import { h } from 'hyperapp'
import { Link } from '@kickscondor/router'
import { renderArticle, safeUrl } from './content.js'
import { StarButton, ArticleError } from './article-controls.js'

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
  const reader = follows.reader?.id === id ? follows.reader : null
  const selected = reader?.post ? reader : null
  const font = fonts.some(([key]) => key === follows.settings['reader-font']) ? follows.settings['reader-font'] : 'serif'
  const size = ['small', 'medium', 'large'].includes(follows.settings['reader-size']) ? follows.settings['reader-size'] : 'medium'
  const back = reader?.back || '/'
  const focusTitle = element => {
    window.scrollTo(0, 0)
    element.querySelector('h1')?.focus({ preventScroll: true })
  }
  return <main class={`reader-shell reader-font-${font} reader-size-${size}`} key={`reader-${id}`}
    oncreate={element => { focusTitle(element); actions.follows.openReader(id) }}
    onupdate={(element, old) => {
      if (selected && old['data-loaded'] !== id) focusTitle(element)
    }}
    data-loaded={selected ? id : ''}
    ondestroy={() => actions.follows.closeReader(id)}
    onkeydown={event => {
      if (event.key === 'Escape' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) actions.location.go(back)
    }}>
    <nav class="reader-toolbar" aria-label="Reader navigation">
      <Link to={back}>{back === '/starred' ? '← Back to starred articles' : '← Back to feeds'}</Link>
      <ReaderControls settings={follows.settings} actions={actions} />
    </nav>
    {selected ? <div class="reader-page">
      <header class="reader-heading">
        <p class="reader-source">{selected.title}</p>
        <h1 tabindex="-1">{selected.post.title}</h1>
        <div class="reader-meta">
          <StarButton post={selected.post} />
          {Number.isFinite(Number(selected.post.publishedAt)) && <time datetime={selected.post.publishedAt.toISOString()}>
            {selected.post.publishedAt.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
          </time>}
          {safeUrl(selected.post.url) && <a href={safeUrl(selected.post.url)} target="_blank" rel="noopener noreferrer"
            onclick={() => { if (!selected.post.isRead) actions.follows.saveArticleState({ id, flags: { is_read: true } }) }}
            onauxclick={event => { if (event.button === 1 && !selected.post.isRead) actions.follows.saveArticleState({ id, flags: { is_read: true } }) }}>Open original ↗</a>}
        </div>
        <ArticleError id={id} />
      </header>
      <div class="reader-content" oncreate={el => renderArticle(el, selected.post)} onupdate={el => renderArticle(el, selected.post)} />
    </div> : <div class="reader-page">
      <h1 tabindex="-1">{reader?.error ? 'Article unavailable' : 'Loading article…'}</h1>
      <p role="status">{reader?.error || 'Fetching cached content from Tarang.'}</p>
      {reader?.error && <button type="button" onclick={() => actions.follows.openReader(id)}>Try again</button>}
    </div>}
  </main>
}
