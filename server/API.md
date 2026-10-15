# HTTP API Limitless

Базовый URL: `http://localhost:8080/api` локально, `https://<домен-api>/api` после размещения. Все пути далее относительны `/api`. Бэкенд рассчитан на одного владельца. Каталоги наполняются отдельно; сервер не создаёт блюда, дейлики, квесты, книги, ситуации и менторов при запуске.

## Первый запуск фронтенда

1. `GET /auth/session` → проверить `{authenticated}`.
2. При необходимости `POST /auth/login` с `{password}`.
3. `GET /profile`. Ответ `404 PROFILE_NOT_CONFIGURED` означает, что нужен экран первоначальных настроек и `POST /profile`.
4. После создания/загрузки профиля — `POST /session/open` с `{}`: только этот запрос засчитывает вход в приложение.
5. Загружать нужные разделы. Из каждого игрового ответа обновлять общий профиль и обрабатывать события.

## Запросы, версии и ответы

```ts
const API = 'http://localhost:8080/api';

async function api<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method,
    credentials: 'include',
    headers: {
      'X-Requested-With': 'Limitless',
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok) throw Object.assign(new Error(result.error.message), result.error, { status: response.status });
  return result;
}

await api('/auth/login', 'POST', { password: passwordFromForm });
```

Браузер сам передаёт `Origin`; вручную задавать его в `fetch` не нужно. При запросах из curl/Postman на изменение нужны разрешённый `Origin` и `X-Requested-With: Limitless`, кроме cron с bearer-секретом. JSON-тело ограничено 64 КиБ. Неизвестные поля тела отклоняются: клиент не может передать произвольные XP, характеристики или служебные поля.

Игровые маршруты возвращают общий конверт:

```ts
type Envelope<T> = {
  data: T;
  profile: Profile; // актуальный профиль после всех наград и квестов
  events: GameEvent[];
  meta: { gameDate: string; profileVersion: string };
};
```

Названия полей в ответах — **camelCase**. XP, вес, порции, суммы КБЖУ — JSON numbers; `version` — строка, например `"3"`. Входные XP не принимаются; пользовательские десятичные величины допускают число или десятичную строку. Даты — `YYYY-MM-DD` по Москве, timestamps — ISO 8601 с `Z`. Необязательные значения БД приходят как `null`, списки — `[]`.

`version` нужна при редактировании: передавай версию **изменяемой записи**, а для настроек профиля/подтверждения модалки — `response.profile.version`. После успешного изменения используй новую версию из ответа. `409 VERSION_CONFLICT` требует перечитать запись и согласовать состояние UI. Слепо повторять старую команду с новой версией нельзя. Если два ответа пришли не по порядку, не заменяй глобальный профиль более старой версией: сравнивай через `BigInt`.

Для создания записей генерируй `crypto.randomUUID()` один раз на действие. При повторе после сетевой ошибки сохраняй тот же ID и тело. Новый UUID означает новое действие. Для обновлений передаются **абсолютные значения** (`completed`, `done`, `readUnits`, `progress`), а не «прибавь 1». Повтор с устаревшей версией может дать 409, но повторной награды не будет.

Чтение игровых разделов может закрыть старый день, выдать новый набор и завершить накопленный квест. Поэтому игровые GET не кэшируются. Глобальные `profile` и `events` обрабатывай также у GET. Данные и награды фиксируются одной транзакцией; при ошибке откатывается весь запрос.

### Ошибки

```json
{"error":{"code":"VERSION_CONFLICT","message":"...","details":{"currentVersion":"4"}}}
```

| HTTP | Значение |
|---|---|
| 400 | Ошибка полей, типов, диапазонов, JSON или некорректный URL-параметр |
| 401 | Нет действующей сессии, неправильный пароль/секрет cron |
| 403 | Запрещённый Origin или отсутствует CSRF-заголовок |
| 404 | Нет записи/маршрута; `PROFILE_NOT_CONFIGURED` — ещё нет профиля |
| 405 | Метод не поддерживается |
| 409 | Устаревшая версия/выдача, конфликт ID, запрещённая отмена, недоступное действие |
| 413 / 415 | Тело слишком большое / неверный Content-Type |
| 429 | Слишком много попыток входа; `Retry-After: 300` |
| 503 | Не заданы настройки защиты/подключения |
| 500 | Внутренняя ошибка; SQL и секреты не возвращаются |

