-- SCEDULAR keeps its data as ONE versioned JSON document (see storage.ts); these are the only two tables.
-- They are created automatically on the first request, so this file is documentation.
CREATE TABLE IF NOT EXISTS app_state (
  id INTEGER PRIMARY KEY,
  version INTEGER NOT NULL,
  state JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS faculty_photos (
  faculty_id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
