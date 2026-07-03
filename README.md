# Wedding Cam 📸

A digital disposable camera for weddings. Guests scan a QR code, type their
name, and upload photos straight into a live gallery. No app download, no
login. React + Vite + Supabase.

## Routes

| URL | Who | What |
|---|---|---|
| `/your-slug` | Guests | Name entry, upload photos (15 shot limit each) |
| `/your-slug/gallery` | Everyone | Live polaroid gallery, updates in realtime |
| `/your-slug/host` | You / the couple | QR code, delete photos, download all as zip |

## Setup (about 20 minutes)

### 1. Supabase (5 min)
1. Go to [supabase.com](https://supabase.com), create a free project.
2. Open **SQL Editor**, paste the whole of `supabase.sql`.
3. **Before running**: edit the last insert at the bottom. Set your slug
   (becomes the URL), the couple's names, and a host key (this is the
   password for the host dashboard, make it long).
4. Run it.
5. Go to **Project Settings → API** and copy the Project URL and the
   `anon` public key.

### 2. Local run (5 min)
```bash
npm install
cp .env.example .env    # then paste your URL + anon key into .env
npm run dev
```
Open `http://localhost:5173/your-slug` and test an upload.

### 3. Deploy to Vercel (10 min)
1. Push this folder to a GitHub repo.
2. Import it in Vercel (same as your marathon PWA).
3. Add the two environment variables from `.env` in Vercel's project
   settings.
4. **Important**: add a `vercel.json` rewrite so client-side routes work
   (already included in this repo).
5. Deploy. Your guest link is `https://yourapp.vercel.app/your-slug`.

### 4. Tonight's checklist
- [ ] Open `/your-slug/host`, unlock with your host key, print the QR page
- [ ] Test the full flow on YOUR phone over mobile data (not wifi)
- [ ] Test on one iPhone and one Android if you can
- [ ] Upload 5 photos rapidly to check nothing breaks
- [ ] Put the gallery on a laptop/TV at the venue if there's a screen
- [ ] Keep the disposable.app backup QR in your pocket

## How the important bits work (read this, future you)

**Compression before upload.** `browser-image-compression` shrinks every
photo to ~0.9MB / max 2000px in the guest's browser before it ever leaves
their phone. This is why it works on bad venue wifi: a 6MB iPhone photo
becomes ~800KB.

**Direct-to-storage uploads.** Photos go from the guest's browser straight
to Supabase Storage. There is no server of yours in the middle to overload.

**Realtime gallery.** The gallery subscribes to Postgres changes on the
`photos` table. When any guest inserts a row, every open gallery receives
the event over a websocket and the photo animates in.

**Security model.** The `anon` key in the frontend is public by design.
Row Level Security decides what it can do: read and insert photos, nothing
else. The host key never reaches the browser from the database; it's only
checked inside `security definer` functions on the server. This is the part
worth actually understanding, it's how all Supabase apps stay safe.

## Costs
Supabase free tier: 1GB storage, plenty for one wedding at ~0.8MB/photo
(roughly 1,200 photos). Vercel free tier covers the hosting. Total: RM0.
