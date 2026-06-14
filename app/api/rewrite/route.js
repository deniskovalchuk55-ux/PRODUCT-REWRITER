export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req) {
  let stage = "старт";
  try {
    stage = "читання запиту";
    const { url, editNote } = await req.json();

    if (!url || !url.startsWith("http")) {
      return Response.json({ error: "Вкажи коректне посилання", stage }, { status: 400 });
    }

    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!firecrawlKey) {
      return Response.json({ error: "Не налаштований FIRECRAWL_API_KEY", stage }, { status: 500 });
    }
    if (!apiKey) {
      return Response.json({ error: "Не налаштований ANTHROPIC_API_KEY", stage }, { status: 500 });
    }

    // 1. Firecrawl рендерить сторінку (обходить захист) і повертає markdown
    stage = "завантаження сторінки (Firecrawl)";
    let pageContent = "";
    let meta = {};
    try {
      const fcRes = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${firecrawlKey}`,
        },
        body: JSON.stringify({
          url: url,
          formats: ["markdown"],
          onlyMainContent: true,
        }),
      });

      let fcData;
      const fcText = await fcRes.text();
      try {
        fcData = JSON.parse(fcText);
      } catch {
        return Response.json(
          { error: "Firecrawl повернув не JSON (можливо ліміт кредитів або захист сайту): " + fcText.slice(0, 200) },
          { status: 422 }
        );
      }

      if (!fcRes.ok || !fcData.success) {
        return Response.json(
          { error: "Firecrawl не зміг отримати сторінку: " + (fcData.error || fcRes.status) },
          { status: 422 }
        );
      }

      pageContent = fcData.data?.markdown || "";
      meta = fcData.data?.metadata || {};
    } catch (e) {
      return Response.json({ error: "Помилка Firecrawl: " + e.message }, { status: 422 });
    }

    if (!pageContent) {
      return Response.json({ error: "Сторінка порожня або не розпізнана" }, { status: 422 });
    }

    // 2. Claude пакує контент в унікальний пост
    stage = "обробка AI (Claude)";
    const prompt = `Ти — досвідчений копірайтер інтернет-магазину. Нижче вміст сторінки товару (markdown).
Створи УНІКАЛЬНИЙ структурований опис УКРАЇНСЬКОЮ мовою. НЕ копіюй текст дослівно — переформулюй своїми словами, але ЗБЕРЕЖИ всі факти, цифри та характеристики з джерела. НІЧОГО не відкидай — переноси всю змістовну інформацію.

ФОРМАТ ОПИСУ (поле "description") — ЧИСТИЙ HTML:
- Вступний абзац у <p>...</p>: повна назва, для кого товар, ключові переваги.
- Тематичні блоки: підзаголовок у <strong>...</strong> (або <h3>), далі список <ul><li>...</li></ul>.
- Блоки підбирай ПІД ТИП товару (для їжі: харчова цінність, склад, користь, способи вживання, зберігання; для техніки: особливості, функції, безпека, комплектація, сумісність; для інших — доречні).
- Ключові слова в тексті виділяй <b>...</b>.
- Зберігай ВСІ деталі з джерела: розʼєми, стандарти, режими, комплектацію, розміри, час роботи тощо.
- Заверши коротким підсумком у <p>...</p>.
- Використовуй ТІЛЬКИ HTML-теги <p> <strong> <b> <ul> <li> <h3> <br>. Без markdown.

ВМІСТ СТОРІНКИ:
${pageContent.slice(0, 12000)}

Поверни СТРОГО JSON без markdown:
{
  "title": "SEO-назва (див. нижче)",
  "article": "артикул/код товару якщо є, інакше порожньо",
  "description": "опис у форматі HTML за вимогами вище",
  "specs": [{"name": "название атрибута (рос)", "value": "значення (укр, як на сторінці)"}],
  "needs_more_specs": true/false,
  "seo_title": "SEO-заголовок до 60 символів (укр)",
  "seo_description": "SEO-опис до 160 символів (укр)"
}

ВАЖЛИВО про "specs" (атрибути для фільтрів Rozetka):
- Витягни ВСІ атрибути/характеристики, що є на сторінці-джерелі (Тип, Призначення, Бренд, Матеріал, Колір, Вага, Розмір, Обʼєм, Потужність тощо).
- "name" (назва атрибута) — РОСІЙСЬКОЮ (Вес, Материал, Цвет, Тип, Назначение, Бренд...).
- "value" (значення) — УКРАЇНСЬКОЮ, точно як вказано на сторінці-джерелі (не перекладай, не міняй формулювання — бери як є, щоб збігалося з Rozetka).
- НЕ вигадуй атрибутів, яких немає в джерелі.
- Якщо реальних атрибутів менше 8 — "needs_more_specs": true, інакше false.

ВАЖЛИВО про "title" (SEO-назва, УКРАЇНСЬКОЮ): будуй за гнучким принципом під цей товар:
[тип/категорія] + [уточнення типу] + [бренд і модель] + [ключові характеристики] + [розмір/обʼєм/вага] + [призначення/сценарії] + [колір].
Мета — щоб товар знаходився за багатьма пошуковими запитами. Пиши грамотно; де доречно — вживай популярне слово яким реально шукають (напр. "Павербанк"), але без нагромадження синонімів і без зміни звичних назв. Довжину обирай під товар.${editNote ? `\n\nДОДАТКОВА ВКАЗІВКА ВІД КОРИСТУВАЧА (обовʼязково врахуй при генерації): ${editNote}` : ""}`;

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      return Response.json({ error: "Помилка AI: " + errText }, { status: 502 });
    }

    const aiData = await aiRes.json();
    let text = aiData.content.map((c) => c.text || "").join("");
    text = text.replace(/```json|```/g, "").trim();

    stage = "розбір відповіді AI";
    let packaged;
    try {
      packaged = JSON.parse(text);
    } catch {
      packaged = { raw: text };
    }

    // 3. Пошук фото товару через OpenWeb Ninja Image Search (по назві)
    stage = "пошук фото (Ninja)";
    let imageCandidates = [];
    try {
      const ninjaKey = process.env.NINJA_API_KEY;
      const query = (packaged.title || meta.title || "").slice(0, 120);
      if (ninjaKey && query) {
        const ninjaUrl = "https://api.openwebninja.com/realtime-image-search/search?query=" + encodeURIComponent(query) + "&limit=20";
        const imgRes = await fetch(ninjaUrl, {
          method: "GET",
          headers: { "x-api-key": ninjaKey },
        });
        if (imgRes.ok) {
          const imgData = await imgRes.json();
          const results = imgData.data || [];
          const seen = new Set();
          for (const item of results) {
            // У Ninja: thumbnail_url = ВЕЛИКЕ оригінальне фото, url = маленька мініатюра Google
            const big = item.thumbnail_url || item.url;
            const w = item.thumbnail_width || item.width || 0;
            // беремо тільки достатньо великі (від 400px), щоб якість була нормальна
            if (big && !seen.has(big) && (w === 0 || w >= 400)) {
              seen.add(big);
              imageCandidates.push(big);
            }
            if (imageCandidates.length >= 14) break;
          }
        }
      }
    } catch (e) {
      // пошук фото не критичний — основна упаковка важливіша
    }

    return Response.json({
      source: {
        name: meta.title || "",
        image: meta.ogImage || "",
        url: url,
      },
      packaged,
      imageCandidates: imageCandidates.slice(0, 14),
    });
  } catch (err) {
    return Response.json({ error: "Помилка на етапі: " + stage + " — " + err.message, stage }, { status: 500 });
  }
}
