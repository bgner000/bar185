// Client-side only, for enabling/disabling buttons -- mirrors (but doesn't
// replace) the backend's own normalizeEmail/normalizeAuMobile, which is the
// actual authority on whether a request is accepted.
export function isLikelyEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export function isLikelyAuMobile(value) {
  const cleaned = value.trim().replace(/[\s-]/g, '')
  return /^(\+?61|0)4\d{8}$/.test(cleaned)
}
