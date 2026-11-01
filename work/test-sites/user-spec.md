# User Spec: test-sites

## Цель

Набор локальных dummy-сайтов на разных технологиях рендеринга и с разной
agent-readiness, чтобы проверять на них краулер, извлечение фактов, генерацию
вопросов и аудит ботов.

## Сайты

| Порт | Имя | Технология | Что проверяет |
|---|---|---|---|
| 4101 | static | статический HTML | SSR-контент в сыром HTML, schema, sitemap, llms.txt |
| 4102 | spa | клиентский JS | контент появляется только после fetch и рендера |
| 4103 | ssr | серверный рендер без JS | контент в первом ответе, нет JS-зависимости |
| 4104 | hostile | JS + защита | robots запрещает AI-ботов, 403 для их UA, нет schema/sitemap |
| 4105 | agent-good | статический HTML + agent-стандарты | llms.txt, OpenAPI, MCP server card, API catalog, Content-Signal |
| 4106 | traps | HTML + JS | soft 404, редиректы, challenge, UA-cloaking, rate limit, canonical, shadow DOM, iframe, регион, A/B, пагинация, разный бизнес-контент |

## Поведение

- Все сайты отдают вымышленные факты про Acme Cloud: цена 4 900 ₽/мес,
  доставка 1–2 дня, возврат 14 дней.
- `static` и `ssr` содержат факты в сыром HTML.
- `spa` и `hostile` содержат только оболочку; факты появляются после JS.
- `hostile` отвечает 403 на UA GPTBot, ClaudeBot, PerplexityBot, YandexAdditional.
- `agent-good` проходит проверки agent readiness: `llms.txt`, `openapi.json`,
  `/.well-known/mcp/server-card.json`, `/.well-known/api-catalog`,
  `/.well-known/agent-skills/index.json`.

## Запуск и проверка

- `npm start` — поднимает все пять сайтов.
- `npm run check` — печатает статусы, наличие контента в сыром HTML и реакцию
  на UA ботов.

## Non-goals

- Реальный контент, база данных, авторизация, сборка фронтенда.
- Обход капчи, прокси, эмуляция браузера в раннере.
