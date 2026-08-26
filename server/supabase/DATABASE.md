# База данных — все сущности

Актуальное состояние БД после миграций 001–012. RLS везде включён с политикой `allow_all` (проект соло, без авторизации).

Обозначения типов: `uuid` — строка вида `"f280cf10-..."`, `timestamptz` — ISO-строка `"2026-08-19T10:00:00.000Z"`, `date` — `"2026-08-19"`, `int[]` — массив чисел.

---

## Активные таблицы

### profiles — твой профиль (всегда 1 строка)

| Поле | Тип | Зачем |
|---|---|---|
| id | uuid, PK | id профиля |
| username | text, unique, ≥3 симв. | Ник |
| avatar_url | text, null | Ссылка на аватар |
| title | text, дефолт `'Игрок'` | Титул под ником |
| rank | text | Ранг: `E D C B A S S+ SS SSS` |
| current_level | int, ≥1 | Текущий уровень |
| current_exp | int, ≥0 | Опыт внутри уровня (сброс при level up) |
| total_exp | int, ≥0 | Весь заработанный опыт за всё время |
| stat_intelligence | int, ≥0 | Стата радара (study-задачи) |
| stat_strength | int, ≥0 | Стата радара (sport-задачи) |
| stat_rationality | int, ≥0 | Стата радара (rationality-задачи) |
| stat_ego | int, ≥0 | Стата радара (+1 за выполненный квест) |
| stat_discipline | int, ≥0 | Стата радара (work-задачи) |
| stat_energy | int, ≥0 | Стата радара (health-задачи) |
| streak | int, ≥0 | Дней подряд с активностью |
| last_active_date | date | Для подсчёта стрика |
| created_at / updated_at | timestamptz | Системные |

Апдейт exp/уровня/статов делает сервер при выполнении задач и квестов.

### tasks — пул задач (18 строк)

| Поле | Тип | Зачем |
|---|---|---|
| id | uuid, PK | |
| title | text | Название задачи |
| description | text, дефолт `''` | Подсказка/подробности |
| icon | text, дефолт `'star'` | Имя lucide-иконки (`dumbbell`, `book-open`...) |
| exp | int, >0 | Сколько опыта за выполнение |
| category | text | `study / sport / health / work / rationality` — определяет, какая стата растёт |
| days_of_week | int[], null | Дни недели: 1=Пн … 7=Вс. `NULL` = рандомный пул, может выпасть в любой день |
| is_priority | bool, дефолт `false` | `true` = гарантированно в выдаче в свой день (силовая, волейбол) |
| created_at | timestamptz | |

### daily_tasks — задачи, выпавшие на конкретный день

| Поле | Тип | Зачем |
|---|---|---|
| id | uuid, PK | Этот id шлёшь в PATCH при чеке задачи |
| user_id | uuid, FK → profiles | Чья задача |
| task_id | uuid, FK → tasks | Какая задача из пула |
| task_date | date, дефолт сегодня | На какой день выпала |
| is_completed | bool, дефолт `false` | Выполнена ли |
| completed_at | timestamptz, null | Когда выполнена |

`UNIQUE(user_id, task_id, task_date)` — одна задача раз в день. Заполняется автоматически при первом `GET /api/tasks/today` за день (5 штук: приоритетные по расписанию + рандом).

### quests — пул квестов (59 строк)

| Поле | Тип | Зачем |
|---|---|---|
| id | uuid, PK | |
| title | text | Название квеста |
| description | text, дефолт `''` | Условие выполнения |
| icon | text, дефолт `'star'` | Имя lucide-иконки |
| exp | int, >0 | Награда за выполнение |
| target_count | int, ≥1 | Сколько единиц прогресса нужно (1 = разовый квест) |
| created_at | timestamptz | |

### user_quest_progress — прогресс по квестам

| Поле | Тип | Зачем |
|---|---|---|
| id | uuid, PK | |
| user_id | uuid, FK → profiles | |
| quest_id | uuid, FK → quests | |
| progress | int, ≥0 | Текущий прогресс (сравнивай с target_count квеста) |
| is_completed | bool, дефолт `false` | Квест закрыт |
| completed_at | timestamptz, null | Когда закрыт |

`UNIQUE(user_id, quest_id)` — одна строка на квест. Создаётся при первом `PATCH /api/quests/:id/progress`.

### focus_sessions — записи фокус-времени

| Поле | Тип | Зачем |
|---|---|---|
| id | uuid, PK | |
| user_id | uuid, FK → profiles | |
| minutes | int, >0 | Длительность сессии в минутах |
| session_date | date, дефолт сегодня | За какой день засчитана |
| created_at | timestamptz | |

Из суммы `minutes` за неделю считается «Focus Time» в `/api/stats/summary`.

---

## Неактивные таблицы (легаси, сервером не используются)

Остались от старых механик. Можно дропнуть отдельной миграцией, когда решишь.

### quest_templates, quest_completions — старая коуч-система квестов
`quest_templates`: id, category (`fitness/academy/rationality`), title, base_exp, coach_type, created_at. 7 строк.
`quest_completions`: id, user_id, quest_id → quest_templates, target_date, completed_at.

### daily_logs — дневник питания/усталости
id, user_id, log_date, carbs_level / protein_level / fatigue_level (0–100), is_sugar_eaten. `UNIQUE(user_id, log_date)`.

### academy_courses, academy_labs — учёба
`academy_courses`: id, user_id, title, exam_date, created_at.
`academy_labs`: id, course_id → academy_courses, title, check_variant / check_graphs / check_matrix / check_screenshots (bool), is_completed, deadline, completed_at.

### pet_projects — пет-проекты
id, user_id, title, stack (text[]), status (`design / logic / deployed`), created_at.

### rationality_books — книги
id, user_id, title, total_pages, read_pages, is_finished.

### mental_laws — ментальные законы
id, user_id, title, description, unlocked_at.

### coach_dialogues — реплики коучей
id, coach_name (`Jin_Woo / L / Soma / Ayanokoji`), dialogue_text, tags (text[]), weight, created_at. 8 строк.

---

## Карта «эндпоинт → таблицы»

| Эндпоинт | Таблицы |
|---|---|
| `GET/PATCH /api/user` | profiles |
| `GET /api/tasks/today` | daily_tasks + tasks |
| `PATCH /api/tasks/today/:id` | daily_tasks → tasks, profiles |
| `GET /api/quests` (`?limit=3` — топ по близости к завершению) | quests + user_quest_progress |
| `PATCH /api/quests/:id/progress` | user_quest_progress → quests, profiles |
| `GET /api/stats/summary` | daily_tasks, user_quest_progress, focus_sessions |
| `POST /api/focus` | focus_sessions |
| `GET /api/coaches` | coach_dialogues |
