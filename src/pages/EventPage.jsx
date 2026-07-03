import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import imageCompression from 'browser-image-compression'
import { supabase, BUCKET, photoUrl } from '../lib/supabase.js'

const SHOT_LIMIT = 5

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
  const fileRef = useRef(null)

  useEffect(() => {
    supabase
      .rpc('get_event', { p_slug: slug })
      .then(({ data }) => setEvent(data && data.length ? data[0] : null))
  }, [slug])

  function join(e) {
    e.preventDefault()
    const clean = name.trim().slice(0, 40)
    if (!clean) return
    if (!localStorage.getItem(`token:${slug}`)) {
      localStorage.setItem(`token:${slug}`, crypto.randomUUID())
    }
    localStorage.setItem(`name:${slug}`, clean)
    setName(clean)
    setJoined(true)
  }

  async function handleFiles(fileList) {
    const token = localStorage.getItem(`token:${slug}`)
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

        const next = [...myShots, { id: inserted.id, path }].slice(0, SHOT_LIMIT)
        setMyShots(next)
        localStorage.setItem(`shots:${slug}`, JSON.stringify(next))
        setQueue((q) => q.filter((x) => x.id !== tempId))
      } catch (err) {
        console.error(err)
        setQueue((q) =>
          q.map((x) => (x.id === tempId ? { ...x, status: 'failed' } : x))
        )
      }
    }
  }

  async function deleteShot(shot) {
    if (!confirm('Remove this photo from the gallery?')) return
    const token = localStorage.getItem(`token:${slug}`)
    const { error: err } = await supabase.rpc('delete_own_photo', {
      p_photo_id: shot.id,
      p_token: token,
    })
    if (err) {
      console.error(err)
      return
    }
    const next = myShots.filter((s) => s.path !== shot.path)
    setMyShots(next)
    localStorage.setItem(`shots:${slug}`, JSON.stringify(next))
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
            <span className="counter-label">shots left · {name}</span>
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
            disabled={shotsLeft <= 0}
            onClick={() => fileRef.current.click()}
          >
            {shotsLeft > 0 ? '📸 Take / upload photos' : 'Film finished!'}
          </button>

          {uploading > 0 && (
            <p className="status">Uploading {uploading} photo{uploading > 1 ? 's' : ''}…</p>
          )}
          {failed > 0 && (
            <p className="status status-error">
              {failed} upload{failed > 1 ? 's' : ''} failed. Check your connection and try again.
            </p>
          )}

          {myShots.length > 0 && (
            <>
              <p className="section-label">Your shots</p>
              <div className="mini-grid">
                {myShots.map((shot) => (
                  <div key={shot.path} className="mini-shot">
                    <img src={photoUrl(shot.path)} alt="" loading="lazy" />
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
              <p className="thanks">Terima kasih! 💛</p>
            </>
          )}

          <Link className="btn btn-ghost" to={`/${slug}/gallery`}>
            View the live gallery →
          </Link>
        </>
      )}
    </div>
  )
}
