export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req) {
  try {
    const { url, editNote } = await req.json();

    if (!url || !url.startsWith("http")) {
      return Response.json({ error: "Вкажи коректне посилання" }, { status: 400 });
    }

    const firecrawlKey = process.env.FIRECRAWL_API_KEY;
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!firecrawlKey) {
      return Response.json({ error: "Не налаштований FIRECRAWL_API_KEY" }, { status: 500 });
    }
    if (!apiKey) {
      return Response.json({ error: "Не налаштований ANTHROPIC_API_KEY" }, { status: 500 });
    }

    // 1. Firecrawl рендерить сторінку (обходить захист) і повертає markdown
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

      const fcData = await fcRes.json();

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

    let packaged;
    try {
      packaged = JSON.parse(text);
    } catch {
      packaged = { raw: text };
    }

    // 3. Пошук фото-кандидатів по назві товару (до 14 штук)
    let imageCandidates = [];
    try {
      const query = (packaged.title || meta.title || "").slice(0, 120);
      if (query) {
        const searchRes = await fetch("https://api.firecrawl.dev/v1/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${firecrawlKey}`,
          },
          body: JSON.stringify({
            query: query,
            limit: 8,
            scrapeOptions: { formats: ["markdown"] },
          }),
        });
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const results = searchData.data || [];
          // витягуємо посилання на зображення з результатів
          const imgRegex = /https?:\/\/[^\s"')]+\.(?:jpg|jpeg|png|webp)/gi;
          const seen = new Set();
          for (const r of results) {
            const md = r.markdown || "";
            const ogImg = r.metadata?.ogImage;
            if (ogImg && !seen.has(ogImg)) { seen.add(ogImg); imageCandidates.push(ogImg); }
            const found = md.match(imgRegex) || [];
            for (const u of found) {
              if (!seen.has(u) && !u.includes("logo") && !u.includes("icon") && !u.includes("sprite")) {
                seen.add(u);
                imageCandidates.push(u);
              }
              if (imageCandidates.length >= 14) break;
            }
            if (imageCandidates.length >= 14) break;
          }
        }
      }
    } catch (e) {
      // пошук фото не критичний — якщо впав, просто без кандидатів
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
    return Response.json({ error: "Серверна помилка: " + err.message }, { status: 500 });
  }
}