При `COMPLETED_QUEST_DEPENDENCY` `details.questIds` указывает завершённые квесты, которым противоречит отмена. Их награды не переигрываются: отмена отклоняется целиком.

## Вход и служебные маршруты

Эти ответы **без** игрового конверта.

| Метод | Путь | Тело | Ответ |
|---|---|---|---|
| GET | `/health` | — | `{status:"ok"}`; проверяет процесс и конфигурацию Origin, без проверки БД |
| GET | `/auth/session` | — | `{authenticated:boolean}` |
| POST | `/auth/login` | `{password:string}` | `{authenticated:true}` и HttpOnly cookie на 7 дней |
| POST | `/auth/logout` | — | `{authenticated:false}` и удаление cookie текущего браузера |
| POST | `/jobs/rollover` | — | `{configured:true,gameDate,lastClosedDay}` либо `{configured:false}` до создания профиля |
| OPTIONS | любой путь | — | 204 при допустимом CORS preflight |

`/jobs/rollover` требует `Authorization: Bearer <CRON_SECRET>`; cookie владельца его не заменяет. Все игровые маршруты ниже требуют сессию владельца. Настройка сервера, cookie и cron описаны в разделе «Запуск и устройство кода» ниже. В `npm run dev` сохранён локальный режим без обязательной сессии и CSRF-заголовка; проверка разрешённого Origin остаётся. В production сессия и CSRF обязательны.

## Профиль и форма данных

Профиль содержит поля таблицы `profiles` из [описания БД](../docs/backend-redesign.md), переименованные в camelCase: `name`, `avatarUrl`, `title`, `trainingDays`, `studyDays`, `studyBreaks`, `plannedAbsences`, `totalExp`, `highestRank`, `statIntelligence`, `statStrength`, `statRationality`, `statEgo`, `statDiscipline`, `statEnergy`, `loginStreak`, `activityStreak`, `nutritionGoalCalories`, `nutritionGoalProtein`, `nutritionGoalFat`, `nutritionGoalCarbs` и служебные снимки дня. Дополнительно вычисляются `rank`, `level`, `levelExp`, `nextLevelExp`, `nextRank`, `nextRankExp`, `balanceVersion`, `statStages`. `nextRank`/`nextRankExp` равны `null` на максимальном ранге. `levelExp` — XP внутри текущего уровня, `nextLevelExp` — размер уровня; `nextRankExp` — абсолютный порог следующего ранга.

Пример настройки:

```json
{
  "name": "Влад",
  "trainingDays": [1, 3, 5],
  "studyDays": [1, 2, 3, 4, 5],
  "studyBreaks": [{"startDate":"2027-01-01","endDate":"2027-01-10"}],
  "plannedAbsences": [],
  "nutritionGoals": {"calories":2400,"protein":140,"fat":80,"carbs":280}
}
```

Значения КБЖУ здесь — пример формата, свои нормы задаёт владелец. Для PATCH добавь актуальную `version`. Настройки расписания не заменяют уже назначенные сегодня дейлики; нормы КБЖУ применяются со следующего игрового дня.

## Игровые маршруты

| Метод и путь | Тело / результат |
|---|---|
| `POST /profile` | Первоначальная явная настройка: `{name, avatarUrl?, title?, trainingDays?, studyDays?, studyBreaks?, plannedAbsences?, nutritionGoals?}`. Второй профиль отклоняется. |
| `GET /profile` | Профиль и вычисленные `rank`, `level`, `levelExp`, `nextLevelExp`, `nextRank`, `nextRankExp`, `statStages`. |
| `PATCH /profile` | Те же настройки плюс обязательная `version`. XP, характеристики и служебные поля недоступны. |
| `POST /session/open` | `{}`. Засчитывает первый вход дня и начисляет его единственную награду; повтор безопасен. Вызывается фронтендом при открытии приложения. |
| `GET /tasks/today` | `{gameDate, absent, tasks}`. При нехватке подходящего контента возвращает меньше пяти задач; автоматически контент не создаётся. |
| `PATCH /tasks/today/:id` | `{assignmentId, version, completed:boolean}`. Отметка/отмена текущего назначения. Старое назначение или версия дают 409. |
| `GET /quests` | Список квестов с вычисленным `progress`; `unlockedAt` показывает доступность. Завершённые сохраняются, включая отключённые. |
| `PATCH /quests/:id/progress` | `{version, progress:integer}` для доступного ручного квеста. Передаётся абсолютный прогресс. Достаточный прогресс завершает квест и начисляет награду автоматически. |
| `POST /quests/:id/seen` | `{version}`. Только подтверждение показа завершения, без XP. |
| `GET /focus` | Сегодняшние `gameDate`, `durationSeconds`, `creditedSeconds`, `awardedXp`, `dailyLimitSeconds`. |
| `POST /focus` | `{id:UUID, durationSeconds:positiveInteger}`. Стабильный ID сохраняется при повторах. Повтор с другим временем даёт 409. Время относится к московской дате первого сохранения. |
| `POST /profile/rank-change/seen` | `{id:UUID, version}`. ID относится к `pendingRankChange`; старое уведомление не стирает новое. |

