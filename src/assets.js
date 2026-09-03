//
// Asset name → URL maps for the vendored view.
//
// Upstream used Parcel's glob imports (`import svg from '../images/*.svg'`). The build
// (build.mjs) copies the vendored images into the output and injects the resulting
// manifest here as __TARANGCAT_ASSETS__.
//

/* global __TARANGCAT_ASSETS__ */
const manifest =
  typeof __TARANGCAT_ASSETS__ === 'undefined' ? { png: {}, svg: {}, webp: {} } : __TARANGCAT_ASSETS__

export const images = manifest.png
export const svg = manifest.svg
export const webp = manifest.webp
