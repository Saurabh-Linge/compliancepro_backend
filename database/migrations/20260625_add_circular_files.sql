CREATE TABLE IF NOT EXISTS circular_file (
  id SERIAL PRIMARY KEY,
  circular_id INTEGER REFERENCES circular(id) ON DELETE CASCADE,
  file_name VARCHAR(500) NOT NULL,
  file_url VARCHAR(500) NOT NULL,
  mime_type VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_circular_file_circular_id ON circular_file(circular_id);
