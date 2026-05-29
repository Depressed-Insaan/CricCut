# CricCut

A mobile-friendly React app for building cricket highlight reels. Upload a match video, set clip ranges on a draggable timeline, tag moments, preview, reorder, and export via Cloudinary.

## Features

- Dark UI with green cricket-themed accents
- **Draggable timeline** for manual in/out points per clip (default ±10s when marking)
- **Tags**: Six, Wicket, Catch, or Custom label
- **Drag-and-drop** clip reordering in editor and preview
- **Preview & export** screen with per-clip preview, extra trimming, individual downloads, or stitched reel
- Cloudinary upload, trim, splice, and download links

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- A [Cloudinary](https://cloudinary.com/) account (free tier works)

## Setup

1. Install dependencies:

   ```bash
   npm install
   npm install --prefix server
   npm install --prefix client
   ```

2. Copy environment variables:

   ```bash
   copy .env.example server\.env
   copy client\.env.example client\.env
   ```

   Edit `server/.env` with your Cloudinary **Cloud name**, **API Key**, and **API Secret** from the [Cloudinary Console](https://cloudinary.com/console).

   Set `VITE_API_URL` in `client/.env` to your API origin (e.g. `http://localhost:3001` for local dev, or your production API URL).

3. Run development (client + API):

   ```bash
   npm run dev
   ```

   - App: http://localhost:5173  
   - API: http://localhost:3001  

## Production

```bash
npm run build
npm start
```

Serves the built client from the Express server on port 3001.

## How it works

1. The browser uploads the full match video to Cloudinary (`POST /api/upload`).
2. You mark highlights and drag timeline handles to set each clip’s start/end (default ±10s around the playhead).
3. **Preview & export** lets you reorder clips, trim again, and export.
4. `POST /api/export-clips` returns per-clip download URLs; `POST /api/stitch` splices clips in your chosen order into one reel.

## Project structure

```
CricCut/
├── client/          # Vite + React frontend
├── server/          # Express + Cloudinary API
├── .env.example
└── package.json
```

## License

MIT
