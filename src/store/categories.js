const HOME = '\u{1f3e0}'

export function visibleCategories(follows) {
  return [...new Set([HOME, ...Object.values(follows).map(follow => follow.category || HOME)])]
    .sort((a, b) => a === b ? 0 : a === HOME ? -1 : b === HOME ? 1 : a < b ? -1 : 1)
}
