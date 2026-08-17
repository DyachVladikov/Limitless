ALTER TABLE tasks ADD COLUMN is_priority BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE tasks SET is_priority = TRUE WHERE title IN ('Силовая тренировка', 'Тренировка по волейболу');
