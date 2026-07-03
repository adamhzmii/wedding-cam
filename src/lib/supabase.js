import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!url || !anonKey) {
  console.error(
    '[supabase] Missing env vars. Check .env has VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then restart the dev server.'
  )
}

export const supabase = createClient(url, anonKey)

export const BUCKET = 'wedding-photos'

// Build the public URL for a stored photo
export function photoUrl(storagePath) {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath)
  return data.publicUrl
}

// Save a photo to the user's device. Browsers cannot write into the photo
// gallery directly, so on phones we open the native share sheet (its
// "Save Image" option stores to the gallery). Desktop falls back to a
// normal download; the blob fetch is needed because a plain <a download>
// is ignored for cross-origin URLs.
export async function savePhoto(storagePath) {
  const res = await fetch(photoUrl(storagePath))
  const blob = await res.blob()
  const file = new File([blob], storagePath.split('/').pop(), { type: 'image/jpeg' })

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return
    } catch (err) {
      if (err.name === 'AbortError') return // user closed the share sheet
      // any other failure: fall through to download
    }
  }

  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = file.name
  a.click()
  URL.revokeObjectURL(a.href)
}
