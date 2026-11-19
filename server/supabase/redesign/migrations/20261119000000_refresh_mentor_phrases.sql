BEGIN;

DELETE FROM public.mentors WHERE id = 'senku';

WITH mentor_data (id, name, section, phrases) AS (
  VALUES
  ('gojo', 'Годжо', 'home', '[
    {"id":"gojo-pick-a-task","event":"idle","mood":"neutral","text":"Ну что, сам выберешь первую задачу или мне ткнуть пальцем в список с закрытыми глазами?"},
    {"id":"gojo-blindfold","event":"cross_reaction","mood":"positive","text":"О, ещё одна галочка! Ради такого я даже приподнял повязку."},
    {"id":"gojo-proud-coach","event":"quest_completed","mood":"positive","text":"Квест закрыт. Ты справился, а у меня теперь есть законный повод хвастаться учеником."},
    {"id":"gojo-podium","event":"rank_up","mood":"positive","text":"Новый ранг! Ладно, подвинусь на пьедестале. Чуть-чуть."},
    {"id":"gojo-comeback","event":"rank_down","mood":"negative","text":"Обидно видеть ранг ниже. Давай сегодня возьмём одну задачу, на которую точно хватит сил. Я рядом."}
  ]'),
  ('ayanokoji', 'Аянокоджи', 'rationality', '[
    {"id":"aya-change-of-mind","event":"idle","mood":"neutral","text":"Какой факт заставил бы тебя передумать? Удобнее решить это до того, как узнаешь ответ."},
    {"id":"aya-prediction","event":"daily_completed","mood":"positive","text":"Хороший разбор. Оставь себе прогноз в одну строку. Через неделю будет интересно его перечитать."}
  ]'),
  ('katagiri', 'Катагири', 'rationality', '[
    {"id":"katagiri-deal","event":"idle","mood":"negative","text":"Меня настораживают сделки, в которых якобы выигрывают все. Кто получит своё, даже если ты проиграешь?"},
    {"id":"katagiri-bet","event":"cross_reaction","mood":"positive","text":"Если бы мы поспорили, доведёшь ли ты это до конца, сегодня мне пришлось бы платить. Хорошо сыграно."}
  ]'),
  ('jin_woo', 'Сон Джин Ву', 'sport', '[
    {"id":"jin-training-log","event":"idle","mood":"neutral","text":"Когда кажется, что стою на месте, я открываю старый журнал тренировок. Помнишь, с чего начинал ты?"},
    {"id":"jin-finish","event":"daily_completed","mood":"positive","text":"Задание выполнено. Переведи дыхание. Я тоже люблю эту минуту тишины после нагрузки."},
    {"id":"jin-log-results","event":"workout_results_reminder","mood":"neutral","text":"Запиши вес и повторы, пока помнишь последний подход. В следующий раз будем знать, с чего начать."}
  ]'),
  ('soma', 'Сома', 'sport', '[
    {"id":"soma-warmup","event":"idle","mood":"neutral","text":"Мой рецепт на сегодня? Любимый трек, короткая разминка и упражнение, ради которого ты сюда пришёл."},
    {"id":"soma-seconds","event":"daily_completed","mood":"positive","text":"Вот это подача! Какое движение сегодня вышло так здорово, что хочется попросить добавки?"}
  ]'),
  ('kaiser', 'Кайзер', 'sport', '[
    {"id":"kaiser-scoreboard","event":"idle","mood":"negative","text":"Чужие рекорды я и сам могу посмотреть. Покажи мне свой. Какой результат ты хочешь побить?"},
    {"id":"kaiser-replay","event":"daily_completed","mood":"positive","text":"Очко в твою пользу. Такой момент я бы ещё раз посмотрел в замедленной съёмке."}
  ]'),
  ('ron_kamonohashi', 'Рон Комонакаси', 'work', '[
    {"id":"ron-first-clue","event":"idle","mood":"neutral","text":"Начнём расследование. Положи рядом то, что должно было получиться, и то, что вышло. Где первое расхождение?"},
    {"id":"ron-case-closed","event":"daily_completed","mood":"positive","text":"Дело закрыто! Оставь на завтра одну улику — строчку о том, что в итоге сработало."}
  ]'),
  ('l', 'L', 'work', '[
    {"id":"l-tea-break","event":"idle","mood":"neutral","text":"До чая десять минут. Какую догадку о задаче мы успеем проверить за это время?"},
    {"id":"l-proof","event":"daily_completed","mood":"negative","text":"Галочка меня пока не убедила. Если коллега откроет твою работу, как он поймёт, что всё получилось?"}
  ]')
)
INSERT INTO public.mentors AS mentor (id, name, section, images, phrases)
SELECT id, name, section,
       jsonb_build_object(
         'default', '/assets/coaches/' || id || '/neutral.png',
         'neutral', '/assets/coaches/' || id || '/neutral.png',
         'positive', '/assets/coaches/' || id || '/positive.png',
         'negative', '/assets/coaches/' || id || '/negative.png'
       ),
       phrases::jsonb
FROM mentor_data
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    section = EXCLUDED.section,
    images = EXCLUDED.images,
    phrases = EXCLUDED.phrases
WHERE (mentor.name, mentor.section, mentor.images, mentor.phrases)
      IS DISTINCT FROM (EXCLUDED.name, EXCLUDED.section, EXCLUDED.images, EXCLUDED.phrases);

COMMIT;

SELECT name, section, jsonb_array_length(phrases) AS phrase_count, images
FROM public.mentors
ORDER BY section, name;
