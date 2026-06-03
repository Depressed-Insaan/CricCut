import { useState } from 'react';
import './AIAnalysis.css';

export default function AIAnalysis({ videoUrl, onHighlightsDetected, isLoading: parentIsLoading }) {
  const [userPrompt, setUserPrompt] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([
    'Show me sixes',
    'Show me wickets',
    'Show me boundaries',
    'Show me fours',
    'Show me good catches',
  ]);

  const handleAnalyze = async () => {
    if (!userPrompt.trim() || !videoUrl) return;

    setIsLoading(true);
    try {
      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-cricket-video`;
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

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Analysis failed');
      }

      const data = await response.json();
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
          disabled={isLoading || parentIsLoading}
          rows="2"
        />
        <button
          className="ai-analyze-btn"
          onClick={handleAnalyze}
          disabled={!userPrompt.trim() || isLoading || parentIsLoading || !videoUrl}
        >
          {isLoading ? 'Analyzing...' : 'Analyze Video'}
        </button>
      </div>

      {!userPrompt && (
        <div className="ai-suggestions">
          <p className="suggestions-label">Quick suggestions:</p>
          <div className="suggestions-grid">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                className="suggestion-btn"
                onClick={() => handleSuggestion(suggestion)}
                disabled={isLoading || parentIsLoading}
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
