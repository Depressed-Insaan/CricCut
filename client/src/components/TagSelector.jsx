import { TAGS } from '../constants.js';

export default function TagSelector({ tag, customLabel, onTagChange, onCustomLabelChange }) {
  return (
    <div className="tag-selector">
      <span className="tag-selector-label">Tag</span>
      <div className="tag-pills" role="group" aria-label="Highlight tag">
        {TAGS.map((t) => (
          <button
            key={t}
            type="button"
            className={`tag-pill ${tag === t ? 'tag-pill--active' : ''}`}
            onClick={() => onTagChange(t)}
          >
            {t}
          </button>
        ))}
      </div>
      {tag === 'Custom' && (
        <input
          type="text"
          className="tag-custom-input"
          placeholder="Custom label (e.g. Run out)"
          value={customLabel}
          onChange={(e) => onCustomLabelChange(e.target.value)}
          maxLength={40}
        />
      )}
    </div>
  );
}
