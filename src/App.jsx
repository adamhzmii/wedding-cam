import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import EventPage from './pages/EventPage.jsx'
import GalleryPage from './pages/GalleryPage.jsx'
import HostPage from './pages/HostPage.jsx'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/:slug" element={<EventPage />} />
        <Route path="/:slug/gallery" element={<GalleryPage />} />
        <Route path="/:slug/host" element={<HostPage />} />
        <Route path="*" element={<Landing />} />
      </Routes>
    </BrowserRouter>
  )
}

function Landing() {
  return (
    <div className="page center-page">
      <p className="eyebrow">Kenangan</p>
      <h1 className="display">Every guest is a photographer.</h1>
      <p className="muted">
        Scan the QR code from your invitation to open the event camera.
      </p>
    </div>
  )
}
