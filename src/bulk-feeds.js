import { h } from 'hyperapp'
import { Importances } from '../vendor/fraidycat/js/util.js'

export const BulkFeeds = ({ category, frequency, feeds }) => ({ follows }, actions) => {
  const bulk = follows.bulk?.category === category && follows.bulk.frequency === frequency ? follows.bulk : null
  const selected = feeds.filter(feed => bulk?.selected[feed.id]).length
  const change = actions.follows.changeBulk
  return <section class="bulk-feeds" key={`bulk-${category}-${frequency}`} ondestroy={() => actions.follows.closeBulk()}>
    <button type="button" aria-expanded={bulk ? 'true' : 'false'} aria-controls="bulk-panel"
      disabled={!bulk && (follows.bulkBusy || !feeds.length)}
      onclick={() => bulk ? actions.follows.closeBulk() : actions.follows.openBulk({ category, frequency })}>Manage feeds</button>
    {bulk && <div id="bulk-panel">
      <fieldset disabled={bulk.pending}>
        <legend>{selected} of {feeds.length} selected</legend>
        <div class="bulk-selection">
          <button type="button" onclick={() => change({ selected: Object.fromEntries(feeds.map(feed => [feed.id, true])) })}>Select all</button>
          <button type="button" onclick={() => change({ selected: {} })}>Clear selection</button>
        </div>
        <div class="bulk-fields">
          <div><label for="bulk-action">Action</label><select id="bulk-action" value={bulk.operation} onchange={e => change({ operation: e.target.value, message: '' })}>
            <option value="importance">Change importance</option>
            <option value="category">Move to category</option>
            <option value="delete">Delete feeds</option>
          </select></div>
          {bulk.operation === 'importance' && <div><label for="bulk-importance">Importance</label><select id="bulk-importance" value={bulk.importance}
            onchange={e => change({ importance: Number(e.target.value) })}>
            {Importances.map(imp => <option value={imp[0]}>{imp[2]} {imp[1]}</option>)}
          </select></div>}
          {bulk.operation === 'category' && <div><label for="bulk-destination">Destination category</label><input id="bulk-destination" type="text" list="bulk-categories" aria-describedby="bulk-category-help" value={bulk.destination}
            oninput={e => change({ destination: e.target.value })} />
            <datalist id="bulk-categories">{(follows.categories || []).map(item => <option value={item.name} />)}</datalist>
          </div>}
        </div>
        {bulk.operation === 'category' && follows.categoryError && <p role="status">{follows.categoryError}{' '}
          <button type="button" onclick={() => actions.follows.loadCategories()}>Retry categories</button></p>}
        <button type="button" disabled={!selected} onclick={() => actions.follows.applyBulk()}>
          {bulk.operation === 'delete' ? 'Delete selected feeds' : 'Apply to selected feeds'}
        </button>
      </fieldset>
      {bulk.operation === 'category' && <p id="bulk-category-help"><small>Choose or type a category. Leave blank to move to Home.</small></p>}
      <p role="status" aria-live="polite">{bulk.pending ? `Updating ${selected} feeds…` : bulk.message}</p>
    </div>}
  </section>
}
