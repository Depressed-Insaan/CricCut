import { useState } from 'react';
import './AIAnalysis.css';

export default function AIAnalysis({ videoUrl, onHighlightsDetected, isLoading: parentIsLoading }) {
  const [userPrompt, setUserPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const suggestions = [
    'Show me sixes',
    'Show me wickets',
    'Show me boundaries',
    'Show me fours',
    'Show me good catches',
  ];

  const notReady = !videoUrl;
  const busy = isLoading || parentIsLoading;

  const handleAnalyze = async () => {
    if (!userPrompt.trim() || !videoUrl) return;

    setIsLoading(true);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-cricket-video`;
      console.log('Calling API:', apiUrl);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          videoUrl,
          userPrompt: userPrompt.trim(),
        }),
      });

      console.log('Response status:', response.status, response.statusText);

      if (!response.ok) {
        let errorMessage = 'Analysis failed';
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          try {
            const error = await response.json();
            errorMessage = error.message || error.error || errorMessage;
          } catch {
            errorMessage = `Server error (${response.status})`;
          }
        } else {
          const text = await response.text();
          errorMessage = `Server error (${response.status}): ${text.substring(0, 100)}`;
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      if (!data.highlights) {
        throw new Error('Invalid response from server');
      }
      onHighlightsDetected(data.highlights);
      setUserPrompt('');
    } catch (error) {
      console.error('AI Analysis error:', error);
      alert(`Error: ${error instanceof Error ? error.message : 'Analysis failed'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuggestion = (suggestion) => {
    setUserPrompt(suggestion);
  };

  return (
    <div className="ai-analysis">
      <div className="ai-header">
        <span className="ai-icon">✨</span>
        <h3>AI Highlight Detection</h3>
      </div>

      <div className="ai-input-group">
        <textarea
          className="ai-textarea"
          placeholder="What moments do you want? (e.g., 'Show me only sixes', 'Find all wickets', 'Show boundaries')"
          value={userPrompt}
          onChange={(e) => setUserPrompt(e.target.value)}
          disabled={busy || notReady}
          rows="2"
        />
        <button
          className="ai-analyze-btn"
          onClick={handleAnalyze}
          disabled={!userPrompt.trim() || busy || notReady}
        >
          {isLoading ? 'Analyzing...' : parentIsLoading ? 'Uploading...' : 'Analyze Video'}
        </button>
      </div>

      {notReady && !parentIsLoading && (
        <p className="info-text" style={{ color: 'var(--warn, #f59e0b)', marginTop: '0.5rem' }}>
          Video must finish uploading to Cloudinary before AI analysis is available.
        </p>
      )}

      {!userPrompt && !notReady && (
        <div className="ai-suggestions">
          <p className="suggestions-label">Quick suggestions:</p>
          <div className="suggestions-grid">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                className="suggestion-btn"
                onClick={() => handleSuggestion(suggestion)}
                disabled={busy || notReady}
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="ai-info">
        <p className="info-text">
          The AI will analyze your video and automatically detect matching moments. Results will be added to your timeline as clips.
        </p>
      </div>
    </div>
  );
}
