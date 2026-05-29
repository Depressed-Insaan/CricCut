import './loadEnv.js';
import cors from 'cors';
import express from 'express';
import multer from 'multer';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import { fileURLToPath } from 'url';
import {
  buildSingleClipUrl,
  buildStitchUrl,
  configureCloudinary,
  isCloudinaryConfigured,
  withAttachment,
} from './cloudinary.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
const PORT = process.env.PORT || 3001;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 500 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed.'));
    }
  },
});

app.use(cors());
app.use(express.json({ limit: '1mb' }));

function sanitizeFilename(name) {
  const base = (name || 'criccut-clip.mp4').replace(/[^\w.-]+/g, '_');
  return base.endsWith('.mp4') ? base : `${base}.mp4`;
}

async function streamAttachment(res, sourceUrl, filename) {
  const upstream = await fetch(sourceUrl);
  if (!upstream.ok) {
    throw new Error(`Cloudinary returned ${upstream.status}`);
  }

  const safeName = sanitizeFilename(filename);
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
  res.setHeader(
    'Content-Type',
    upstream.headers.get('content-type') || 'video/mp4'
  );
  const len = upstream.headers.get('content-length');
  if (len) res.setHeader('Content-Length', len);

  if (upstream.body) {
    await pipeline(Readable.fromWeb(upstream.body), res);
  } else {
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.send(buf);
  }
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    cloudinary: isCloudinaryConfigured(),
  });
});

app.post('/api/upload', upload.single('video'), async (req, res) => {
  try {
    if (!isCloudinaryConfigured()) {
      return res.status(503).json({
        error:
          'Cloudinary is not configured. Add credentials to server/.env (see .env.example).',
      });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No video file provided.' });
    }

    const cloudinary = configureCloudinary();
    const stream = Readable.from(req.file.buffer);

    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'video',
          folder: 'criccut',
          use_filename: true,
          unique_filename: true,
        },
        (error, uploadResult) => {
          if (error) reject(error);
          else resolve(uploadResult);
        }
      );
      stream.pipe(uploadStream);
    });

    res.json({
      publicId: result.public_id,
      duration: result.duration ?? null,
      width: result.width,
      height: result.height,
      bytes: result.bytes,
      previewUrl: result.secure_url,
    });
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({
      error: err.message || 'Failed to upload video to Cloudinary.',
    });
  }
});

app.post('/api/stitch', async (req, res) => {
  try {
    if (!isCloudinaryConfigured()) {
      return res.status(503).json({ error: 'Cloudinary is not configured.' });
    }

    const { publicId, clips, duration } = req.body;

    if (!publicId || typeof publicId !== 'string') {
      return res.status(400).json({ error: 'publicId is required.' });
    }

    const durationSec =
      duration != null && Number.isFinite(Number(duration))
        ? Number(duration)
        : null;

    const highlightUrl = buildStitchUrl(publicId, clips, durationSec);
    const downloadUrl = withAttachment(highlightUrl);

    res.json({
      highlightUrl,
      downloadUrl,
      clipCount: clips.length,
    });
  } catch (err) {
    console.error('Stitch error:', err);
    res.status(500).json({
      error: err.message || 'Failed to build highlight reel.',
    });
  }
});

app.get('/api/download-clip', async (req, res) => {
  try {
    if (!isCloudinaryConfigured()) {
      return res.status(503).json({ error: 'Cloudinary is not configured.' });
    }

    const { publicId, start, end, filename, duration } = req.query;

    if (!publicId || start == null || end == null) {
      return res
        .status(400)
        .json({ error: 'publicId, start, and end are required.' });
    }

    const durationSec =
      duration != null && Number.isFinite(Number(duration))
        ? Number(duration)
        : null;

    const clip = { start: Number(start), end: Number(end) };
    const cloudinaryUrl = buildSingleClipUrl(publicId, clip, durationSec);

    await streamAttachment(res, cloudinaryUrl, filename);
  } catch (err) {
    console.error('Download clip error:', err);
    if (!res.headersSent) {
      res.status(500).json({
        error: err.message || 'Failed to download clip.',
      });
    }
  }
});

app.post('/api/download-reel', async (req, res) => {
  try {
    if (!isCloudinaryConfigured()) {
      return res.status(503).json({ error: 'Cloudinary is not configured.' });
    }

    const { publicId, clips, duration, filename } = req.body;

    if (!publicId || !Array.isArray(clips) || clips.length === 0) {
      return res.status(400).json({ error: 'publicId and clips are required.' });
    }

    const durationSec =
      duration != null && Number.isFinite(Number(duration))
        ? Number(duration)
        : null;

    const cloudinaryUrl = buildStitchUrl(publicId, clips, durationSec);
    await streamAttachment(
      res,
      cloudinaryUrl,
      filename || 'criccut-highlight-reel.mp4'
    );
  } catch (err) {
    console.error('Download reel error:', err);
    if (!res.headersSent) {
      res.status(500).json({
        error: err.message || 'Failed to download reel.',
      });
    }
  }
});

app.post('/api/export-clips', async (req, res) => {
  try {
    if (!isCloudinaryConfigured()) {
      return res.status(503).json({ error: 'Cloudinary is not configured.' });
    }

    const { publicId, clips, duration } = req.body;

    if (!publicId || typeof publicId !== 'string') {
      return res.status(400).json({ error: 'publicId is required.' });
    }

    const durationSec =
      duration != null && Number.isFinite(Number(duration))
        ? Number(duration)
        : null;

    const exported = clips.map((clip, index) => {
      const highlightUrl = buildSingleClipUrl(publicId, clip, durationSec);
      const label =
        clip.tag === 'Custom' && clip.customLabel
          ? clip.customLabel
          : clip.tag || `clip-${index + 1}`;
      const safeName = label.replace(/[^\w-]+/g, '_').toLowerCase();
      const filename = `criccut-${safeName}-${index + 1}.mp4`;
      const params = new URLSearchParams({
        publicId,
        start: String(clip.start),
        end: String(clip.end),
        filename,
      });
      if (durationSec != null) params.set('duration', String(durationSec));

      return {
        id: clip.id || `clip-${index}`,
        tag: clip.tag,
        label,
        start: clip.start,
        end: clip.end,
        highlightUrl,
        filename,
        downloadUrl: `/api/download-clip?${params.toString()}`,
      };
    });

    res.json({ clips: exported });
  } catch (err) {
    console.error('Export clips error:', err);
    res.status(500).json({
      error: err.message || 'Failed to export clips.',
    });
  }
});

const clientDist = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  res.sendFile(path.join(clientDist, 'index.html'), (err) => {
    if (err) next();
  });
});

app.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: err.message });
  }
  if (err) {
    return res.status(400).json({ error: err.message || 'Request failed.' });
  }
});

app.listen(PORT, () => {
  console.log(`CricCut server http://localhost:${PORT}`);
  if (!isCloudinaryConfigured()) {
    console.warn(
      'Warning: Cloudinary credentials missing — copy .env.example to server/.env'
    );
  }
});
