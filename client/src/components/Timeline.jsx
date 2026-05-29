import { useCallback, useRef } from 'react';
import { MIN_CLIP_SEC } from '../constants.js';
import { clamp } from '../utils/time.js';
import './Timeline.css';

export default function Timeline({
  duration,
  currentTime = 0,
  start,
  end,
  onChange,
  onSeek,
  showRange = true,
  label,
}) {
  const trackRef = useRef(null);
  const dragRef = useRef(null);

  const pct = useCallback(
    (t) => (duration > 0 ? (t / duration) * 100 : 0),
    [duration]
  );

  const timeFromX = useCallback(
    (clientX) => {
      if (!trackRef.current || duration <= 0) return 0;
      const rect = trackRef.current.getBoundingClientRect();
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
      return ratio * duration;
    },
    [duration]
  );

  const handlePointerDown = (handle, e) => {
    e.preventDefault();
    dragRef.current = handle;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e) => {
    if (!dragRef.current || duration <= 0) return;
    const t = timeFromX(e.clientX);

    if (dragRef.current === 'start' && onChange) {
      const newStart = clamp(t, 0, end - MIN_CLIP_SEC);
      onChange({ start: newStart, end });
    } else if (dragRef.current === 'end' && onChange) {
      const newEnd = clamp(t, start + MIN_CLIP_SEC, duration);
      onChange({ start, end: newEnd });
    } else if (dragRef.current === 'seek' && onSeek) {
      onSeek(t);
    }
  };

  const handlePointerUp = (e) => {
    if (dragRef.current) {
      e.currentTarget.releasePointerCapture(e.pointerId);
      dragRef.current = null;
    }
  };

  const handleTrackPointerDown = (e) => {
    if (e.target.closest('.timeline-handle')) return;
    const t = timeFromX(e.clientX);
    if (onSeek) {
      dragRef.current = 'seek';
      e.currentTarget.setPointerCapture(e.pointerId);
      onSeek(t);
    }
  };

  if (!duration || duration <= 0) {
    return (
      <div className="timeline timeline--empty">
        <p>Load video to use the timeline.</p>
      </div>
    );
  }

  const rangeLeft = pct(start);
  const rangeWidth = pct(end) - rangeLeft;
  const playheadLeft = pct(currentTime);

  return (
    <div className="timeline">
      {label && <p className="timeline-label">{label}</p>}
      <div className="timeline-times">
        <span>{formatTick(start)}</span>
        <span className="timeline-times-mid">
          {showRange ? `${formatTick(end - start)} selected` : formatTick(currentTime)}
        </span>
        <span>{formatTick(end)}</span>
      </div>
      <div
        ref={trackRef}
        className="timeline-track"
        role="slider"
        aria-label={label || 'Video timeline'}
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={currentTime}
        onPointerDown={handleTrackPointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="timeline-track-bg" />
        {showRange && (
          <div
            className="timeline-range"
            style={{ left: `${rangeLeft}%`, width: `${rangeWidth}%` }}
          />
        )}
        <div
          className="timeline-playhead"
          style={{ left: `${playheadLeft}%` }}
        />
        {showRange && (
          <>
            <button
              type="button"
              className="timeline-handle timeline-handle--start"
              style={{ left: `${rangeLeft}%` }}
              aria-label="Drag clip start"
              onPointerDown={(e) => handlePointerDown('start', e)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            />
            <button
              type="button"
              className="timeline-handle timeline-handle--end"
              style={{ left: `${pct(end)}%` }}
              aria-label="Drag clip end"
              onPointerDown={(e) => handlePointerDown('end', e)}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            />
          </>
        )}
      </div>
      <div className="timeline-footer">
        <span>0:00</span>
        <span>{formatTick(duration)}</span>
      </div>
    </div>
  );
}

function formatTick(seconds) {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}
