import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase, photoUrl } from '../lib/supabase.js'

export default function GalleryPage() {
  const { slug } = useParams()
  const [event, setEvent] = useState(null)
  const [photos, setPhotos] = useState([])
  const newIds = useRef(new Set()) // photos that arrived live get the develop animation

  useEffect(() => {
    supabase
      .rpc('get_event', { p_slug: slug })
      .then(({ data }) => setEvent(data && data.length ? data[0] : null))

    supabase
      .from('photos')
      .select('id, guest_name, storage_path, created_at')
      .eq('event_slug', slug)
      .order('created_at', { ascending: false })
      .then(({ data }) => setPhotos(data || []))

    // Realtime: new photos pop in as guests upload
    const channel = supabase
      .channel(`photos-${slug}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'photos', filter: `event_slug=eq.${slug}` },
        (payload) => {
          newIds.current.add(payload.new.id)
          setPhotos((prev) => [payload.new, ...prev])
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'photos' },
        (payload) => {
          setPhotos((prev) => prev.filter((p) => p.id !== payload.old.id))
        }
      )
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [slug])

  return (
    <div className="page page-wide">
      <header className="event-header">
        <p className="eyebrow">Live gallery</p>
        <h1 className="display">{event ? event.couple_names : '…'}</h1>
        <div className="gold-rule" />
        <p className="muted">{photos.length} memories and counting</p>
      </header>

      {photos.length === 0 ? (
        <div className="card empty-card">
          <p>No photos yet. Be the first to take one!</p>
          <Link className="btn btn-primary" to={`/${slug}`}>Open the camera</Link>
        </div>
      ) : (
        <div className="polaroid-grid">
          {photos.map((p, i) => (
            <figure
              key={p.id}
              className={`polaroid tilt-${i % 4} ${newIds.current.has(p.id) ? 'develop' : ''}`}
            >
              <img src={photoUrl(p.storage_path)} alt={`Photo by ${p.guest_name}`} loading="lazy" />
              <figcaption>{p.guest_name}</figcaption>
            </figure>
          ))}
        </div>
      )}

      <Link className="btn btn-ghost" to={`/${slug}`}>← Back to camera</Link>
    </div>
  )
}
