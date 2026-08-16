ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE quest_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE quest_completions ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE academy_labs ENABLE ROW LEVEL SECURITY;
ALTER TABLE pet_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE mental_laws ENABLE ROW LEVEL SECURITY;
ALTER TABLE rationality_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE coach_dialogues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Пользователь видит свой профиль"
  ON profiles FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Пользователь создает свой профиль"
  ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

CREATE POLICY "Пользователь обновляет свой профиль"
  ON profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Шаблоны квестов видны всем"
  ON quest_templates FOR SELECT USING (true);

CREATE POLICY "Пользователь управляет своими выполненными квестами"
  ON quest_completions FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Пользователь управляет своими логами"
  ON daily_logs FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Пользователь управляет своими курсами"
  ON academy_courses FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Пользователь управляет своими лабораторными"
  ON academy_labs FOR ALL
  USING (EXISTS (
    SELECT 1 FROM academy_courses
    WHERE academy_courses.id = academy_labs.course_id
      AND academy_courses.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM academy_courses
    WHERE academy_courses.id = academy_labs.course_id
      AND academy_courses.user_id = auth.uid()
  ));

CREATE POLICY "Пользователь управляет своими проектами"
  ON pet_projects FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Пользователь управляет своими законами"
  ON mental_laws FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Пользователь управляет своими книгами"
  ON rationality_books FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Диалоги коучей видны всем"
  ON coach_dialogues FOR SELECT USING (true);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || LEFT(NEW.id::text, 8))
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
