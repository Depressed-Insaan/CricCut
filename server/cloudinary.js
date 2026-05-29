import './loadEnv.js';
import { v2 as cloudinary } from 'cloudinary';

function getCloudinaryEnv() {
  return {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME?.trim(),
    apiKey: process.env.CLOUDINARY_API_KEY?.trim(),
    apiSecret: process.env.CLOUDINARY_API_SECRET?.trim(),
  };
}

export function isCloudinaryConfigured() {
  const { cloudName, apiKey, apiSecret } = getCloudinaryEnv();
  return Boolean(cloudName && apiKey && apiSecret);
}

export function configureCloudinary() {
  const { cloudName, apiKey, apiSecret } = getCloudinaryEnv();

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error(
      'Cloudinary is not configured. Copy .env.example to server/.env and add your credentials.'
    );
  }

  cloudinary.config({
    cloud_name: cloudName,
    api_key: apiKey,
    api_secret: apiSecret,
    secure: true,
  });

  return cloudinary;
}

export function toOverlayId(publicId) {
  return publicId.replace(/\//g, ':');
}

const MIN_CLIP_SEC = 1;

export function normalizeServerClip(raw, durationSec) {
  const start = Number(raw.start);
  const end = Number(raw.end);
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    throw new Error('Each clip requires numeric start and end times.');
  }
  let s = Math.max(0, start);
  let e = end;
  if (durationSec != null) {
    s = Math.min(s, durationSec);
    e = Math.min(e, durationSec);
  }
  if (e - s < MIN_CLIP_SEC) {
    e = durationSec != null
      ? Math.min(durationSec, s + MIN_CLIP_SEC)
      : s + MIN_CLIP_SEC;
  }
  if (e <= s) {
    throw new Error('Clip end must be after clip start.');
  }
  return {
    start: s,
    duration: e - s,
    end: e,
    tag: raw.tag || 'Highlight',
    customLabel: raw.customLabel || '',
  };
}

export function parseClipsPayload(clips, durationSec) {
  if (!Array.isArray(clips) || clips.length === 0) {
    throw new Error('At least one clip is required.');
  }
  return clips.map((c) => normalizeServerClip(c, durationSec));
}

function resolveTransformation(transformation, publicId) {
  const overlayId = toOverlayId(publicId);
  return transformation.map((step) => {
    if (step.overlay === 'video:{{publicId}}') {
      return { ...step, overlay: `video:${overlayId}` };
    }
    return step;
  });
}

/**
 * Build splice chain from ordered clips [{ start, duration }].
 */
export function buildStitchTransformation(orderedClips) {
  if (orderedClips.length === 0) {
    throw new Error('At least one clip is required.');
  }

  const transformation = [
    {
      start_offset: String(orderedClips[0].start),
      duration: String(orderedClips[0].duration),
    },
  ];

  for (let i = 1; i < orderedClips.length; i++) {
    transformation.push({
      flags: 'splice',
      overlay: 'video:{{publicId}}',
      start_offset: String(orderedClips[i].start),
      duration: String(orderedClips[i].duration),
    });
    transformation.push({ flags: 'layer_apply' });
  }

  return transformation;
}

export function buildTrimTransformation(start, duration) {
  return [
    {
      start_offset: String(start),
      duration: String(duration),
    },
  ];
}

export function buildVideoUrl(publicId, transformation) {
  const cld = configureCloudinary();
  const resolved = resolveTransformation(transformation, publicId);
  return cld.url(publicId, {
    resource_type: 'video',
    type: 'upload',
    transformation: resolved,
    format: 'mp4',
  });
}

export function withAttachment(url) {
  return url.replace('/upload/', '/upload/fl_attachment/');
}

export function buildStitchUrl(publicId, clips, durationSec) {
  const parsed = parseClipsPayload(clips, durationSec);
  const transformation = buildStitchTransformation(parsed);
  return buildVideoUrl(publicId, transformation);
}

export function buildSingleClipUrl(publicId, clip, durationSec) {
  const [parsed] = parseClipsPayload([clip], durationSec);
  const transformation = buildTrimTransformation(parsed.start, parsed.duration);
  return buildVideoUrl(publicId, transformation);
}

export { cloudinary, MIN_CLIP_SEC };