Настройки дней — массивы уникальных чисел `1..7`, понедельник = 1. Периоды — массивы `{startDate,endDate}`; отсутствие допускает `reason`. Пересечения объединяются. Периоды, начавшиеся к сегодняшнему дню, неизменяемы; новое отсутствие начинается завтра или позже. `nutritionGoals` — `null` или все четыре положительных значения `{calories,protein,fat,carbs}` с максимум двумя десятичными знаками. Новые нормы действуют со следующего открытого дня.

Награды версионированы в `server/config/balance.ts`. Текущая версия: `2026-10-10-v1`. Начальный баланс: фокус 0,20 XP/мин, максимум 7200 зачтённых секунд за день; входы 1–7 XP по серии с дальнейшим ограничением 7; лабораторная сделана 20, сдана 30, предмет закрыт 100. Учебные награды меняют только XP, поскольку схема хранит для их отмены только XP. Питание даёт 10 XP, если все четыре итога в пределах ±15% снимка норм; любое отклонение от 35% даёт штраф 5 XP. Между границами — нулевой эффект. Отсутствие записей, удалённые записи и отсутствие настроенных норм не штрафуются. Это игровой баланс, а не рекомендуемые нормы питания.

Пороги рангов XP: E 0, D 500, C 1500, B 3500, A 7000, S 12000, S+ 20000, SS 35000, SSS 60000. Уровни по 100 XP, этапы характеристик: 0, 100, 1000, 5000. Достижение ранга открывает квесты навсегда. Изменения непоказанного ранга объединяются; возврат к исходному рангу убирает уведомление.

Закрытие дня обрабатывает каждый пропущенный день последовательно. Дейлики используют снимок награды/штрафа, кулдаун начинается при выдаче. Питание использует снимок норм и версии баланса, точные умножения выполняет PostgreSQL `numeric`. Выполненные текущие задания и питание очищаются при закрытии; история не создаётся. Периоды отсутствия замораживают обе серии, не выдают дейлики и не оценивают питание.

Пустой непрерывный период запланированного отсутствия пропускается за ограниченное число запросов после расчёта предыдущего дня; сохранённые факты внутри периода останавливают ускорение перед своей датой. Обычные пропущенные дни сохраняют последовательный расчёт. Планировщик `/api/jobs/rollover` нужен ежедневно: длительный незапланированный перерыв требует больше запросов к БД и увеличивает время первого открытия.

Метрические квесты используют уже накопленные факты; награда может каскадом открыть и завершить другие квесты. Отмена, которая уменьшила бы прогресс завершённого квеста ниже цели, отклоняется с `COMPLETED_QUEST_DEPENDENCY` и списком `questIds`. Обычная отмена вычитает фактически начисленный снимок с нижней границей XP/характеристик 0. Сохранённый фокус не изменяется и не удаляется.

`events` содержит события `daily_completed`, `quest_completed`, `rank_up`, `rank_down`; спортивная задача передаёт `completionAction`. Раздел менторов обогащает события репликами и подтверждает фактический показ отдельно.

## Предметные разделы

