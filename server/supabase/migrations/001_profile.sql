CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE CHECK (char_length(username) >= 3),
  avatar_url TEXT,
  title TEXT DEFAULT 'Игрок',

  rank TEXT DEFAULT 'E' CHECK (rank IN ('E', 'D', 'C', 'B', 'A', 'S', 'S+', 'SS', 'SSS')),
  current_level INTEGER DEFAULT 1 CHECK (current_level >= 1),
  current_exp INTEGER DEFAULT 0 CHECK (current_exp >= 0),
  total_exp INTEGER DEFAULT 0 CHECK (total_exp >= 0),

  stat_intelligence INTEGER DEFAULT 10 CHECK (stat_intelligence >= 0),
  stat_strength INTEGER DEFAULT 10 CHECK (stat_strength >= 0),
  stat_rationality INTEGER DEFAULT 10 CHECK (stat_rationality >= 0),
  stat_ego INTEGER DEFAULT 10 CHECK (stat_ego >= 0),
  stat_discipline INTEGER DEFAULT 10 CHECK (stat_discipline >= 0),
  stat_energy INTEGER DEFAULT 10 CHECK (stat_energy >= 0),

  streak INTEGER DEFAULT 0 CHECK (streak >= 0),
  last_active_date DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
