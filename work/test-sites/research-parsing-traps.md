# Parsing traps observed on real RU sites

Дата: 2026-11-01. Цель — перенести реальные подставы в тестовые сайты.

## Наблюдения (curl, browser UA и GPTBot UA)

| Сайт | Browser | GPTBot | Что это значит |
|---|---|---|---|
| ozon.ru | 307, **50+ редиректов** | — | редирект-петля как антибот |
| dns-shop.ru | 401, 6.3 КБ | 401, 6.3 КБ | challenge-страница вместо контента |
| smclinic.ru | 401, 265 Б | 401, 265 Б | WAF режет до HTML-контента |
| ostrovok.ru | 200, 267 КБ | 200, **590 КБ** | разный контент по UA |
| market.yandex.ru | 200, 1.99 МБ | 200, **1.53 МБ** | разный контент по UA |
| bitrix24.ru | 200, 616 КБ | 200, 616 КБ | тяжёлый SSR |
| skillbox.ru | 200, SSR | — | Nuxt SSR: A/B-конфиг в inline script, hreflang, canonical |

Выводы:

1. **401 challenge** — обычный ответ для парсера; без cookie/JS контента нет.
2. **Редирект-петля** — отдельный класс защиты; naive crawler зацикливается.
3. **Разный контент по UA** — размеры отличаются на 2×; сравнивать ответы обязательно.
4. **Тяжёлый SSR** — мегабайты HTML с hydration-данными и A/B-конфигом.
5. **SEO-ловушки** — несколько canonical, hreflang на другие домены, canonical на другой URL.

## Трапы для тестового сайта

| Трап | Маршрут | Что проверяет |
|---|---|---|
| Soft 404 | `/soft-404` | 200 с текстом «не найдено» |
| Redirect chain | `/redirect` | 301 → 302 → 307 |
| Redirect loop | `/loop` | 307 на себя; лимит редиректов |
| UA cloaking | `/ua-cloak` | разная цена для GPTBot и браузера |
| Challenge | `/challenge` | 401 + JS-cookie + reload |
| Rate limit | `/rate` | 429 после N запросов |
| Canonical trap | `/canonical-trap` | два canonical |
| Hreflang | `/hreflang` | alternate на ru/en |
| Hidden text | `/hidden` | скрытая цена 1 ₽ рядом с 4 900 ₽ |
| Shadow DOM | `/shadow` | контент внутри shadow root |
| Iframe | `/iframe` | данные во вложенном документе |
| JS schema | `/js-schema` | JSON-LD появляется только после JS |
| Cookie wall | `/cookie-wall` | контент под оверлеем согласия |
| Region gate | `/region` | цена зависит от региона, иначе модалка |
| A/B | `/ab` | цена зависит от cookie |
| Infinite scroll | `/infinite` | вторая страница через «показать ещё» |

## Разный бизнес-контент

Чтобы тесты не были про один SaaS:

- `/clinic` — клиника: услуги, цены, запись.
- `/travel` — туроператор: туры, даты, цены.
- `/shop` — интернет-магазин: товар, доставка, возврат.
- `/saas` — B2B SaaS: тарифы, API, лимиты.

## Что это даёт

Краулер должен уметь:

- ограничивать редиректы и детектировать петли;
- проходить challenge легально (cookie/JS в рамках теста) или фиксировать провал;
- сравнивать ответы для browser и bot UA;
- ждать JS и забирать shadow DOM/iframe;
- видеть скрытый текст и не путать его с видимым;
- распознавать soft 404;
- выбирать canonical при нескольких;
- уважать 429 и backoff.
