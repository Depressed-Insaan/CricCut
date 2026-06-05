import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ThreeBackground from './components/ThreeBackground.jsx';
import PreviewScreen from './components/PreviewScreen.jsx';
import ClipList from './components/ClipList.jsx';
import TagSelector from './components/TagSelector.jsx';
import Timeline from './components/Timeline.jsx';
import AIAnalysis from './components/AIAnalysis.jsx';
import {
  createClipId,
  defaultClipRange,
  normalizeClip,
} from './constants.js';
import { apiUrl } from './apiBase.js';
import { formatTime } from './utils/time.js';
import './App.css';

const VIEWS = { EDITOR: 'editor', PREVIEW: 'preview' };

export default function App() {
  const revealObserverRef = useRef(null);
  const uploadSectionRef = useRef(null);
  const videoRef = useRef(null);
  const fileInputRef = useRef(null);

  const [view, setView] = useState(VIEWS.EDITOR);
  const [localUrl, setLocalUrl] = useState(null);
  const [fileName, setFileName] = useState('');
  const [duration, setDuration] = useState(null);
  const [currentTime, setCurrentTime] = useState(0);

  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [publicId, setPublicId] = useState(null);

  const [clips, setClips] = useState([]);
  const [draft, setDraft] = useState(null);
  const [selectedClipId, setSelectedClipId] = useState(null);
  const [status, setStatus] = useState({ type: 'info', message: '' });

  const apiBaseHint = useMemo(() => import.meta.env.VITE_API_URL ?? '', []);

  useEffect(() => {
    return () => {
      if (localUrl) URL.revokeObjectURL(localUrl);
    };
  }, [localUrl]);

  useEffect(() => {
    const targets = Array.from(document.querySelectorAll('[data-reveal]'));
    if (targets.length === 0) return;

    revealObserverRef.current?.disconnect();

    const obs = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            obs.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.18, rootMargin: '0px 0px -8% 0px' }
    );

    for (const t of targets) obs.observe(t);
    revealObserverRef.current = obs;
    return () => obs.disconnect();
  }, [view, localUrl]);

  const setError = (message) => setStatus({ type: 'error', message });
  const setInfo = (message) => setStatus({ type: 'info', message });
  const setWarn = (message) => setStatus({ type: 'warn', message });

  const resetSession = useCallback(() => {
    setClips([]);
    setDraft(null);
    setSelectedClipId(null);
    setPublicId(null);
    setDuration(null);
    setCurrentTime(0);
    setUploadProgress(0);
    setView(VIEWS.EDITOR);
    setStatus({ type: 'info', message: '' });
  }, []);

  const handleFile = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('video/')) {
      setError('Please choose a video file.');
      return;
    }

    resetSession();
    if (localUrl) URL.revokeObjectURL(localUrl);

    const url = URL.createObjectURL(file);
    setLocalUrl(url);
    setFileName(file.name);

    setUploading(true);
    setUploadProgress(10);
    setInfo('Uploading match footage to Cloudinary…');

    const formData = new FormData();
    formData.append('video', file);

    try {
      const xhr = new XMLHttpRequest();
      const result = await new Promise((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            setUploadProgress(10 + Math.round((e.loaded / e.total) * 80));
          }
        });
        xhr.addEventListener('load', () => {
          try {
            const body = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300) resolve(body);
            else reject(new Error(body.error || 'Upload failed'));
          } catch {
            reject(new Error('Invalid server response'));
          }
        });
        xhr.addEventListener('error', () =>
          reject(new Error('Network error during upload'))
        );
        xhr.open('POST', apiUrl('/api/upload'));
        xhr.send(formData);
      });

      setPublicId(result.publicId);
      if (result.duration) setDuration(result.duration);
      setUploadProgress(100);
      setInfo('Video uploaded. Mark highlights and drag the timeline handles.');
    } catch (err) {
      setError(err.message || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const onVideoLoaded = () => {
    const v = videoRef.current;
    if (v && Number.isFinite(v.duration)) {
      setDuration(v.duration);
    }
  };

  const onTimeUpdate = () => {
    const v = videoRef.current;
    if (v) setCurrentTime(v.currentTime);
  };

  const activeRange = draft ?? clips.find((c) => c.id === selectedClipId);

  const beginDraftAtPlayhead = () => {
    const v = videoRef.current;
    if (!v || duration == null) return;

    const mark = v.currentTime;
    const { start, end } = defaultClipRange(mark, duration);
    setDraft(
      normalizeClip(
        {
          id: createClipId(),
          tag: 'Six',
          customLabel: '',
          start,
          end,
        },
        duration
      )
    );
    setSelectedClipId(null);
    setInfo('Drag the timeline handles, pick a tag, then add the clip.');
  };

  const updateActiveRange = ({ start, end }) => {
    if (draft) {
      setDraft((d) => normalizeClip({ ...d, start, end }, duration));
    } else if (selectedClipId) {
      setClips((prev) =>
        prev.map((c) =>
          c.id === selectedClipId
            ? normalizeClip({ ...c, start, end }, duration)
            : c
        )
      );
    }
  };

  const updateActiveTag = (patch) => {
    if (draft) {
      setDraft((d) => ({ ...d, ...patch }));
    } else if (selectedClipId) {
      setClips((prev) =>
        prev.map((c) => (c.id === selectedClipId ? { ...c, ...patch } : c))
      );
    }
  };

  const saveDraft = () => {
    if (!draft) return;
    const normalized = normalizeClip(draft, duration);
    setClips((prev) => [...prev, normalized]);
    setDraft(null);
    setSelectedClipId(normalized.id);
    setInfo('Clip added. Mark another highlight or open preview.');
  };

  const cancelDraft = () => {
    setDraft(null);
    setInfo('');
  };

  const selectClip = (id) => {
    setDraft(null);
    setSelectedClipId(id);
    const clip = clips.find((c) => c.id === id);
    if (clip && videoRef.current) {
      videoRef.current.currentTime = clip.start;
    }
  };

  const removeClip = (id) => {
    setClips((prev) => prev.filter((c) => c.id !== id));
    if (selectedClipId === id) setSelectedClipId(null);
  };

  const handleAIHighlights = (highlights) => {
    if (!highlights || highlights.length === 0) {
      setWarn('No matching moments found. Try a different description.');
      return;
    }

    const newClips = highlights.map((h) => {
      const tag = h.tag || 'Custom';
      return normalizeClip(
        {
          id: createClipId(),
          tag,
          customLabel: h.description || '',
          start: h.startTime,
          end: h.endTime,
        },
        duration
      );
    });

    setClips((prev) => [...prev, ...newClips]);
    setInfo(`AI detected ${newClips.length} highlight${newClips.length !== 1 ? 's' : ''}. Review and adjust as needed.`);
  };

  const handleReorder = (from, to) => {
    setClips((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const handleSeek = (t) => {
    if (videoRef.current) {
      videoRef.current.currentTime = t;
      setCurrentTime(t);
    }
  };

  const goToPreview = () => {
    if (clips.length === 0) {
      setError('Add at least one highlight clip first.');
      return;
    }
    if (draft) {
      setWarn('Save or cancel the current draft clip before previewing.');
      return;
    }
    setView(VIEWS.PREVIEW);
    setInfo('');
  };

  const scrollToUpload = () => {
    uploadSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (view === VIEWS.PREVIEW && localUrl) {
    return (
      <div className="app app--immersive">
        <ThreeBackground />
        <div className="bg-overlay" aria-hidden />
        <header className="header header--compact header--floating">
          <div className="topbar">
            <h1 className="logo">
              <img className="logo-img" src="/logo.png" alt="CricCut logo" />
              CricCut
            </h1>
            <button type="button" className="pill" onClick={scrollToUpload}>
              Upload
            </button>
          </div>
        </header>
        {status.message && (
          <div className={`status-bar ${status.type}`} role="status">
            {status.message}
          </div>
        )}
        <PreviewScreen
          localUrl={localUrl}
          duration={duration}
          publicId={publicId}
          initialClips={clips}
          onBack={() => setView(VIEWS.EDITOR)}
          onClipsChange={setClips}
          setStatus={setStatus}
        />
      </div>
    );
  }

  return (
    <div className="app app--immersive">
      <ThreeBackground />
      <div className="bg-overlay" aria-hidden />

      <header className="header header--floating">
        <div className="topbar">
          <h1 className="logo">
            <img className="logo-img" src="/logo.png" alt="CricCut logo" />
            CricCut
          </h1>
          <div className="topbar-actions">
            <button type="button" className="pill" onClick={scrollToUpload}>
              Get Started
            </button>
          </div>
        </div>
      </header>

      <main className="page">
        <section className="hero">
          <div className="hero-inner">
            <div className="hero-badge" data-reveal>
              Premium highlight engine
            </div>
            <div className="hero-brand" data-reveal>
              <img
                className="hero-logo"
                src="/logo.png"
                alt="CricCut"
                width={140}
                height={140}
              />
            </div>
            <h2 className="hero-title" data-reveal>
              <span className="hero-title-glow">Every six deserves a replay</span>
            </h2>
            <p className="hero-subtitle" data-reveal>
              Cut, tag, reorder, and export cricket highlights with a cinematic feel.
              Built for mobile. Powered by Cloudinary.
            </p>

            <div className="hero-cta" data-reveal>
              <button type="button" className="cta" onClick={scrollToUpload}>
                Get Started
                <span className="cta-pulse" aria-hidden />
              </button>
              <a className="cta-secondary" href="#upload">
                Learn more
              </a>
            </div>
          </div>
        </section>

      {!localUrl && (
        <>
          <section className="features">
            <div className="grid">
              <div className="feature" data-reveal>
                <div className="feature-kicker">Trim</div>
                <div className="feature-title">Drag precise in/out points</div>
                <div className="feature-body">
                  Mark a moment, then drag the handles for frame-tight cuts.
                </div>
              </div>
              <div className="feature" data-reveal>
                <div className="feature-kicker">Tag</div>
                <div className="feature-title">Six · Wicket · Catch</div>
                <div className="feature-body">
                  Label the hype instantly, or add a custom callout.
                </div>
              </div>
              <div className="feature" data-reveal>
                <div className="feature-kicker">Export</div>
                <div className="feature-title">Clips or a stitched reel</div>
                <div className="feature-body">
                  Reorder like a pro edit—then download with one click.
                </div>
              </div>
            </div>
          </section>

          <section
            ref={uploadSectionRef}
            id="upload"
            className="card glass"
            data-reveal
          >
            <h2 className="card-title">Upload match video</h2>
            <div className="upload-zone upload-zone--glass">
              <input
                ref={fileInputRef}
                id="video-upload"
                type="file"
                accept="video/*"
                onChange={(e) => handleFile(e.target.files?.[0])}
              />
              <label className="upload-label upload-label--glass" htmlFor="video-upload">
                Choose video
              </label>
              <p className="upload-hint">
                MP4, MOV, WebM — up to 500 MB. Runs smoothly on mobile.
              </p>
              {!!apiBaseHint && (
                <p className="upload-hint upload-hint--subtle">
                  API: {apiBaseHint}
                </p>
              )}
            </div>
          </section>
        </>
      )}

      {status.message && (
        <div className={`status-bar ${status.type}`} role="status">
          {status.message}
        </div>
      )}

      {uploading && (
        <div className="card">
          <p style={{ margin: 0, fontSize: '0.9rem' }}>
            Uploading… {uploadProgress}%
          </p>
          <div className="progress-track">
            <div
              className="progress-fill"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {localUrl && (
        <>
          <section className="card" id="upload" ref={uploadSectionRef}>
            <h2 className="card-title">{fileName || 'Match video'}</h2>
            <div className="player-wrap">
              <video
                ref={videoRef}
                src={localUrl}
                controls
                playsInline
                preload="metadata"
                onLoadedMetadata={onVideoLoaded}
                onTimeUpdate={onTimeUpdate}
              />
            </div>

            {duration != null && (
              <Timeline
                duration={duration}
                currentTime={currentTime}
                start={activeRange?.start ?? currentTime}
                end={
                  activeRange?.end ??
                  Math.min(duration, currentTime + 10)
                }
                onChange={activeRange ? updateActiveRange : undefined}
                onSeek={handleSeek}
                showRange={Boolean(activeRange)}
                label={
                  activeRange
                    ? 'Clip range — drag handles'
                    : 'Timeline — tap Mark highlight to set a range'
                }
              />
            )}

            <div className="player-controls">
              <button
                type="button"
                className="btn btn-primary"
                onClick={beginDraftAtPlayhead}
                disabled={uploading || duration == null}
              >
                Mark highlight
              </button>
              {draft && (
                <>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={saveDraft}
                  >
                    Add clip
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={cancelDraft}
                  >
                    Cancel
                  </button>
                </>
              )}
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => fileInputRef.current?.click()}
              >
                Change video
              </button>
              <span className="time-display">
                {formatTime(currentTime)}
                {duration != null ? ` / ${formatTime(duration)}` : ''}
              </span>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              hidden
              onChange={(e) => handleFile(e.target.files?.[0])}
            />

            {duration != null && (
              <section className="card">
                <AIAnalysis
                  videoUrl={publicId ? `https://res.cloudinary.com/criccut/video/upload/${publicId}.mp4` : null}
                  onHighlightsDetected={handleAIHighlights}
                  isLoading={uploading}
                />
              </section>
            )}

            {(draft || selectedClipId) && activeRange && (
              <div className="clip-editor-panel">
                <TagSelector
                  tag={activeRange.tag}
                  customLabel={activeRange.customLabel || ''}
                  onTagChange={(tag) => updateActiveTag({ tag })}
                  onCustomLabelChange={(customLabel) =>
                    updateActiveTag({ customLabel })
                  }
                />
              </div>
            )}
          </section>

          <section className="card">
            <h2 className="card-title">Highlights ({clips.length})</h2>
            <p className="upload-hint reorder-hint">
              Select a clip to edit on the timeline. Drag to reorder.
            </p>
            <ClipList
              clips={clips}
              selectedId={selectedClipId}
              onSelect={selectClip}
              onRemove={removeClip}
              onReorder={handleReorder}
            />
          </section>

          <section className="card actions-footer">
            <button
              type="button"
              className="btn-reel"
              onClick={goToPreview}
              disabled={clips.length === 0 || uploading || Boolean(draft)}
            >
              Preview &amp; export
            </button>
          </section>
        </>
      )}
      </main>
    </div>
  );
}
