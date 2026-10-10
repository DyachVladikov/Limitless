# Разделы API

Все пути ниже относительны `/api`; все требуют сессии владельца. Запросы изменения используют JSON camelCase. Ответы SQL проходят общий camelCase serializer; `version` — строка bigint. Ни одна ручка не создаёт стартовый контент. Каталоги блюд, материалов, задач LeetCode, ситуаций и менторов наполняются отдельно в БД.

Общие правила: UUID задаётся клиентом при POST создания и сохраняется при сетевом повторе. Повтор ID с теми же данными возвращает существующую строку, другое содержимое даёт 409. PATCH/PUT/DELETE обязаны содержать `version` изменяемой строки; устаревший запрос даёт 409 и ничего не начисляет. После изменения общий транзакционный слой запрещает отмену фактов завершённых квестов, затем пересчитывает прогресс, активность и ранг. Все действия атомарны вместе с наградами.

DELETE `/gym/programs/:id` и `/gym/exercises/:id` с `{version}` выключают запись. DELETE `/subjects/:id` и `/books/:id` с `{version}` архивируют запись; история и факты сохраняются.

## Спорт

| Метод и путь | Вход / результат |
|---|---|
| GET `/gym/programs` | Список включённых программ; `?includeDisabled=true` — также выключенные |
| POST `/gym/programs` | `{id,name,description?,isEnabled?,sortOrder?}` |
| GET `/gym/programs/:id` | Программа с `exercises` по позиции |
| PATCH `/gym/programs/:id` | `{version,name?,description?,isEnabled?,sortOrder?}`; выключение сохраняет историю |
| PUT `/gym/programs/:id/exercises` | `{version,exerciseIds:[uuid,...]}`; полная замена порядка, версия программы; пустой массив разрешён |
| GET `/gym/exercises` | Справочник, `?includeDisabled=true` |
| POST `/gym/exercises` | `{id,name,muscleGroup,equipment?,note?,isEnabled?}`; группы chest/back/legs/shoulders/arms/core/other |
| GET `/gym/exercises/:id` | Упражнение |
| PATCH `/gym/exercises/:id` | `{version,name?,muscleGroup?,equipment?,note?,isEnabled?}` |
| GET `/gym/exercises/:id/history` | Последние три результата; `limit` 1–100 и `offset` открывают остальную историю |
| GET `/workouts` | Последние три посещения; фильтр `kind=gym\|volleyball`, `limit` и `offset` |
| GET `/workouts/:id` | Посещение и `results` |
| POST `/workouts` | Зал: `{id,kind:"gym",performedOn,programId,results?:[{exerciseId,weightKg,repetitions}]}`. Волейбол: `{id,kind:"volleyball",performedOn,attended}` |
| PATCH `/workouts/:id` | `{version,performedOn?,programId?,attended?,results?}`. `results`, если задан, заменяет весь набор результатов. `kind` неизменяем |

Вес — десятичное число/строка до двух знаков, ≥0; повторения — целое >0. Дата посещения не позже текущего дня. Волейбол допускает только одну запись на дату, без программы и результатов. Для новых результатов доступны включённые упражнения выбранной программы; ранее сохранённые результаты можно исправлять после изменения программы. Снимки названий и вся история посещений сохраняются. Посещение не даёт XP и не закрывает дейлик.

## Питание

| Метод и путь | Вход / результат |
|---|---|
| GET `/dishes` | Включённые блюда с КБЖУ одной порции |
| GET `/nutrition/today` | `{gameDate,goals,entries,totals:{count,calories,protein,fat,carbs}}`; суммы рассчитываются точной десятичной арифметикой в SQL; публичный serializer возвращает JSON-числа |
| POST `/nutrition/entries` | Блюдо: `{id,gameDate,dishId,portions?}`; ручной ввод: `{id,gameDate,title,calories,protein,fat,carbs}` |
| PATCH `/nutrition/entries/:id` | `{version,gameDate,portions?}` для блюда; для ручной записи `title?,calories?,protein?,fat?,carbs?`. `dishId` меняет источник; `dishId:null` переводит в ручной ввод с четырьмя значениями |
| DELETE `/nutrition/entries/:id` | `{version,gameDate}`; tombstone до закрытия дня |

Порции >0, до трёх знаков; ручной ввод всегда имеет одну порцию. Все значения КБЖУ ≥0, до двух знаков. Блюдо фиксирует снимок названия и КБЖУ; изменение каталога его не меняет. Команды старого/будущего дня дают 409. Повтор создания удалённого ID не восстанавливает строку. Нормы меняются через общий профиль; для дня используется `dayNutritionGoals`.

## Учёба

