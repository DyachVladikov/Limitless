CREATE TABLE academy_courses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  exam_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_academy_courses_user ON academy_courses(user_id);

CREATE TABLE academy_labs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id UUID NOT NULL REFERENCES academy_courses(id) ON DELETE CASCADE,
  title TEXT NOT NULL,

  check_variant BOOLEAN DEFAULT FALSE,
  check_graphs BOOLEAN DEFAULT FALSE,
  check_matrix BOOLEAN DEFAULT FALSE,
  check_screenshots BOOLEAN DEFAULT FALSE,

  is_completed BOOLEAN DEFAULT FALSE,
  deadline DATE,
  completed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_academy_labs_course ON academy_labs(course_id);

CREATE TABLE pet_projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  stack TEXT[],
  status TEXT DEFAULT 'design' CHECK (status IN ('design', 'logic', 'deployed')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_pet_projects_user ON pet_projects(user_id);
