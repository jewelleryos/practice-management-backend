// Letter-head FOOTER images — the developer-curated catalog of footer images a
// firm can choose from. Footer = a single image (no text). The image FILES live in
// the frontend `public/` folder; here we only keep each image's stable `key`
// (stored in the DB), a display `label` (shown in the picker), and its public
// `path` (the same-origin URL the browser — and later the server-side PDF renderer
// — loads). Add a new footer by dropping the PNG into final-frontend/public/ and
// adding an entry below.

export interface LetterheadFooterImage {
  key: string // stable id stored in firm_letterheads.content.footer.image_key
  label: string // shown in the picker
  path: string // public URL of the image (served by the frontend)
}

export const LETTERHEAD_FOOTER_IMAGES: LetterheadFooterImage[] = [
  { key: 'cpa_v1', label: 'CPA Australia', path: '/cpa_v1.png' },
  { key: 'ipa_v1', label: 'Institute of Public Accountants', path: '/ipa_v1.png' },
]

export const LETTERHEAD_FOOTER_IMAGE_KEYS = LETTERHEAD_FOOTER_IMAGES.map((i) => i.key)

export function isFooterImageKey(key: string): boolean {
  return LETTERHEAD_FOOTER_IMAGE_KEYS.includes(key)
}

// Resolve an image key to its public path, or null if the key is unknown (e.g. an
// image that was later removed from the catalog).
export function footerImagePath(key: string | null | undefined): string | null {
  if (!key) return null
  return LETTERHEAD_FOOTER_IMAGES.find((i) => i.key === key)?.path ?? null
}
