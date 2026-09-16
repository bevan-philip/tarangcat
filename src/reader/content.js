import DOMPurify from 'dompurify'

export function safeUrl(value, base, allowMail = false) {
  try {
    const url = new URL(value, base)
    return ['http:', 'https:', ...(allowMail ? ['mailto:'] : [])].includes(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

// Article HTML is untrusted. Keep document formatting without executable content,
// publisher CSS, forms, embeds, or attributes that can affect the surrounding app.
export function articleFragment(html, base) {
  const fragment = DOMPurify.sanitize(html, {
    RETURN_DOM_FRAGMENT: true,
    ALLOWED_TAGS: ['p', 'br', 'hr', 'div', 'span', 'section', 'article', 'header',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'img', 'figure', 'figcaption',
      'strong', 'b', 'em', 'i', 's', 'del', 'ins', 'u', 'small', 'sub', 'sup',
      'blockquote', 'pre', 'code', 'kbd', 'samp', 'ul', 'ol', 'li', 'dl', 'dt', 'dd',
      'table', 'caption', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'abbr', 'time'],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'id', 'colspan', 'rowspan', 'scope',
      'start', 'reversed', 'value', 'datetime', 'lang', 'dir'],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
    // IDs are rewritten below before this detached fragment enters the document.
    // Preserve originals here so even anchors named after app elements still work.
    SANITIZE_DOM: false,
  })
  const ids = new Map()
  const anchors = [...fragment.querySelectorAll('[id]')].map(element => [element, element.id])
  for (const [element] of anchors) element.removeAttribute('id')
  for (const [element, original] of anchors) {
    if (ids.has(original)) continue
    const id = `reader-content-${ids.size}`
    ids.set(original, id)
    element.id = id
  }
  for (const link of fragment.querySelectorAll('a')) {
    const href = link.getAttribute('href')
    link.removeAttribute('href')
    if (!href) continue
    let anchor
    try { anchor = href.startsWith('#') && ids.get(decodeURIComponent(href.slice(1))) } catch {}
    if (anchor) {
      link.href = `#${anchor}`
      link.addEventListener('click', event => {
        event.preventDefault()
        const target = document.getElementById(anchor)
        target?.scrollIntoView({ block: 'start' })
        target?.setAttribute('tabindex', '-1')
        target?.focus({ preventScroll: true })
      })
    } else {
      const url = safeUrl(href, base, true)
      if (url) {
        link.href = url
        link.target = '_blank'
        link.rel = 'noopener noreferrer'
      }
    }
  }
  for (const img of fragment.querySelectorAll('img')) {
    const url = safeUrl(img.getAttribute('src') || '', base)
    if (!img.getAttribute('src') || !url) {
      img.replaceWith(document.createTextNode(img.alt || ''))
      continue
    }
    img.src = url
    img.loading = 'lazy'
    img.decoding = 'async'
    img.referrerPolicy = 'no-referrer'
  }
  return fragment
}

export function articleLabel(post) {
  return post.title || articleExcerpt(post) || '(untitled)'
}

export function articleExcerpt(post) {
  for (const html of [post.summary, post.content]) {
    const fragment = DOMPurify.sanitize(html || '', { RETURN_DOM_FRAGMENT: true, FORBID_TAGS: ['style'] })
    for (const element of fragment.querySelectorAll('p, div, br, li, h1, h2, h3, h4, h5, h6, blockquote, pre, td, th')) {
      element.append(document.createTextNode(' '))
    }
    const text = fragment.textContent.replace(/\s+/g, ' ').trim()
    if (text) return text.length > 160 ? `${text.slice(0, 159).trimEnd()}…` : text
  }
  return ''
}

const rendered = new WeakMap()
export function renderArticle(element, post) {
  const signature = JSON.stringify([post.content, post.summary, post.url])
  if (rendered.get(element) === signature) return
  let fragment = articleFragment(post.content || '', post.url)
  let summaryOnly = false
  const hasContent = node => Boolean(node.textContent.trim() || node.querySelector('img, hr'))
  if (!hasContent(fragment)) {
    fragment = articleFragment(post.summary || '', post.url)
    summaryOnly = hasContent(fragment)
  }
  element.replaceChildren()
  if (summaryOnly || !hasContent(fragment)) {
    const notice = document.createElement('p')
    notice.className = 'reader-notice'
    notice.textContent = summaryOnly
      ? 'Only a summary is available in the cache.'
      : 'No cached content is available for this article. Use Open original to read it on the source site.'
    element.append(notice)
  }
  element.append(fragment)
  rendered.set(element, signature)
}
