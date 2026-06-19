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
          onlyMainContent: false,
          waitFor: 2500,
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
Створи УНІКАЛЬНИЙ структурований опис УКРАЇНСЬКОЮ мовою. НЕ копіюй текст дослівно — переформулюй своїми словами, але ЗБЕРЕЖИ всі факти, цифри та характеристики з джерела.

🚫 НЕ ВКЛЮЧАЙ (ігноруй повністю, ніде — ні в описі, ні в назві, ні в характеристиках):
- умови продавця, правила магазину, інфо про продавця/постачальника;
- артикули, коди товару, SKU (і в назві теж НЕ вживай жодних артикулів/кодів);
- гарантійний термін, умови гарантії, обмін/повернення.
Це службова інформація конкретного продавця, вона НЕ потрібна.

⚠️ НЕ ВИГАДУЙ: використовуй ВИКЛЮЧНО реальні дані з джерела. Якщо якоїсь інформації немає на сторінці — не додавай її, не припускай, не вигадуй характеристики/факти. Краще менше, але правда.

ФОРМАТ ОПИСУ (поле "description") — ЧИСТИЙ HTML:
- Вступний абзац у <p>...</p>: повна назва, для кого товар, ключові переваги.
- Тематичні блоки: підзаголовок у <strong>...</strong> (або <h3>), далі список <ul><li>...</li></ul>.
- Блоки підбирай ПІД ТИП товару (для їжі: харчова цінність, склад, користь, способи вживання, зберігання; для техніки: особливості, функції, безпека, комплектація, сумісність; для інших — доречні).
- Ключові слова в тексті виділяй <b>...</b>.
- Зберігай реальні деталі з джерела: розʼєми, стандарти, режими, комплектацію, розміри, час роботи тощо.
- Заверши коротким підсумком у <p>...</p>.
- Використовуй ТІЛЬКИ HTML-теги <p> <strong> <b> <ul> <li> <h3> <br>. Без markdown.

ВМІСТ СТОРІНКИ:
${pageContent.slice(0, 25000)}

Поверни СТРОГО JSON без markdown:
{
  "title": "SEO-назва (див. нижче)",
  "description": "опис у форматі HTML за вимогами вище",
  "specs": [{"name": "название атрибута (рос)", "value": "значення (укр, як на сторінці)"}],
  "needs_more_specs": true/false,
  "seo_title": "SEO-заголовок до 60 символів (укр)",
  "seo_description": "SEO-опис до 160 символів (укр)"
}

ВАЖЛИВО про "specs" (атрибути для фільтрів Rozetka):
- КРИТИЧНО: знайди на сторінці БЛОК ХАРАКТЕРИСТИК і перенеси КОЖЕН рядок звідти — усі до єдиного, в тому порядку як на сторінці. НЕ пропускай жодного атрибута.
- Це стосується і СПЕЦИФІЧНИХ атрибутів категорії: напр. "Матеріал рами", "Тип кріплення", "Діаметр купола", "Сезон", "Кількість місць" тощо — їх часто забувають, але вони ОБОВʼЯЗКОВІ. Якщо такий атрибут є на сторінці — він МАЄ бути в specs.
- НЕ включай у specs: артикул/код, гарантію, інфо про продавця (це не характеристики товару).
- "name" (назва атрибута) — РОСІЙСЬКОЮ (Вес, Материал, Цвет, Тип, Назначение, Бренд, Материал рамы...).
- "value" (значення) — УКРАЇНСЬКОЮ, ТОЧНО як на сторінці-джерелі (дослівно, не узагальнюй: якщо "нержавіюча сталь" — пиши "нержавіюча сталь", а не "метал").
- НЕ вигадуй атрибутів, яких немає в джерелі.
- Якщо реальних атрибутів менше 8 — "needs_more_specs": true, інакше false.

