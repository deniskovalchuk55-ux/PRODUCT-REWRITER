export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req) {
  try {
    const { url } = await req.json();

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
Створи УНІКАЛЬНИЙ структурований опис українською. НЕ копіюй текст дослівно — переформулюй своїми словами, але ЗБЕРЕЖИ всі факти, цифри та характеристики з джерела.

ВИМОГИ ДО ОПИСУ (поле "description"):
1. Почни з розгорнутого вступного абзацу прозою: повна назва товару, для кого він, ключові переваги та особливості (2-4 речення, природно й продаюче).
2. Далі додай ТЕМАТИЧНІ БЛОКИ з підзаголовками — підбирай їх ПІД ТИП товару:
   - для їжі: Харчова цінність (на 100 г), Склад, Користь, Способи вживання, Умови зберігання
   - для техніки/електроніки: Особливості, Функції, Безпека, Комплектація, Сумісність
   - для інших товарів: доречні саме для них блоки
3. Усередині блоків використовуй марковані списки (рядки що починаються з "• ").
4. Зберігай конкретні цифри (вага, обʼєм, потужність, калорійність тощо) — вони важливі.
5. Заверши коротким підсумком-закликом.
6. Розділяй блоки порожнім рядком. Підзаголовки пиши з нового рядка, далі двокрапка.
7. Обсяг — детальний (як гарний товарний опис), але без води та повторів.

ВМІСТ СТОРІНКИ:
${pageContent.slice(0, 6000)}

Поверни СТРОГО JSON без markdown (description може містити переноси рядків \\n):
{
  "title": "SEO-НАЗВА за пошуковою логікою (див. нижче)",
  "article": "артикул/код товару якщо є в тексті, інакше порожньо",
  "description": "структурований опис за вимогами вище (з \\n для переносів і • для списків)",
  "specs": [{"name": "Характеристика", "value": "значення"}],
  "seo_title": "SEO-заголовок до 60 символів",
  "seo_description": "SEO-опис до 160 символів"
}

ВАЖЛИВО про "specs": бери ТІЛЬКИ ті характеристики, що реально є у вмісті сторінки (вага, обʼєм, матеріал, потужність, склад тощо). НЕ вигадуй і НЕ додавай характеристик, яких немає в джерелі — краще менше, але точні. Якщо характеристик немає взагалі — поверни порожній масив.

ВАЖЛИВО про "title" (SEO-назва): будуй її за ГНУЧКИМ принципом, включаючи те що доречне саме для ЦЬОГО товару:
[тип/категорія] + [уточнення типу: наливний/надувний/розкладний/смажений/антибактеріальний тощо] + [бренд і модель якщо є] + [ключові характеристики] + [розмір/обʼєм/вага] + [призначення або сценарії використання — як синоніми під різні пошукові запити] + [колір якщо є].
Мета — щоб товар знаходився за БАГАТЬМА пошуковими запитами (різні люди шукають по-різному). Приклади стилю:
- "Дитячий наливний басейн Intex Easy Set Pool сімейний круглий тришаровий 183х51 см Blue"
- "Термос із подвійною стінкою 0,5 л компактний туристичний Tramp Expedition Line"
- "Антибактеріальний засіб проти цвілі та грибка 6 штук універсальний дезінфікуючий спрей SAVO"
Назва має лишатись читабельною (не безладний набір слів). Довжину обирай під товар сам — десь коротше, десь довше.`;

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 3000,
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

    return Response.json({
      source: {
        name: meta.title || "",
        image: meta.ogImage || "",
        url: url,
      },
      packaged,
    });
  } catch (err) {
    return Response.json({ error: "Серверна помилка: " + err.message }, { status: 500 });
  }
}