Общие правила: UUID задаётся клиентом при POST создания и сохраняется при сетевом повторе. Повтор ID с теми же данными возвращает существующую строку, другое содержимое даёт 409. PATCH/PUT/DELETE обязаны содержать `version` изменяемой строки; устаревший запрос даёт 409 и ничего не начисляет. После изменения сервер проверяет, что завершённые квесты остаются выполненными, затем пересчитывает прогресс, активность и ранг. Все действия атомарны вместе с наградами.

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
| GET `/nutrition/today` | `{gameDate,goals,entries,totals:{count,calories,protein,fat,carbs}}`; суммы — JSON numbers после сериализации |
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

После расчёта игровых наград сервер добавляет к событиям реплики менторов. Событие daily_completed может содержать `mentorPopup` с вероятностью 20%, 80% из выбранных реакций — профильного ментора. Кулдаун 15 минут считается только после подтверждения фактического показа. При отсутствии подходящей фразы popup не создаётся. Клиент подавляет самостоятельную модалку во время фокуса, не ставит её в очередь и не подтверждает непоказанное. Для log_gym_results событие содержит `reminder` с href `/do-it`. Обязательные quest/rank реплики (`mentor`) обходят вероятность и кулдаун; ранги комментирует gojo. Если нужного контента нет, реплика отсутствует. Карточки страниц не меняют кулдаун.

## Примеры для UI

Дейлик возвращается с определением задачи, текущим `assignmentId`, `assignedFor`, `completedAt`, `assignedEffects`, `appliedReward` и `version`. Отправляй ID задачи в URL, ID **её текущего назначения** — в тело:

```ts
const result = await api('/tasks/today/' + task.id, 'PATCH', {
  assignmentId: task.assignmentId,
  version: task.version,
  completed: true,
});
// result.data — обновлённая задача, result.profile — итог всех начислений.
// completed:false отменяет отметку, если завершённый квест от неё не зависит.
```

Простой фокус сохраняет измеренное клиентом время; сервер не ведёт работающий таймер:

```ts
const saveId = crypto.randomUUID(); // сохранить до успешного ответа
await api('/focus', 'POST', { id: saveId, durationSeconds: 1500 });
// При потере ответа повторить те же id и durationSeconds.
```

Создание предмета и отметка лабораторной:

```ts
const created = await api('/subjects', 'POST', {
  id: crypto.randomUUID(), name: 'Алгоритмы', labCount: 5,
});
const lab = created.data.labs[0];
const done = await api(`/labs/${lab.id}/done`, 'PATCH', {
  version: lab.version, done: true,
});
await api(`/labs/${lab.id}/passed`, 'PATCH', {
  version: done.data.version, passed: true,
});
```

Тренировка в зале:

```json
{
  "id": "cf2e6ee7-a9ef-4e37-a037-b9d8a3a8da82",
  "kind": "gym",
  "performedOn": "2026-10-10",
  "programId": "bdac69c9-6a79-4965-a95c-3a45f6a8e73e",
  "results": [
    {"exerciseId":"7eaf3f21-ea54-46bb-8619-baf1730f0bc7","weightKg":60,"repetitions":10}
  ]
}
```

Программа и упражнение должны существовать; UUID здесь иллюстрируют формат. История упражнения возвращает вес, повторения и дату посещения; `/workouts/:id` — посещение с `results`. Это данные для графиков, отдельной таблицы статистики нет.

Ручная запись питания:

```ts
await api('/nutrition/entries', 'POST', {
  id: crypto.randomUUID(), gameDate: currentGameDate,
  title: 'Перекус', calories: 300, protein: 15, fat: 10, carbs: 38,
});
```

`GET /nutrition/today` возвращает `goals` со снимком норм на сегодня (`null`, если не заданы), список `entries` и `totals`. `totals` уже учитывает порции и удалённые записи. XP за питание рассчитываются при закрытии дня, а не после каждого изменения записи.

Первая выдача ситуации:

```ts
const attemptId = crypto.randomUUID();
const drawn = await api('/scenarios/next', 'POST', {
  attemptId, expectedPreviousAttemptId: null,
});
// drawn.data.assignedContent: {title,prompt,rewardXp}, без эталона.
const submitted = await api(`/scenarios/${drawn.data.id}/answer`, 'PATCH', {
  attemptId, version: drawn.data.version, userAnswer: 'Мой ответ', submit: true,
});
// submitted.data.assignedContent.referenceAnswer теперь доступен.
await api(`/scenarios/${drawn.data.id}/score`, 'PATCH', {
  attemptId, version: submitted.data.version, selfScore: 75,
});
```

