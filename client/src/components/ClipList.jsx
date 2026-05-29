import { clipLabel } from '../constants.js';
import { clipDuration, formatTime } from '../utils/time.js';

export default function ClipList({
  clips,
  selectedId,
  onSelect,
  onRemove,
  onReorder,
}) {
  const handleDragStart = (e, index) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e, dropIndex) => {
    e.preventDefault();
    const fromIndex = Number(e.dataTransfer.getData('text/plain'));
    if (Number.isFinite(fromIndex) && fromIndex !== dropIndex) {
      onReorder(fromIndex, dropIndex);
    }
  };

  if (clips.length === 0) {
    return (
      <p className="empty-highlights">
        Mark a moment, drag the timeline handles to set in/out points, then add
        the clip.
      </p>
    );
  }

  return (
    <ul className="highlights-list">
      {clips.map((clip, index) => (
        <li
          key={clip.id}
          className={`highlight-item ${selectedId === clip.id ? 'highlight-item--selected' : ''}`}
          draggable
          onDragStart={(e) => handleDragStart(e, index)}
          onDragOver={handleDragOver}
          onDrop={(e) => handleDrop(e, index)}
        >
          <span className="drag-handle" aria-hidden title="Drag to reorder">
            ⋮⋮
          </span>
          <button
            type="button"
            className="highlight-meta"
            onClick={() => onSelect(clip.id)}
          >
            <span className="highlight-tag">{clipLabel(clip)}</span>
            <span className="highlight-time">
              {formatTime(clip.start)} – {formatTime(clip.end)}
              <span className="highlight-dur">
                ({formatTime(clipDuration(clip))})
              </span>
            </span>
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => onRemove(clip.id)}
            aria-label={`Remove ${clipLabel(clip)} clip`}
          >
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
}
