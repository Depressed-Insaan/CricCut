import { useEffect } from 'react';

/** Keeps video playback within [start, end] while previewing a clip. */
export function useSegmentPlayback(videoRef, start, end, active) {
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !active || start == null || end == null) return;

    const onTimeUpdate = () => {
      if (v.currentTime >= end - 0.05) {
        v.currentTime = start;
        v.play().catch(() => {});
      }
      if (v.currentTime < start - 0.1) {
        v.currentTime = start;
      }
    };

    v.addEventListener('timeupdate', onTimeUpdate);
    return () => v.removeEventListener('timeupdate', onTimeUpdate);
  }, [videoRef, start, end, active]);
}