Проверяй `data.available === false` перед использованием выдачи: доступный пул может быть пуст. Для новой попытки передаются новый ID и ID/версия предыдущей. Завершённая выдача сохраняется до следующего запроса `next`, поэтому страницу можно перезагружать.

## События и восстановление модалок

```ts
type MentorReaction = {
  mentorId: string; name: string; phraseId: string;
  event: string; mood: 'positive' | 'negative' | 'neutral'; text: string; image: string;
};
type GameEvent =
  | { type: 'daily_completed'; taskId: string; completionAction: string;
      mentorPopup?: MentorReaction; reminder?: MentorReaction & { href: string } }
  | { type: 'quest_completed'; questId: string; mentor?: MentorReaction | null }
  | { type: 'rank_up' | 'rank_down'; fromRank: string; toRank: string;
      mentor?: MentorReaction | null };
```

Тело события — только повод обновить UI; окончательные числа бери из общего `profile`, текущие строки — из соответствующего GET. Типы выше описывают текущие события; клиент может игнорировать неизвестные типы при дальнейшем расширении API.

События не хранятся в отдельной очереди. После перезагрузки незакрытое уведомление ранга доступно в `profile.pendingRankChange`, а непоказанные завершённые квесты — в `GET /quests` (`completedAt !== null`, `completionSeenAt === null`). После фактического показа вызывай соответствующий `/seen`. Для необязательной модалки ментора — `POST /mentors/popup/seen` с актуальной версией профиля. Карточки менторов на страницах этого подтверждения не требуют.

## Запуск и устройство кода

Из корня проекта:

```sh
npm --prefix server ci
npm --prefix server run dev
```

API слушает `http://localhost:8080/api`. Настройки находятся в локальном `server/.env`; образец имён переменных — [.env.example](.env.example). Существующий `.env` при обновлении кода сохраняется.

- `DATABASE_URL` — PostgreSQL-строка подключения из Supabase Connect; `DATABASE_POOL_SIZE` — размер пула, по умолчанию 3. `DATABASE_CA_CERT` — сертификат CA при необходимости.
- `APP_ORIGINS` — адреса фронтенда через запятую, например `http://localhost:3000`. В production укажи точные HTTPS origins без завершающего `/`.
- `OWNER_PASSWORD_HASH` — результат `npm --prefix server run hash-password`; команда запрашивает пароль скрыто.
- `SESSION_SECRET` и `CRON_SECRET` — разные случайные секреты длиной не менее 32 байт.
- `SESSION_COOKIE_SAMESITE` — `lax`, либо `none` для фронтенда и API на разных сайтах с HTTPS.

В development игровой API открыт локально; в production требуется вход. Production cookie имеет `HttpOnly`, `Secure` и срок 7 дней. Изменение пароля или `SESSION_SECRET` отзывает существующие сессии. Ограничение входа — 30 попыток за 5 минут на процесс.

Для production: `npm --prefix server run build`, затем `npm --prefix server start`. HTTPS предоставляет хостинг. Планировщик вызывает `POST /api/jobs/rollover` с `Authorization: Bearer <CRON_SECRET>` ежедневно после 00:00 Москвы (21:00 UTC), можно каждые 15 минут. Повтор безопасен.

Код читается в таком порядке:

1. `app/api/.../route.ts` — нужный URL и функция для GET, POST или другого метода.
2. `controllers/` — обработчики разделов: проверка входа, запрос к БД, результат.
3. `game/` — общие правила XP, квестов, рангов и смены дня.
4. `core/game-request.ts` — авторизация, одна транзакция на действие и общий ответ. `core/` также содержит небольшие функции для SQL, дат и проверки полей.
5. `config/balance.ts` — числа наград и пороги рангов.

Например, `/api/focus` находится в `app/api/focus/route.ts`, сохранение времени — в `controllers/focus.ts`. Действие, награды и квесты сохраняются вместе; ошибка откатывает весь запрос. Уже выданные награды используют сохранённые снимки баланса.

Проверки: `npm --prefix server test`, `npm --prefix server run test:db`, `npm --prefix server run typecheck`, `npm --prefix server run build`. Тесты используют отдельную PostgreSQL в памяти (PGlite), рабочую БД не затрагивают.
