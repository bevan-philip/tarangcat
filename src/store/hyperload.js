//
// Module wiring for hyperapp v1, equivalent to upstream's src/js/hyperload.js.
//
// Written fresh rather than vendored: upstream's version carried Beaker/WebExtension
// branches we do not have. It does three things — nest module state and actions under a
// name, add the identity `set` action every module relies on, and wire the router's
// location module in.
//

import { location } from '@kickscondor/router'

export function hyperload(tree, options = {}) {
  const modules = {}
  for (const name in tree.modules ?? {}) {
    modules[name] = hyperload(tree.modules[name], options)
  }

  const state = tree.state ?? {}
  const actions = tree.actions ?? {}

  // Hash routing keeps the app a single static file and preserves upstream's
  // "#!/add?url=…" bookmarklet route.
  modules.location = location({ hashRouting: true, ...options.location })

  for (const name in modules) {
    state[name] = modules[name].state ?? {}
    actions[name] = Object.assign({ set: (partial) => partial }, modules[name].actions)
  }

  actions.initialize = () => (_, allActions) => {
    modules.location.subscribe(allActions.location)
    for (const name in modules) {
      const init = allActions[name].init
      if (init) init()
    }
  }

  return { state, actions, view: tree.view }
}
