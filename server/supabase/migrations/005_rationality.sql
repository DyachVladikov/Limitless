CREATE TABLE mental_laws (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  unlocked_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_mental_laws_user ON mental_laws(user_id);

CREATE TABLE rationality_books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  total_pages INTEGER NOT NULL CHECK (total_pages > 0),
  read_pages INTEGER DEFAULT 0 CHECK (read_pages >= 0),
  is_finished BOOLEAN DEFAULT FALSE,

  CHECK (read_pages <= total_pages)
);

CREATE INDEX idx_rationality_books_user ON rationality_books(user_id);