ВАЖЛИВО про "title" (SEO-назва, УКРАЇНСЬКОЮ) — будуй СТРОГО за формулою, від загального до детального:
[Тип/Категорія товару] + [Бренд] + [Модель/Серія] + [Основні характеристики: колір, розмір, матеріал]
Приклади: "Повербанк Baseus Bipow 30000mAh чорний", "Термос Tramp Expedition 1.2 л сталевий", "Басейн Intex Easy Set 305 см блакитний".
Правила назви:
- Починай з ТИПУ товару — головного слова яким шукають.
- Вживай НАЙУЖИВАНІШУ пошукову форму слова разом, а не офіційну: пиши "Повербанк" (не "повер банк", не "портативний зарядний пристрій"). Бери слово яким реально шукають.
- БЕЗ артикулів/кодів у назві.
- Не дублюй слова (якщо модель містить тип — не повторюй тип двічі).
- Довжина назви — до 100 символів.
- Не нагромаджуй синонімів.${editNote ? `\n\nДОДАТКОВА ВКАЗІВКА ВІД КОРИСТУВАЧА (обовʼязково врахуй при генерації): ${editNote}` : ""}`;

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

    // 3. Фото — ДВА окремих джерела
    stage = "збір фото";
    let productImages = []; // зі сторінки-джерела (фото товару)
    let webImages = [];     // з інтернету (Ninja) — з посиланням-джерелом
    const seenImg = new Set();

    // нормалізація для дедуплікації (прибираємо різні розміри того ж фото Rozetka)
    const normKey = (u) => u.replace(/\/\d+x\d+\//, "/").replace(/_\d+x\d+/, "").split("?")[0];

    // 3.1 Фото зі сторінки-джерела (до 20)
    try {
      const addProduct = (u) => {
        if (!u) return;
        const k = normKey(u);
        if (!seenImg.has(k) &&
            !u.includes("logo") && !u.includes("icon") && !u.includes("sprite") && !u.includes("placeholder")) {
          seenImg.add(k);
          productImages.push(u);
        }
      };
      if (meta.ogImage) addProduct(meta.ogImage);
      const mdImg = /!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/gi;
      let m;
      while ((m = mdImg.exec(pageContent)) !== null) {
        if (/\.(jpg|jpeg|png|webp)/i.test(m[1])) addProduct(m[1]);
      }
      const rawImg = /https?:\/\/[^\s"')]+\.(?:jpg|jpeg|png|webp)/gi;
      const found = pageContent.match(rawImg) || [];
      for (const u of found) addProduct(u);
    } catch (e) {}
    productImages = productImages.slice(0, 20);

    // 3.2 Фото з інтернету через Ninja (до 15, кожне з посиланням-джерелом)
    stage = "пошук фото в інтернеті (Ninja)";
    try {
      const ninjaKey = process.env.NINJA_API_KEY;
      const query = (packaged.title || meta.title || "").slice(0, 120);
      if (ninjaKey && query) {
        const ninjaUrl = "https://api.openwebninja.com/realtime-image-search/search?query=" + encodeURIComponent(query) + "&limit=40";
        const imgRes = await fetch(ninjaUrl, {
          method: "GET",
          headers: { "x-api-key": ninjaKey },
        });
        if (imgRes.ok) {
          const imgData = await imgRes.json();
          const results = imgData.data || [];
          const big = [];
          for (const item of results) {
            const img = item.thumbnail_url || item.url; // велике фото
            const w = item.thumbnail_width || item.width || 0;
            const h = item.thumbnail_height || item.height || 0;
            const sourceLink = item.source_url || item.link || item.source || ""; // звідки фото
            if (img && w >= 600 && h >= 600) {
              big.push({ image: img, source: sourceLink, area: w * h });
            }
          }
          big.sort((a, b) => b.area - a.area);
          webImages = big.slice(0, 15).map((x) => ({ image: x.image, source: x.source }));
        }
      }
    } catch (e) {
      // пошук фото не критичний
    }

    return Response.json({
      source: {
        name: meta.title || "",
        image: meta.ogImage || "",
        url: url,
      },
      packaged,
      productImages,
      webImages,
      debug: { pageChars: pageContent.length, specsCount: (packaged.specs || []).length },
    });
  } catch (err) {
    return Response.json({ error: "Помилка на етапі: " + stage + " — " + err.message, stage }, { status: 500 });
  }
}
