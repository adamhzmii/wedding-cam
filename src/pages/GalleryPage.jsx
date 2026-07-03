import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { supabase, photoUrl, savePhoto } from '../lib/supabase.js'

export default function GalleryPage() {
  const { slug } = useParams()
  const [event, setEvent] = useState(null)
  const [photos, setPhotos] = useState([])
  const [viewing, setViewing] = useState(null) // index of photo open in fullscreen
  const newIds = useRef(new Set()) // photos that arrived live get the develop animation
  const touchX = useRef(null)

  useEffect(() => {
    if (viewing === null) return
    const onKey = (e) => {
      if (e.key === 'Escape') setViewing(null)
      if (e.key === 'ArrowLeft') setViewing((v) => Math.max(0, v - 1))
      if (e.key === 'ArrowRight') setViewing((v) => Math.min(photos.length - 1, v + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewing, photos.length])

  function onSwipe(endX) {
    const dx = endX - touchX.current
    if (Math.abs(dx) < 50) return
    if (dx < 0) setViewing((v) => Math.min(photos.length - 1, v + 1))
    else setViewing((v) => Math.max(0, v - 1))
  }

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
      <Link className="back-fab" to={`/${slug}`} aria-label="Back to camera">
        ←
      </Link>
      <header className="event-header">
        <p className="eyebrow">Live gallery</p>
        <h1 className="display">{event ? event.couple_names : '…'}</h1>
        {event?.event_date && (
          <p className="event-date">
            {new Date(event.event_date).toLocaleDateString('en-GB', {
              day: 'numeric', month: 'long', year: 'numeric',
            })}
          </p>
        )}
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
              onClick={() => setViewing(i)}
            >
              <img src={photoUrl(p.storage_path)} alt={`Photo by ${p.guest_name}`} loading="lazy" />
              <figcaption>{p.guest_name}</figcaption>
            </figure>
          ))}
        </div>
      )}

      <Link className="btn btn-ghost" to={`/${slug}`}>← Back to camera</Link>

      <p className="credit">Made with love by Adam and (some others)</p>

      {viewing !== null && photos[viewing] && (
        <div
          className="lightbox"
          onClick={() => setViewing(null)}
          onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
          onTouchEnd={(e) => onSwipe(e.changedTouches[0].clientX)}
        >
          {viewing > 0 && (
            <button
              className="lightbox-nav lightbox-prev"
              aria-label="Previous photo"
              onClick={(e) => { e.stopPropagation(); setViewing(viewing - 1) }}
            >
              ‹
            </button>
          )}
          <img
            src={photoUrl(photos[viewing].storage_path)}
            alt={`Photo by ${photos[viewing].guest_name}`}
            onClick={(e) => e.stopPropagation()}
          />
          {viewing < photos.length - 1 && (
            <button
              className="lightbox-nav lightbox-next"
              aria-label="Next photo"
              onClick={(e) => { e.stopPropagation(); setViewing(viewing + 1) }}
            >
              ›
            </button>
          )}
          <p className="lightbox-caption">{photos[viewing].guest_name}</p>
          <div className="lightbox-actions" onClick={(e) => e.stopPropagation()}>
            <button
              className="btn btn-ghost btn-ghost-light"
              onClick={() => savePhoto(photos[viewing].storage_path)}
            >
              ↓ Save
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
