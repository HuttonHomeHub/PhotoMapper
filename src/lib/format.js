// Shared date formatting (CQ-01). Returns null for empty input; falls back to
// the raw string on an invalid date. Previously duplicated in PhotoLightbox,
// PhotoComparison and PhotoMap.
export function formatDate(iso) {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}
