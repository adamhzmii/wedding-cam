import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import imageCompression from 'browser-image-compression'
import { supabase, BUCKET, photoUrl, savePhoto } from '../lib/supabase.js'

const SHOT_LIMIT = 30

function loadShots(slug) {
  const raw = JSON.parse(localStorage.getItem(`shots:${slug}`) || '[]')
  // Old format was plain strings; migrate to {id, path} objects.
  // id will be null for old entries so delete button won't appear on them.
  return raw.map((item) => (typeof item === 'string' ? { id: null, path: item } : item))
}

export default function EventPage() {
  const { slug } = useParams()
  const [event, setEvent] = useState(undefined) // undefined = loading, null = not found
  const [name, setName] = useState(localStorage.getItem(`name:${slug}`) || '')
  const [joined, setJoined] = useState(!!localStorage.getItem(`name:${slug}`))
  const [myShots, setMyShots] = useState(() => loadShots(slug))
  const [queue, setQueue] = useState([]) // uploads in flight
  const [viewing, setViewing] = useState(null) // index of shot open in fullscreen
  const [deleteError, setDeleteError] = useState('')
  const fileRef = useRef(null)
  const touchX = useRef(null)

  useEffect(() => {
    if (viewing === null) return
    const onKey = (e) => {
      if (e.key === 'Escape') setViewing(null)
      if (e.key === 'ArrowLeft') setViewing((v) => Math.max(0, v - 1))
      if (e.key === 'ArrowRight') setViewing((v) => Math.min(myShots.length - 1, v + 1))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewing, myShots.length])

  function onSwipe(endX) {
    const dx = endX - touchX.current
    if (Math.abs(dx) < 50) return
    // swipe left = next photo, swipe right = previous
    if (dx < 0) setViewing((v) => Math.min(myShots.length - 1, v + 1))
    else setViewing((v) => Math.max(0, v - 1))
  }

  useEffect(() => {
    supabase
      .rpc('get_event', { p_slug: slug })
      .then(({ data }) => setEvent(data && data.length ? data[0] : null))
  }, [slug])

  // Reconcile remembered shots with the database: drop entries whose photo
  // was deleted elsewhere (refunds the slot) and backfill missing ids from
  // before the delete feature existed.
  useEffect(() => {
    const stored = loadShots(slug)
    if (!stored.length) return
    supabase
      .from('photos')
      .select('id, storage_path')
      .in('storage_path', stored.map((s) => s.path))
      .then(({ data }) => {
        if (!data) return
        const alive = new Map(data.map((r) => [r.storage_path, r.id]))
        setMyShots((prev) => {
          const next = prev
            .filter((s) => alive.has(s.path))
            .map((s) => ({ id: s.id || alive.get(s.path), path: s.path }))
          localStorage.setItem(`shots:${slug}`, JSON.stringify(next))
          return next
        })
      })
  }, [slug])

  // Get this guest's secret token, creating it the first time it's needed.
  // Must not live only in join(): returning guests skip the join screen.
  function getToken() {
    let t = localStorage.getItem(`token:${slug}`)
    if (!t) {
      t = crypto.randomUUID()
      localStorage.setItem(`token:${slug}`, t)
    }
    return t
  }

  function join(e) {
    e.preventDefault()
    const clean = name.trim().slice(0, 40)
    if (!clean) return
    getToken()
    localStorage.setItem(`name:${slug}`, clean)
    setName(clean)
    setJoined(true)
  }

  async function handleFiles(fileList) {
    if (event?.uploads_paused) return
    const token = getToken()
    const files = Array.from(fileList).slice(0, SHOT_LIMIT - myShots.length)
    for (const file of files) {
      const tempId = crypto.randomUUID()
      setQueue((q) => [...q, { id: tempId, status: 'uploading' }])
      try {
        const compressed = await imageCompression(file, {
          maxSizeMB: 0.9,
          maxWidthOrHeight: 2000,
          useWebWorker: true,
          fileType: 'image/jpeg',
          initialQuality: 0.82,
        })
        const path = `${slug}/${tempId}.jpg`
        const { error: upErr } = await supabase.storage
          .from(BUCKET)
          .upload(path, compressed, { contentType: 'image/jpeg' })
        if (upErr) throw upErr

        const { data: inserted, error: dbErr } = await supabase
          .from('photos')
          .insert({ event_slug: slug, guest_name: name, storage_path: path, guest_token: token })
          .select('id')
          .single()
        if (dbErr) throw dbErr

        setMyShots((prev) => {
          const next = [...prev, { id: inserted.id, path }].slice(0, SHOT_LIMIT)
          localStorage.setItem(`shots:${slug}`, JSON.stringify(next))
          return next
        })
        setQueue((q) => q.filter((x) => x.id !== tempId))
      } catch (err) {
        console.error(err)
        // 42501 = row level security rejected the insert: host paused uploads
        if (err?.code === '42501') {
          setEvent((ev) => ({ ...ev, uploads_paused: true }))
          setQueue((q) => q.filter((x) => x.id !== tempId))
          return
        }
        setQueue((q) =>
          q.map((x) => (x.id === tempId ? { ...x, status: 'failed' } : x))
        )
      }
    }
  }

  async function deleteShot(shot) {
    if (!confirm('Remove this photo from the gallery?')) return
    setDeleteError('')
    const { error: err } = await supabase.rpc('delete_own_photo', {
      p_photo_id: shot.id,
      p_token: getToken(),
    })
    if (err) {
      // If the row is already gone (e.g. host removed it), treat as deleted
      // so the thumbnail clears and the shot is refunded.
      const { data: row } = await supabase
        .from('photos')
        .select('id')
        .eq('id', shot.id)
        .maybeSingle()
      if (row) {
        console.error(err)
        setDeleteError('Could not delete that photo. Ask the host to remove it.')
        setViewing(null)
        return
      }
    }
    const next = myShots.filter((s) => s.path !== shot.path)
    setMyShots(next)
    localStorage.setItem(`shots:${slug}`, JSON.stringify(next))
    setViewing(null)
  }

  if (event === undefined) return <div className="page center-page"><p className="muted">Loading…</p></div>
  if (event === null)
    return (
      <div className="page center-page">
        <h1 className="display">Event not found</h1>
        <p className="muted">Check the link on your invitation card.</p>
      </div>
    )

  const shotsLeft = SHOT_LIMIT - myShots.length
  const uploading = queue.filter((q) => q.status === 'uploading').length
  const failed = queue.filter((q) => q.status === 'failed').length

  return (
    <div className="page">
      <header className="event-header">
        <p className="eyebrow">Walimatul Urus</p>
        <h1 className="display">{event.couple_names}</h1>
        {event.event_date && (
          <p className="event-date">
            {new Date(event.event_date).toLocaleDateString('en-GB', {
              day: 'numeric', month: 'long', year: 'numeric',
            })}
          </p>
        )}
        <div className="gold-rule" />
      </header>

      {!joined ? (
        <div className="card join-card">
          <p className="join-lead">
            You've been handed a camera. Take up to {SHOT_LIMIT} photos of the
            couple and the celebration, they'll appear in the live gallery.
          </p>
          <form onSubmit={join}>
            <label className="field-label" htmlFor="guest-name">Your name</label>
            <input
              id="guest-name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Aiman"
              autoComplete="name"
            />
            <button className="btn btn-primary" type="submit">
              Pick up the camera
            </button>
          </form>
        </div>
      ) : (
        <>
          <div className="counter-strip" aria-live="polite">
            <span className="counter-num">{String(shotsLeft).padStart(2, '0')}</span>
            <span className="counter-label">shots left</span>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            hidden
            onChange={(e) => {
              handleFiles(e.target.files)
              e.target.value = ''
            }}
          />

          <button
            className="btn btn-primary btn-big"
            disabled={shotsLeft <= 0 || event.uploads_paused}
            onClick={() => fileRef.current.click()}
          >
            {event.uploads_paused
              ? 'Uploads paused'
              : shotsLeft > 0 ? 'Take / upload photos' : 'Film finished!'}
          </button>

          {event.uploads_paused && (
            <p className="status">
              The host has paused photo uploads for now. Hold tight!
            </p>
          )}

          {uploading > 0 && (
            <p className="status">Uploading {uploading} photo{uploading > 1 ? 's' : ''}…</p>
          )}
          {failed > 0 && (
            <p className="status status-error">
              {failed} upload{failed > 1 ? 's' : ''} failed. Check your connection and try again.
            </p>
          )}
          {deleteError && <p className="status status-error">{deleteError}</p>}

          <Link className="btn btn-ghost" to={`/${slug}/gallery`}>
            View the live gallery
          </Link>

          {myShots.length > 0 && (
            <>
              <p className="section-label">Your shots</p>
              <div className="mini-grid">
                {myShots.map((shot, i) => (
                  <div key={shot.path} className="mini-shot">
                    <img
                      src={photoUrl(shot.path)}
                      alt=""
                      loading="lazy"
                      onClick={() => setViewing(i)}
                    />
                    {shot.id && (
                      <button
                        className="btn-delete-own"
                        onClick={() => deleteShot(shot)}
                        aria-label="Remove photo"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}

      <p className="credit">Made with love by Adam and (some others)</p>

      {viewing !== null && myShots[viewing] && (
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
            src={photoUrl(myShots[viewing].path)}
            alt=""
            onClick={(e) => e.stopPropagation()}
          />
          {viewing < myShots.length - 1 && (
            <button
              className="lightbox-nav lightbox-next"
              aria-label="Next photo"
              onClick={(e) => { e.stopPropagation(); setViewing(viewing + 1) }}
            >
              ›
            </button>
          )}
          <div className="lightbox-actions" onClick={(e) => e.stopPropagation()}>
            <button
              className="btn btn-ghost btn-ghost-light"
              onClick={() => savePhoto(myShots[viewing].path)}
            >
              ↓ Save
            </button>
            {myShots[viewing].id && (
              <button className="btn btn-danger" onClick={() => deleteShot(myShots[viewing])}>
                Delete
              </button>
            )}
            <button className="btn btn-ghost btn-ghost-light" onClick={() => setViewing(null)}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
