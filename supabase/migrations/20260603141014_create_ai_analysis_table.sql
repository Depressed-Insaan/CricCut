/*
  # Create AI Analysis Results Table

  1. New Tables
    - `ai_analysis_results`
      - `id` (uuid, primary key)
      - `video_url` (text, the Cloudinary video URL)
      - `user_prompt` (text, what the user asked for - "sixes", "wickets", etc)
      - `highlights` (jsonb array of detected moments with timestamps and confidence)
      - `processing_status` (text - pending, completed, failed)
      - `created_at` (timestamp)
      - `expires_at` (timestamp - cache for 7 days)

  2. Security
    - Enable RLS on `ai_analysis_results` table
    - Public read access for analysis results (no auth needed for processing)

  3. Indexes
    - Index on video_url + user_prompt for fast lookups
*/

CREATE TABLE IF NOT EXISTS ai_analysis_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  video_url text NOT NULL,
  user_prompt text NOT NULL,
  highlights jsonb DEFAULT '[]'::jsonb,
  processing_status text DEFAULT 'pending' CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  error_message text,
  created_at timestamptz DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '7 days'),
  UNIQUE(video_url, user_prompt)
);

ALTER TABLE ai_analysis_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read of analysis results"
  ON ai_analysis_results FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Allow public insert for analysis requests"
  ON ai_analysis_results FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Allow public update of analysis status"
  ON ai_analysis_results FOR UPDATE
  TO public
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_video_prompt ON ai_analysis_results(video_url, user_prompt);
CREATE INDEX IF NOT EXISTS idx_status ON ai_analysis_results(processing_status);
