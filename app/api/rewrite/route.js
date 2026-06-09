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
    const prompt = `Ти — копірайтер інтернет-магазину. Нижче вміст сторінки товару (markdown).
Створи УНІКАЛЬНИЙ, оригінальний пост українською — НЕ копіюй текст дослівно, переформулюй своїми словами.

ВМІСТ СТОРІНКИ:
${pageContent.slice(0, 6000)}

Поверни СТРОГО JSON без markdown:
{
  "title": "чітка приваблива назва товару",
  "article": "артикул/код товару якщо є в тексті, інакше порожньо",
  "description": "унікальний продаючий опис, 2-4 абзаци",
  "specs": [{"name": "Характеристика", "value": "значення"}],
  "seo_title": "SEO-заголовок до 60 символів",
  "seo_description": "SEO-опис до 160 символів"
}`;

    const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 2000,
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
