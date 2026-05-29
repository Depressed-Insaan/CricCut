import { clamp } from './utils/time.js';

export const TAGS = ['Six', 'Wicket', 'Catch', 'Custom'];

export const DEFAULT_PADDING = 10;
export const MIN_CLIP_SEC = 1;

export function createClipId() {
  return crypto.randomUUID();
}

export function defaultClipRange(mark, duration) {
  const start = Math.max(0, mark - DEFAULT_PADDING);
  const end =
    duration != null
      ? Math.min(duration, mark + DEFAULT_PADDING)
      : mark + DEFAULT_PADDING;
  return {
    start,
    end: Math.max(start + MIN_CLIP_SEC, end),
  };
}

export function clipLabel(clip) {
  if (clip.tag === 'Custom' && clip.customLabel?.trim()) {
    return clip.customLabel.trim();
  }
  return clip.tag;
}

export function normalizeClip(clip, duration) {
  let start = Number(clip.start);
  let end = Number(clip.end);
  if (!Number.isFinite(start)) start = 0;
  if (!Number.isFinite(end)) end = start + MIN_CLIP_SEC;
  if (duration != null) {
    start = clamp(start, 0, duration);
    end = clamp(end, 0, duration);
  } else {
    start = Math.max(0, start);
    end = Math.max(start, end);
  }
  if (end - start < MIN_CLIP_SEC) {
    end = duration != null
      ? Math.min(duration, start + MIN_CLIP_SEC)
      : start + MIN_CLIP_SEC;
  }
  if (end <= start) end = start + MIN_CLIP_SEC;
  return { ...clip, start, end };
}
