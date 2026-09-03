//
// App entry point.
//
// Boots the vendored Fraidycat view against the Tarang adapter: no browser storage beyond
// device-local display settings, no background page, no messaging, no auth gate — Tarang
// has none and is trusted-network by design. Just `GET /tarang/v1/summary` in memory.
//

import { app } from 'hyperapp'

import view from '../vendor/fraidycat/js/view.js'
import follows from './store/follows.js'
import { hyperload } from './store/hyperload.js'
import './styles/app.scss'

const { state, actions, view: rootView } = hyperload({ modules: { follows }, view })
const { initialize } = app(state, actions, rootView, document.getElementById('fraidy'))
initialize()
