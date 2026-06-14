"use client";
import { useState } from "react";

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [selectedImages, setSelectedImages] = useState([]);
  const [editNote, setEditNote] = useState("");

  async function run(extra = {}) {
    if (!url.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/rewrite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), ...extra }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError((data.stage ? `[${data.stage}] ` : "") + (data.error || "Помилка"));
      } else {
        setResult(data);
      }
    } catch (e) {
      setError("Не вдалось зʼєднатись: " + e.message);
    }
    setLoading(false);
  }

  async function handleSubmit() {
    setResult(null);
    setSelectedImages([]);
    setEditNote("");
    await run();
  }

  async function handleRegenerate() {
    if (!editNote.trim()) return;
    await run({ editNote: editNote.trim() });
  }

  function toggleImage(src) {
    setSelectedImages((prev) =>
      prev.includes(src) ? prev.filter((s) => s !== src) : [...prev, src]
    );
  }

  function copy(text) {
    navigator.clipboard.writeText(text);
  }

  const p = result?.packaged;
  const candidates = result?.imageCandidates || [];

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "32px 20px", fontFamily: "system-ui, sans-serif", color: "#0f172a" }}>
      <h1 style={{ fontSize: 26, marginBottom: 6 }}>🛍️ Упаковка товару</h1>
      <p style={{ color: "#64748b", marginTop: 0, marginBottom: 24 }}>
        Встав посилання на товар — отримай унікальний опис, характеристики, SEO та фото.
      </p>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://..."
          style={{ flex: 1, padding: "12px 14px", borderRadius: 10, border: "1px solid #cbd5e1", fontSize: 15 }}
          onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
        />
        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{ padding: "12px 20px", borderRadius: 10, border: "none", background: "#2563eb", color: "#fff", fontSize: 15, fontWeight: 600, cursor: "pointer", opacity: loading ? 0.6 : 1 }}
        >
          {loading ? "Обробляю..." : "Упакувати"}
        </button>
      </div>

      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", color: "#991b1b", padding: 14, borderRadius: 10, marginBottom: 16, fontSize: 14 }}>
          ⚠️ {error}
        </div>
      )}

      {p && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <Card title="Назва" onCopy={() => copy(p.title)}>
            <div style={{ fontWeight: 600 }}>{p.title}</div>
          </Card>

          {p.article && (
            <Card title="Артикул" onCopy={() => copy(p.article)}>
              <div style={{ fontFamily: "monospace" }}>{p.article}</div>
            </Card>
          )}

          <Card title="Опис (HTML)" onCopy={() => copy(p.description)}>
            <div style={{ lineHeight: 1.5 }} dangerouslySetInnerHTML={{ __html: p.description }} />
          </Card>

          {p.specs && p.specs.length > 0 && (
            <Card title={`Характеристики (${p.specs.length})`} onCopy={() => copy(p.specs.map((s) => `${s.name}: ${s.value}`).join("\n"))}>
              {p.needs_more_specs && (
                <div style={{ background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", padding: "8px 10px", borderRadius: 8, fontSize: 13, marginBottom: 10 }}>
                  ⚠️ Характеристик небагато ({p.specs.length}). Варто дошукати дані по точній моделі.
                </div>
              )}
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <tbody>
                  {p.specs.map((s, i) => (
                    <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "6px 8px", color: "#64748b" }}>{s.name}</td>
                      <td style={{ padding: "6px 8px", fontWeight: 500 }}>{s.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          {(p.seo_title || p.seo_description) && (
            <Card title="SEO" onCopy={() => copy(`${p.seo_title}\n${p.seo_description}`)}>
              <div style={{ fontSize: 14 }}><b>Title:</b> {p.seo_title}</div>
              <div style={{ fontSize: 14, marginTop: 4 }}><b>Description:</b> {p.seo_description}</div>
            </Card>
          )}

          {/* Поле редагування / перегенерації */}
          <Card title="Що змінити (перегенерувати)">
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 8 }}>
              Напиши що виправити — напр. "зроби опис коротшим", "прибери блок про зберігання", "додай більше про безпеку".
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={editNote}
                onChange={(e) => setEditNote(e.target.value)}
                placeholder="Що змінити..."
                style={{ flex: 1, padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1", fontSize: 14 }}
                onKeyDown={(e) => e.key === "Enter" && handleRegenerate()}
              />
              <button
                onClick={handleRegenerate}
                disabled={loading || !editNote.trim()}
                style={{ padding: "10px 16px", borderRadius: 8, border: "none", background: "#16a34a", color: "#fff", fontSize: 14, fontWeight: 600, cursor: "pointer", opacity: (loading || !editNote.trim()) ? 0.5 : 1 }}
              >
                {loading ? "..." : "Перегенерувати"}
              </button>
            </div>
          </Card>

          {/* Фото-кандидати з вибором */}
          {candidates.length > 0 && (
            <Card
              title={`Фото — обери потрібні (${selectedImages.length} вибрано)`}
              onCopy={selectedImages.length ? () => copy(selectedImages.join("\n")) : null}
            >
              <div style={{ fontSize: 13, color: "#64748b", marginBottom: 10 }}>
                Спочатку фото з джерела (Rozetka), далі добір з пошуку. Клікни щоб вибрати. ⚠️ Бери якісні офіційні фото / від постачальника.
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))", gap: 8 }}>
                {candidates.map((src, i) => {
                  const sel = selectedImages.includes(src);
                  return (
                    <div
                      key={i}
                      onClick={() => toggleImage(src)}
                      style={{
                        position: "relative", cursor: "pointer", borderRadius: 8, overflow: "hidden",
                        border: sel ? "3px solid #2563eb" : "1px solid #e2e8f0", aspectRatio: "1",
                      }}
                    >
                      <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      {sel && (
                        <div style={{ position: "absolute", top: 4, right: 4, background: "#2563eb", color: "#fff", borderRadius: "50%", width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>✓</div>
                      )}
                    </div>
                  );
                })}
              </div>
              {selectedImages.length > 0 && (
                <div style={{ marginTop: 10, fontSize: 13, color: "#475569" }}>
                  Вибрано {selectedImages.length}. Кнопка "Копіювати" згори дасть посилання на вибрані фото.
                </div>
              )}
            </Card>
          )}

          {p.raw && (
            <Card title="Відповідь AI" onCopy={() => copy(p.raw)}>
              <div style={{ whiteSpace: "pre-wrap", fontSize: 13 }}>{p.raw}</div>
            </Card>
          )}
        </div>
      )}
    </main>
  );
}

function Card({ title, children, onCopy }) {
  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: 0.5 }}>{title}</div>
        {onCopy && (
          <button onClick={onCopy} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 6, border: "1px solid #cbd5e1", background: "#fff", cursor: "pointer" }}>
            Копіювати
          </button>
        )}
      </div>
      {children}
    </div>
  );
}
