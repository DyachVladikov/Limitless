CREATE TABLE daily_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,

  carbs_level INTEGER DEFAULT 0 CHECK (carbs_level BETWEEN 0 AND 100),
  protein_level INTEGER DEFAULT 0 CHECK (protein_level BETWEEN 0 AND 100),
  fatigue_level INTEGER DEFAULT 0 CHECK (fatigue_level BETWEEN 0 AND 100),

  is_sugar_eaten BOOLEAN DEFAULT FALSE,

  UNIQUE(user_id, log_date)
);
