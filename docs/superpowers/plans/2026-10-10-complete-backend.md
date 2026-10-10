# Рабочий бэкенд Limitless

Основание: docs/backend-redesign.md и применённая пользователем схема из 18 таблиц. Пользователь разрешил реализацию всего бэкенда с субагентами и стартовый баланс, запретил наполнять БД контентом. Размещение публичное; вход по одному паролю без регистрации.

## Архитектура и границы

- Сохраняется Next.js server, API `/api/...`, фронтенд не меняется.
- PostgreSQL через node-postgres и DATABASE_URL: все игровые операции используют одно соединение и одну транзакцию, общий advisory lock и блокировку профиля. Отдельные независимые запросы Supabase REST не подходят для атомарных начислений.
- Прикладные модули возвращают маршруты. Общий диспетчер обеспечивает аутентификацию, Origin/CSRF, ограничения JSON, транзакцию и единый формат ошибок.
- Никаких seed/INSERT справочников на старте приложения. Единственный профиль создаётся явным запросом настройки. Тестовые данные существуют только во временных тестовых БД.
- Стартовый баланс хранится версионированно в server/config/balance.ts. Дни используют сохранённую версию, награды назначений — снимки.
- Планировщик вызывает защищённый `/api/jobs/rollover`; любые игровые запросы также закрывают пропущенные дни. Настройка внешнего cron документируется, не выполняется удалённо.
- Старые маршруты, обращающиеся к удалённым таблицам, удаляются или заменяются. Публичных незащищённых старых ручек не остаётся.
- Не добавляются пет-проекты, ИИ, статистика по дням, новые таблицы пользователей или контентные данные. Коммиты и удалённые операции не выполняются.

## Общие интерфейсы для параллельной реализации

`server/core/types.ts`:
- `Row = Record<string, any>` только на границе динамических PostgreSQL-результатов; модули вводят типы при необходимости.
- `Sql.query<T = Row>(text: string, values?: unknown[]): Promise<{ rows: T[]; rowCount: number | null }>`.
- `GameContext = { db: Sql; profile: Row; now: string; today: string; events: GameEvent[] }`.
- `Input = { params: Record<string,string>; query: URLSearchParams; body: Row }`.
- `Route = { method: 'GET'|'POST'|'PATCH'|'PUT'|'DELETE'; path: string; handle(ctx: GameContext, input: Input): Promise<unknown>; status?: number }`; пути относительны `/api`, параметры `:id`.

`server/core/validation.ts`: `object(value)`, `only(body, allowedKeys)`, `text(value,name,max=500)`, `optionalText(value,name,max)`, `integer(value,name,min=0,max=2147483647)`, `boolean(value,name)`, `uuid(value,name='id')`, `date(value,name='gameDate')`, `choice(value,name,allowed)`, `version(value)` возвращает строку; `expectVersion(row, expected)` бросает CONFLICT. `ApiError(status,code,message,details?)` из core/errors.ts.

`server/core/sql.ts`: `one<T>(db, sql, values?)`, `all<T>(...)`, `insert(db,table,data)`, `update(db,table,keyObject,patch)` возвращают строки с учётом DB-триггера версии; имена таблиц/полей проходят белый список. Значения JSON передаются объектами, money — десятичной строкой. `requireRow(row)` даёт 404.

`server/core/money.ts`: `cents(value)` проверяет decimal с максимум двумя знаками и возвращает целые сотые, `amount(cents)` возвращает строку `0.00`. `server/core/dates.ts`: `moscowDate(iso)`, `addDays(date,n)`, `weekday(date)`, `inPeriods(periods,date)`.

Игровое ядро экспортирует из `server/modules/game/index.ts`:
- `gameRoutes: Route[]` для профиля GET/PATCH, POST /session/open, дейликов, квестов, фокуса, уведомления ранга.
- `createProfile(db, body, now): Promise<Row>` для POST /profile (вызывается вне GameContext под транзакционной блокировкой).
- `prepareDay(ctx): Promise<void>`; `settleGame(ctx): Promise<void>` обновляет квесты/ранги/активность после операции; `assertCompletedQuests(ctx): Promise<void>` запрещает отмену зависимых фактов.
- `applyEffect(ctx, {xp: string|number, stats: Record<string,number>}, direction=1|-1): Promise<Effect>` применяет награду/штраф и обновляет ctx.profile, возвращает фактическую величину эффекта.
- `metrics(ctx): Promise<Record<string,number>>`.

Разделы экспортируют `sectionRoutes: Route[]` из `server/modules/sections/index.ts`. Изменения фактов выполняются без самостоятельного COMMIT; общий слой после handler вызывает assertCompletedQuests и settleGame. Поздняя ошибка откатывает всё.

Защита экспортирует из `server/core/auth.ts`: `handleAuth(request: Request, path: string): Promise<Response|null>` для /auth/login,/auth/logout,/auth/session; `requireOwner(request): Promise<void>`; `requireJob(request): void`. Из `server/core/http.ts`: `guardOrigin(request): void`, `readBody(request): Promise<Row>`, `respond(request,data,status?): Response`, `respondError(request,error): Response`, `preflight(request): Response`. Эти функции не подключаются к БД.

## Порядок и проверка

1. Общие SQL/типы/валидация, драйвер и тестовый адаптер PostgreSQL.
2. Параллельно ядро/баланс, разделы, auth/HTTP. Тесты на реальные сценарии, первоначальные отрицательные проверки до реализации.
3. Единый диспетчер и маршруты, удаление несовместимых старых обработчиков. Документ всех ручек: параметры, ответы, ошибки, версии и повтор запросов.
4. Интеграционные проверки на PGlite с настоящей миграцией, проверки аутентификации/CSRF/пустой БД, tsc и production build. Независимый обзор и исправления существенных замечаний.

Особое внимание: конкуренция и повтор запросов; смена московского дня/отсутствие; точные дробные XP; запрет повторной выдачи наград; скрытие эталона ситуации до ответа; закрытые endpoint и Origin; отсутствие контента и автоматических seed.

## Итог проверки реализации

- Игровое ядро, предметные разделы, защита и общий диспетчер реализованы; старые обработчики удалены.
- Единая документация фронтенда: `server/API.md`; настройка: `server/README.md` и `.env.example`.
- 50 тестов сервера и 35 тестов SQL проходят; TypeScript и production build проходят.
- Запущенный production-сервер проверен по HTTP: health 200, без сессии 401, CORS preflight 204, чужой Origin 403. Рабочая БД при проверке не подключалась.
- Независимый обзор не выявил новых существенных дефектов.
- Рабочая Supabase не изменялась, контент не создавался, коммитов нет. Реальное сетевое подключение и конкурентная нагрузка нескольких соединений остаются проверкой окружения размещения.
