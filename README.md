# Упаковка товару (AI + Firecrawl)

Встав посилання на товар → Firecrawl рендерить сторінку (обходить захист) →
Claude переписує в унікальний пост (назва, опис, характеристики, SEO).

## Налаштування
1. npm install
2. Зареєструйся на firecrawl.dev → отримай API-ключ (є безкоштовний trial)
3. Отримай ключ Anthropic (console.anthropic.com)
4. Створи `.env.local`:
   FIRECRAWL_API_KEY=твій_ключ_firecrawl
   ANTHROPIC_API_KEY=твій_ключ_anthropic
5. npm run dev → http://localhost:3000

## Деплой на Vercel
1. Залий у GitHub
2. Vercel → New Project → імпортуй
3. Environment Variables:
   FIRECRAWL_API_KEY = ...
   ANTHROPIC_API_KEY = ...
4. Deploy

## Чому Firecrawl
Багато сайтів (Rozetka й навіть дрібні магазини) блокують прямі запити (403/Cloudflare).
Firecrawl рендерить сторінку через справжній браузер і повертає чистий контент.
Безкоштовний trial обмежений — далі платно.

## Важливо
- Опис AI робить УНІКАЛЬНИМ (рерайт), не копію.
- Фото бери офіційні від постачальника/виробника, не копіюй чужі файли в магазин.
