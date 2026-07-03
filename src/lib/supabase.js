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

// Download a photo to the user's device. Fetch as blob first because a
// plain <a download> is ignored for cross-origin URLs.
export async function savePhoto(storagePath) {
  const res = await fetch(photoUrl(storagePath))
  const blob = await res.blob()
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = storagePath.split('/').pop()
  a.click()
  URL.revokeObjectURL(a.href)
}
