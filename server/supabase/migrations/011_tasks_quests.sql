CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'star',
  exp INTEGER NOT NULL DEFAULT 50 CHECK (exp > 0),
  category TEXT NOT NULL CHECK (category IN ('study', 'sport', 'health', 'work', 'rationality')),
  days_of_week INTEGER[] CHECK (days_of_week <@ ARRAY[1, 2, 3, 4, 5, 6, 7]),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE quests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'star',
  exp INTEGER NOT NULL DEFAULT 250 CHECK (exp > 0),
  target_count INTEGER NOT NULL DEFAULT 1 CHECK (target_count >= 1),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE daily_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  task_date DATE NOT NULL DEFAULT CURRENT_DATE,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMP WITH TIME ZONE,

  UNIQUE(user_id, task_id, task_date)
);

CREATE TABLE user_quest_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  quest_id UUID NOT NULL REFERENCES quests(id) ON DELETE CASCADE,
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress >= 0),
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMP WITH TIME ZONE,

  UNIQUE(user_id, quest_id)
);

CREATE TABLE focus_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  minutes INTEGER NOT NULL CHECK (minutes > 0),
  session_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_daily_tasks_user_date ON daily_tasks(user_id, task_date);
CREATE INDEX idx_user_quest_progress_user ON user_quest_progress(user_id);
CREATE INDEX idx_focus_sessions_user_date ON focus_sessions(user_id, session_date);

ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_quest_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE focus_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all" ON tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON quests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON daily_tasks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON user_quest_progress FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON focus_sessions FOR ALL USING (true) WITH CHECK (true);

INSERT INTO tasks (title, description, icon, exp, category, days_of_week) VALUES
  ('Силовая тренировка', 'Работа с железом в зале. Прогрессия весов.', 'dumbbell', 150, 'sport', ARRAY[1, 3, 5]),
  ('Тренировка по волейболу', 'Командная игра, кардио и реакция.', 'volleyball', 120, 'sport', ARRAY[2, 4, 6]),
  ('Растяжка / Мобильность', '15 минут растяжки для восстановления.', 'activity', 50, 'sport', ARRAY[1, 2, 3, 4, 5, 6, 7]),
  ('Сделать лабу', 'Выполнить лабораторную без глупых ошибок.', 'microscope', 200, 'study', ARRAY[1, 2, 3, 4, 5, 6, 7]),
  ('Конспект лекции', 'Законспектировать пройденный материал.', 'pen-tool', 100, 'study', ARRAY[1, 2, 3, 4, 5]),
  ('Пописать код', 'Глубокая работа над пет-проектом или рабочими тасками.', 'code', 150, 'work', ARRAY[1, 2, 3, 4, 5, 6, 7]),
  ('Обучающее видео', 'Посмотреть туториал по архитектуре / фронтенду.', 'youtube', 80, 'work', ARRAY[1, 2, 3, 4, 5, 6, 7]),
  ('Алгоритм (LeetCode)', 'Решить 1 задачу на логику и алгоритмы.', 'terminal', 100, 'work', ARRAY[1, 2, 3, 4, 5, 6, 7]),
  ('8 часов сна', 'Полноценное восстановление ЦНС.', 'moon', 100, 'health', ARRAY[1, 2, 3, 4, 5, 6, 7]),
  ('Отбой до 00:00', 'Режим Джин Ву: лечь спать вовремя.', 'clock', 100, 'health', ARRAY[1, 2, 3, 4, 5, 6, 7]),
  ('2 литра воды', 'Поддержание гидратации.', 'droplets', 50, 'health', ARRAY[1, 2, 3, 4, 5, 6, 7]),
  ('Закрыть норму белка', 'Строительный материал для мышц.', 'drumstick', 100, 'health', ARRAY[1, 2, 3, 4, 5, 6, 7]),
  ('Здоровая еда', 'Приготовить чистый прием пищи без фастфуда.', 'chef-hat', 80, 'health', ARRAY[1, 2, 3, 4, 5, 6, 7]),
  ('Прогулка', '30 минут на свежем воздухе для очистки мыслей.', 'footprints', 70, 'health', ARRAY[1, 2, 3, 4, 5, 6, 7]),
  ('Почитать книгу', 'Чтение развивающей литературы.', 'book-open', 50, 'rationality', ARRAY[1, 2, 3, 4, 5, 6, 7]),
  ('Беседа с ИИ', 'Спарринг с нейросетью: брейншторм или разбор концепции.', 'cpu', 80, 'rationality', ARRAY[1, 2, 3, 4, 5, 6, 7]),
  ('Шахматы', 'Сыграть осмысленную партию и сделать анализ.', 'castle', 100, 'rationality', ARRAY[1, 2, 3, 4, 5, 6, 7]),
  ('Почитать мангу', 'Восстановление ресурса мозга через искусство.', 'image', 50, 'rationality', ARRAY[6, 7]);

