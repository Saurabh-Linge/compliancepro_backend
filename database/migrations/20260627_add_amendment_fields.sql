ALTER TABLE IF EXISTS circular
  ADD COLUMN IF NOT EXISTS circular_nature VARCHAR(50) DEFAULT 'ORIGINAL',
  ADD COLUMN IF NOT EXISTS amendment_notes TEXT;

CREATE TABLE IF NOT EXISTS circular_amendment (
  id SERIAL PRIMARY KEY,
  original_circular_id INTEGER REFERENCES circular(id) ON DELETE CASCADE,
  amendment_circular_id INTEGER REFERENCES circular(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (original_circular_id, amendment_circular_id)
);
