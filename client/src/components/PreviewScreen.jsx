import { useEffect, useRef, useState } from 'react';
import { exportIndividualClips, exportStitch } from '../api.js';
import { clipLabel, normalizeClip } from '../constants.js';
import { useSegmentPlayback } from '../hooks/useSegmentPlayback.js';
import { forceDownload, forceDownloadPost } from '../utils/download.js';
import { clipDuration, formatTime } from '../utils/time.js';
import ClipList from './ClipList.jsx';
import TagSelector from './TagSelector.jsx';
import Timeline from './Timeline.jsx';

export default function PreviewScreen({
  localUrl,
  duration,
  publicId,
  initialClips,
  onBack,
  onClipsChange,
  setStatus,
}) {
  const videoRef = useRef(null);
  const [clips, setClips] = useState(initialClips);
  const [selectedId, setSelectedId] = useState(initialClips[0]?.id ?? null);
  const [currentTime, setCurrentTime] = useState(0);
  const [exporting, setExporting] = useState(null);
  const [reelResult, setReelResult] = useState(null);
  const [clipExports, setClipExports] = useState(null);
  const [downloadingId, setDownloadingId] = useState(null);

  const selected = clips.find((c) => c.id === selectedId) ?? clips[0];

  useEffect(() => {
    onClipsChange(clips);
  }, [clips, onClipsChange]);

  useEffect(() => {
    if (selected && videoRef.current) {
      videoRef.current.currentTime = selected.start;
      setCurrentTime(selected.start);
    }
  }, [selectedId]);

  useSegmentPlayback(
    videoRef,
    selected?.start,
    selected?.end,
    Boolean(selected)
  );

  const updateSelected = (patch) => {
    if (!selected) return;
    setClips((prev) =>
      prev.map((c) =>
        c.id === selected.id
          ? normalizeClip({ ...c, ...patch }, duration)
          : c
      )
    );
  };

  const handleTimelineChange = ({ start, end }) => {
    updateSelected({ start, end });
    setReelResult(null);
    setClipExports(null);
  };

  const handleSeek = (t) => {
    if (videoRef.current) {
      videoRef.current.currentTime = t;
      setCurrentTime(t);
    }
  };

  const handleReorder = (from, to) => {
    setClips((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setReelResult(null);
    setClipExports(null);
  };

  const handleRemove = (id) => {
    setClips((prev) => {
      const next = prev.filter((c) => c.id !== id);
      if (selectedId === id) setSelectedId(next[0]?.id ?? null);
      return next;
    });
  };

  const runExport = async (mode) => {
    if (!publicId) {
      setStatus({ type: 'error', message: 'Cloudinary upload required to export.' });
      return;
    }
    if (clips.length === 0) {
      setStatus({ type: 'error', message: 'Add at least one clip.' });
      return;
    }

    setExporting(mode);
    setStatus({ type: 'info', message: 'Generating videos on Cloudinary…' });

    try {
      const payload = clips.map(({ id, start, end, tag, customLabel }) => ({
        id,
        start,
        end,
        tag,
        customLabel,
      }));

      if (mode === 'reel') {
        const data = await exportStitch(publicId, payload, duration);
        setReelResult(data);
        setStatus({
          type: 'info',
          message: `Reel ready — ${data.clipCount} clips stitched.`,
        });
      } else {
        const data = await exportIndividualClips(publicId, payload, duration);
        setClipExports(data.clips);
        setStatus({
          type: 'info',
          message: `${data.clips.length} individual clip(s) ready to download.`,
        });
      }
    } catch (err) {
      setStatus({ type: 'error', message: err.message || 'Export failed.' });
    } finally {
      setExporting(null);
    }
  };

  const downloadClip = (item) => {
    setDownloadingId(item.id);
    setStatus({ type: 'info', message: `Downloading ${item.label}…` });
    try {
      forceDownload(item.downloadUrl, item.filename);
      setTimeout(() => {
        setStatus({ type: 'info', message: `Download started: ${item.label}.` });
        setDownloadingId(null);
      }, 600);
    } catch (err) {
      setStatus({ type: 'error', message: err.message || 'Download failed.' });
      setDownloadingId(null);
    }
  };

  const downloadReel = async () => {
    if (!reelResult) return;
    setDownloadingId('reel');
    setStatus({ type: 'info', message: 'Downloading highlight reel…' });
    try {
      await forceDownloadPost(
        '/api/download-reel',
        {
          publicId,
          clips: clips.map(({ id, start, end, tag, customLabel }) => ({
            id,
            start,
            end,
            tag,
            customLabel,
          })),
          duration,
          filename: 'criccut-highlight-reel.mp4',
        },
        'criccut-highlight-reel.mp4'
      );
      setStatus({ type: 'info', message: 'Highlight reel download started.' });
    } catch (err) {
      setStatus({ type: 'error', message: err.message || 'Reel download failed.' });
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="preview-screen">
      <div className="preview-header">
        <button type="button" className="btn btn-secondary" onClick={onBack}>
          ← Back to editor
        </button>
        <h2 className="preview-title">Preview &amp; export</h2>
      </div>

      <section className="card">
        <h3 className="card-title">Clip preview</h3>
        <div className="player-wrap">
          <video
            ref={videoRef}
            src={localUrl}
            controls
            playsInline
            preload="metadata"
            onTimeUpdate={() =>
              setCurrentTime(videoRef.current?.currentTime ?? 0)
            }
          />
        </div>
        {selected && (
          <>
            <p className="preview-clip-name">
              {clipLabel(selected)} · {formatTime(clipDuration(selected))}
            </p>
            <TagSelector
              tag={selected.tag}
              customLabel={selected.customLabel || ''}
              onTagChange={(tag) => updateSelected({ tag })}
              onCustomLabelChange={(customLabel) =>
                updateSelected({ customLabel })
              }
            />
            <Timeline
              duration={duration}
              currentTime={currentTime}
              start={selected.start}
              end={selected.end}
              onChange={handleTimelineChange}
              onSeek={handleSeek}
              label="Trim clip — drag handles"
            />
            <button
              type="button"
              className="btn btn-secondary preview-play-btn"
              onClick={() => {
                if (videoRef.current) {
                  videoRef.current.currentTime = selected.start;
                  videoRef.current.play().catch(() => {});
                }
              }}
            >
              Play clip segment
            </button>
          </>
        )}
      </section>

      <section className="card">
        <h3 className="card-title">Clip order ({clips.length})</h3>
        <p className="upload-hint reorder-hint">
          Drag clips to reorder before stitching the final reel.
        </p>
        <ClipList
          clips={clips}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onRemove={handleRemove}
          onReorder={handleReorder}
        />
      </section>

      <section className="card export-actions">
        <button
          type="button"
          className="btn btn-secondary export-btn"
          disabled={!!exporting || clips.length === 0 || !publicId}
          onClick={() => runExport('individual')}
        >
          {exporting === 'individual' ? (
            <>
              <span className="spinner" /> Exporting clips…
            </>
          ) : (
            'Export individual clips'
          )}
        </button>
        <button
          type="button"
          className="btn-reel export-btn"
          disabled={!!exporting || clips.length === 0 || !publicId}
          onClick={() => runExport('reel')}
        >
          {exporting === 'reel' ? (
            <>
              <span className="spinner" /> Stitching reel…
            </>
          ) : (
            'Export stitched highlight reel'
          )}
        </button>
      </section>

      {clipExports && (
        <section className="card result-card">
          <h3 className="card-title">Individual downloads</h3>
          <ul className="export-links">
            {clipExports.map((item) => (
              <li key={item.id}>
                <span className="export-link-label">{item.label}</span>
                <button
                  type="button"
                  className="download-link download-link--sm"
                  onClick={() => downloadClip(item)}
                  disabled={downloadingId === item.id}
                >
                  {downloadingId === item.id ? 'Downloading…' : 'Download'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {reelResult && (
        <section className="card result-card">
          <h3 className="card-title">Stitched reel</h3>
          <p style={{ margin: 0, color: 'var(--text-muted)' }}>
            {reelResult.clipCount} clips in your chosen order.
          </p>
          <button
            type="button"
            className="download-link"
            onClick={downloadReel}
            disabled={downloadingId === 'reel'}
          >
            {downloadingId === 'reel' ? 'Downloading…' : 'Download highlight reel'}
          </button>
          <p style={{ margin: '1rem 0 0', fontSize: '0.8rem' }}>
            <a
              href={reelResult.highlightUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open stream link
            </a>
          </p>
        </section>
      )}
    </div>
  );
}