INSERT INTO quests (title, description, icon, exp, target_count) VALUES
  ('Daily Conqueror', 'Выполни все ежедневные задачи 7 дней', 'flame', 250, 7),
  ('Focus Master', 'Накопи 10 часов фокуса', 'target', 500, 10),
  ('Unstoppable Streak', 'Держи стрик 30 дней', 'zap', 1000, 30),
  ('Bookworm', 'Прочитай 5 книг', 'book', 500, 5),
  ('Iron Body', 'Проведи 20 тренировок', 'dumbbell', 600, 20),
  ('Early Bird', 'Встань до 6:00 семь дней подряд', 'sunrise', 350, 7),
  ('Sugar Free', '14 дней без сахара', 'shield', 400, 14),
  ('Marathon Mind', '10 учебных сессий по 2 часа', 'brain', 700, 10),
  ('Deep Worker', '15 сессий глубокой работы', 'briefcase', 600, 15),
  ('Hydrated', 'Пей 2 литра воды 10 дней', 'droplets', 200, 10),
  ('Sleep Walker', 'Ложись до 23:00 десять дней', 'moon', 300, 10),
  ('Step by Step', '10 дней по 10 000 шагов', 'footprints', 350, 10),
  ('Cold Blood', '10 холодных душей', 'snowflake', 300, 10),
  ('Monk Mode', '7 дней без соцсетей', 'eye-off', 500, 7),
  ('Knowledge Base', 'Конспекты 20 глав', 'book-open', 450, 20),
  ('Project Zenith', 'Доведи проект до релиза', 'rocket', 1000, 1),
  ('Bug Hunter', 'Пофиксить 25 багов', 'bug', 500, 25),
  ('Commit Streak', 'Коммитить 14 дней подряд', 'git-branch', 400, 14),
  ('Polyglot', 'Выучить 500 новых слов', 'languages', 600, 500),
  ('Meditation Flow', '30 сессий медитации', 'sparkles', 450, 30),
  ('Strength Ascendant', 'Выполни 100 рабочих подходов', 'swords', 700, 100),
  ('Planner', 'Планируй день 20 раз', 'calendar', 300, 20),
  ('Zero Inbox', 'Разобрать входящие 10 раз', 'mail', 200, 10),
  ('Night Owl Rehab', '14 дней сна по 8 часов', 'bed', 400, 14),
  ('Chef', 'Приготовить 20 здоровых приемов пищи', 'chef-hat', 350, 20),
  ('Readers Path', '500 страниц суммарно', 'library', 500, 500),
  ('Code Samurai', '30 часов практики кода', 'sword', 800, 30),
  ('Consistency', 'Минимум 3 задачи в день 10 дней', 'list-checks', 350, 10),
  ('Morning Ritual', 'Зарядка 15 дней', 'sun', 300, 15),
  ('Focus Fortress', '25 часов работы без телефона', 'hourglass', 550, 25),
  ('Analyzer', '10 разборов своих решений', 'search', 300, 10),
  ('Gratitude', '14 дней практики благодарности', 'heart', 250, 14),
  ('Stoic', '10 сессий стоической практики', 'anchor', 300, 10),
  ('Time Lord', 'Тайм-блокинг 20 дней', 'timer', 400, 20),
  ('Minimalist', '10 дней без импульсивных покупок', 'wallet', 250, 10),
  ('Teacher', 'Объяснить 10 тем другому человеку', 'mic', 350, 10),
  ('Card Master', '500 повторений карточек', 'layers', 300, 500),
  ('Lecture Hall', '15 лекций с конспектом', 'graduation-cap', 450, 15),
  ('Test Runner', 'Пройти 20 тестов по темам', 'file-check', 350, 20),
  ('Walker', '30 прогулок по 30 минут', 'map-pin', 300, 30),
  ('Eye Care', '10 дней перерывов для глаз', 'eye', 200, 10),
  ('Protein Power', '15 дней с нормой белка', 'utensils', 350, 15),
  ('Vitamin Vault', '30 дней витаминов по плану', 'pill', 200, 30),
  ('Screenless Evening', '10 вечеров без экранов', 'monitor-off', 300, 10),
  ('Summit', 'Достигни 50-го уровня', 'mountain', 2000, 50),
  ('Rank Ascent', 'Достигни ранга A', 'crown', 1500, 1),
  ('Legend', 'Достигни ранга S', 'gem', 3000, 1),
  ('Task Machine', 'Выполни 100 задач', 'circle-check', 800, 100),
  ('Quest Hunter', 'Выполни 10 квестов', 'trophy', 1000, 10),
  ('Half Century', 'Выполни 50 задач', 'medal', 400, 50),
  ('Король площадки', 'Посети 50 тренировок по волейболу', 'volleyball', 1500, 50),
  ('Железное правило', 'Проведи 50 силовых тренировок', 'dumbbell', 1500, 50),
  ('Закрытая сессия', 'Успешно сдай 20 лабораторных работ', 'microscope', 1200, 20),
  ('Машина кода', 'Напиши код 50 раз', 'code', 1500, 50),
  ('Спартанский режим', 'Ляг спать до 00:00 30 раз', 'clock', 1000, 30),
  ('Синтез белка', 'Закрой норму белка 30 дней', 'drumstick', 800, 30),
  ('Гроссмейстер', 'Сыграй 50 партий в шахматы', 'trophy', 1200, 50),
  ('Библиотекарь', 'Прочитай 1000 страниц', 'book-open', 2000, 1000),
  ('Симбиоз с ИИ', 'Проведи 30 продуктивных бесед с ИИ', 'cpu', 800, 30);
