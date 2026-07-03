import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import JSZip from 'jszip'
import { supabase, photoUrl } from '../lib/supabase.js'

export default function HostPage() {
  const { slug } = useParams()
  const [key, setKey] = useState(sessionStorage.getItem(`hostkey:${slug}`) || '')
  const [verified, setVerified] = useState(false)
  const [event, setEvent] = useState(null)
  const [photos, setPhotos] = useState([])
  const [zipping, setZipping] = useState(false)
  const [error, setError] = useState('')

  const guestUrl = `${window.location.origin}/${slug}`

  useEffect(() => {
    supabase
      .rpc('get_event', { p_slug: slug })
      .then(({ data }) => setEvent(data && data.length ? data[0] : null))
  }, [slug])

  useEffect(() => {
    if (key && !verified) verify()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function verify(e) {
    e?.preventDefault()
    setError('')
    const { data, error: err } = await supabase.rpc('verify_host', {
      p_slug: slug,
      p_key: key,
    })
    if (err || !data) {
      setError('Wrong key. Check the host key you set in Supabase.')
      return
    }
    sessionStorage.setItem(`hostkey:${slug}`, key)
    setVerified(true)
    loadPhotos()
  }

  async function loadPhotos() {
    const { data } = await supabase
      .from('photos')
      .select('id, guest_name, storage_path, created_at')
      .eq('event_slug', slug)
      .order('created_at', { ascending: false })
    setPhotos(data || [])
  }

  async function togglePause() {
    const paused = !event?.uploads_paused
    const { error: err } = await supabase.rpc('set_uploads_paused', {
      p_slug: slug,
      p_key: key,
      p_paused: paused,
    })
    if (!err) setEvent((ev) => ({ ...ev, uploads_paused: paused }))
  }

  async function removePhoto(id) {
    if (!confirm('Delete this photo for everyone?')) return
    const { error: err } = await supabase.rpc('delete_photo', {
      p_photo_id: id,
      p_key: key,
    })
    if (!err) setPhotos((prev) => prev.filter((p) => p.id !== id))
  }

  async function downloadAll() {
    setZipping(true)
    try {
      const zip = new JSZip()
      let i = 1
      for (const p of photos) {
        const res = await fetch(photoUrl(p.storage_path))
        const blob = await res.blob()
        const safeName = p.guest_name.replace(/[^a-z0-9]/gi, '_')
        zip.file(`${String(i).padStart(3, '0')}_${safeName}.jpg`, blob)
        i++
      }
      const out = await zip.generateAsync({ type: 'blob' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(out)
      a.download = `${slug}-photos.zip`
      a.click()
      URL.revokeObjectURL(a.href)
    } finally {
      setZipping(false)
    }
  }

  if (!verified) {
    return (
      <div className="page center-page">
        <p className="eyebrow">Host access</p>
        <h1 className="display">{event ? event.couple_names : slug}</h1>
        <form className="card join-card" onSubmit={verify}>
          <label className="field-label" htmlFor="host-key">Host key</label>
          <input
            id="host-key"
            className="input"
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="The key you set in Supabase"
          />
          {error && <p className="status status-error">{error}</p>}
          <button className="btn btn-primary" type="submit">Unlock</button>
        </form>
      </div>
    )
  }

  return (
    <div className="page page-wide">
      <header className="event-header">
        <p className="eyebrow">Host dashboard</p>
        <h1 className="display">{event?.couple_names}</h1>
        <div className="gold-rule" />
      </header>

      <div className="host-panels">
        <div className="card qr-card">
          <p className="section-label">Guest QR code</p>
          <div className="qr-frame">
            <QRCodeSVG value={guestUrl} size={200} bgColor="#FBF8F3" fgColor="#1E2A22" />
          </div>
          <p className="muted small">{guestUrl}</p>
          <button className="btn btn-ghost" onClick={() => window.print()}>
            Print this page
          </button>
        </div>

        <div className="card">
          <p className="section-label">Album · {photos.length} photos</p>
          <button
            className="btn btn-primary"
            onClick={downloadAll}
            disabled={zipping || photos.length === 0}
          >
            {zipping ? 'Preparing zip…' : 'Download all as .zip'}
          </button>
          <button className="btn btn-ghost" onClick={loadPhotos}>Refresh</button>
          <button className="btn btn-ghost" onClick={togglePause}>
            {event?.uploads_paused ? '▶ Resume guest uploads' : '⏸ Pause guest uploads'}
          </button>
          {event?.uploads_paused && (
            <p className="status">Guests cannot upload right now.</p>
          )}
        </div>
      </div>

      <div className="host-grid">
        {photos.map((p) => (
          <div key={p.id} className="host-photo">
            <img src={photoUrl(p.storage_path)} alt="" loading="lazy" />
            <div className="host-photo-meta">
              <span>{p.guest_name}</span>
              <button className="btn-delete" onClick={() => removePhoto(p.id)}>
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
