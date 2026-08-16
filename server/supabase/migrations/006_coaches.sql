CREATE TABLE coach_dialogues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_name TEXT NOT NULL CHECK (coach_name IN ('Jin_Woo', 'L', 'Soma', 'Ayanokoji')),
  dialogue_text TEXT NOT NULL,
  tags TEXT[] NOT NULL,
  weight INTEGER DEFAULT 10 CHECK (weight >= 0),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