| Метод и путь | Вход / результат |
|---|---|
| GET `/subjects` | Список и `labCount`; `?includeArchived=true` включает архив |
| POST `/subjects` | `{id,name,labCount}`; 0–500 лабораторных с номерами 1…N |
| GET `/subjects/:id` | Предмет и `labs` |
| PATCH `/subjects/:id` | `{version,name?,isArchived?}` |
| PATCH `/subjects/:id/closed` | `{version,closed:boolean}`; ручное закрытие/отмена с отдельным снимком XP |
| PATCH `/labs/:id/done` | `{version,done:boolean}` |
| PATCH `/labs/:id/passed` | `{version,passed:boolean}` |

Сдать можно только сделанную лабораторную. Перед снятием выполнения нужно снять сдачу. Награды хранятся отдельно, отмена использует фактически выданную сумму. Предмет не закрывается автоматически; ручное закрытие не требует сдачи всех лабораторных. Архив сохраняет факты и награды.

## LeetCode

| Метод и путь | Вход / результат |
|---|---|
| GET `/coding/tasks` | Пул задач |
| GET `/coding/current` | Текущая выдача, включая завершённую; `null` до первой |
| POST `/coding/next` | `{assignmentId,expectedPreviousAssignmentId:null}` для первой. Следующие: `{assignmentId,expectedPreviousAssignmentId,version}` версии текущей строки |
| PATCH `/coding/:id/result` | `{assignmentId,version,result:"solved"\|"failed"}`; `:id` — ID задачи |

Текущая выдача сохраняется при перезагрузке. Нельзя заменить задачу без ответа. Награда фиксируется при выдаче, failed даёт 0 XP. Кулдаун начинается при выдаче. Пустой доступный пул: `{available:false,current}` без очистки текущей записи. После следующей выдачи старая попытка очищается, счётчик решений сохраняется.

## Рациональность

| Метод и путь | Вход / результат |
|---|---|
| GET `/knowledge` | Включённые материалы, необязательный `kind=law\|method\|principle\|other` |
| GET `/books` | Книги, `?includeArchived=true` |
| POST `/books` | `{id,title,progressUnit:"pages"\|"chapters",totalUnits,readUnits?,author?,description?,sourceUrl?,isArchived?}` |
| GET `/books/:id` | Книга |
| PATCH `/books/:id` | `{version,title?,author?,description?,sourceUrl?,progressUnit?,totalUnits?,readUnits?,isArchived?}` |
| GET `/scenarios/current` | Текущая попытка, включая завершённую, или `null` |
| POST `/scenarios/next` | `{attemptId,expectedPreviousAttemptId:null}` для первой; затем `{attemptId,expectedPreviousAttemptId,version}` |
| PATCH `/scenarios/:id/answer` | `{attemptId,version,userAnswer,submit?:boolean}`; `submit:false` сохраняет черновик, true подтверждает |
| PATCH `/scenarios/:id/score` | `{attemptId,version,selfScore:0\|25\|50\|75\|100}` |

Прогресс книги абсолютный, 0≤readUnits≤totalUnits. Достижение totalUnits ставит completedAt; исправление вниз снимает его. XP и дейлик чтения не меняются. Смена единицы после начала чтения запрещена: сначала нужен явный сброс/перенос с проверкой квестов. Архив не исключает прочитанное из метрик.

Ситуация всегда возвращается через явную проекцию: до подтверждения нет ни `referenceAnswer`, ни `reference_answer`, включая вложенный снимок. После подтверждения эталон берётся из снимка, а не текущего каталога. После подтверждения текст не меняется. Оценка разрешена после непустого ответа, награда округляется вниз до сотых. Следующая попытка очищает ответ и оценку предыдущей, сохраняя общий счётчик. Незавершённую попытку заменять нельзя. Пустой доступный пул возвращает `{available:false,current}`.

## Менторы

| Метод и путь | Вход / результат |
|---|---|
| GET `/mentors` | Каталог менторов с изображениями и фразами |
| GET `/mentors/page?section=...` | Реплика idle соответствующей страницы либо null; section home/study/sport/work/nutrition/rationality |
| POST `/mentors/popup/seen` | `{version}` текущего профиля; фиксирует фактический показ и возвращает новую версию профиля |

Общий диспетчер вызывает экспорт `mentorReactions(ctx)` после settleGame. Событие daily_completed может содержать `mentorPopup` с вероятностью 20%, 80% из выбранных реакций — профильного ментора. Кулдаун 15 минут считается только после подтверждения фактического показа. При отсутствии подходящей фразы popup не создаётся. Клиент подавляет самостоятельную модалку во время фокуса, не ставит её в очередь и не подтверждает непоказанное. Для log_gym_results событие содержит `reminder` с href `/do-it`. Обязательные quest/rank реплики (`mentor`) обходят вероятность и кулдаун; ранги комментирует gojo. Если нужного контента нет, реплика отсутствует. Карточки страниц не меняют кулдаун.
