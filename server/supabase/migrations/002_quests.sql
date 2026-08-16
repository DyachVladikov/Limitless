CREATE TABLE quest_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (category IN ('fitness', 'academy', 'rationality')),
  title TEXT NOT NULL,
  base_exp INTEGER DEFAULT 50 CHECK (base_exp >= 0),
  coach_type TEXT NOT NULL CHECK (coach_type IN ('Jin_Woo', 'L', 'Soma', 'Ayanokoji')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE quest_completions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  quest_id UUID NOT NULL REFERENCES quest_templates(id) ON DELETE CASCADE,
  target_date DATE NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE(user_id, quest_id, target_date)
);

CREATE INDEX idx_quest_completions_quest ON quest_completions(quest_id);
