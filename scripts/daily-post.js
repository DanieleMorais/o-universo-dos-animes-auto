// Robô diário: publica 1 artigo premium sobre ANIMES no blog "O Mundo dos Animes".
// Conteúdo 100% original (notícias, reviews, guias) — SEM pirataria, SEM +18. Imagens estilo anime via IA.
const CLIENT_ID = process.env.BLOGGER_CLIENT_ID;
const CLIENT_SECRET = process.env.BLOGGER_CLIENT_SECRET;
const REFRESH = process.env.BLOGGER_REFRESH_TOKEN;
const BLOG_ID = process.env.BLOGGER_BLOG_ID;
const IMG_BASE = process.env.IMG_BASE || "";

if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH || !BLOG_ID) { console.error("❌ Faltam secrets do Blogger."); process.exit(1); }

const NEWS_Q = {
  Lancamentos: "anime lançamento nova temporada estreia",
  Noticias: "anime notícia trailer dublado Crunchyroll",
  Reviews: "melhor anime recomendação para assistir",
  Onde: "onde assistir anime legal streaming",
  Manga: "mangá novo capítulo notícia",
  Personagens: "anime personagem popular",
  Generos: "melhores animes romance ação shounen",
  Cultura: "cultura otaku anime Brasil evento",
};
const IMG_Q = {
  Lancamentos: "anime style vibrant action scene neon",
  Noticias: "anime style character colorful dramatic",
  Reviews: "anime style hero portrait cinematic",
  Onde: "anime watching cozy tv neon room",
  Manga: "manga panel black white dynamic art",
  Personagens: "anime character portrait detailed vibrant",
  Generos: "anime style romantic sunset colorful",
  Cultura: "anime convention crowd colorful japan",
};
const CAT_LABEL = { Lancamentos: "Lançamentos", Noticias: "Notícias", Reviews: "Reviews", Onde: "Onde Assistir", Manga: "Mangá", Personagens: "Personagens", Generos: "Gêneros", Cultura: "Cultura Otaku" };

// Pool de temas (mirando nas buscas reais: melhores animes, gêneros, guias, onde assistir)
const POOL = [
  ["os melhores animes de todos os tempos para assistir", "Reviews"],
  ["melhores animes de romance para maratonar", "Generos"],
  ["melhores animes de ação e luta que você precisa ver", "Generos"],
  ["animes shounen mais épicos de todos os tempos", "Generos"],
  ["melhores animes de comédia para rir muito", "Generos"],
  ["animes de terror e suspense para arrepiar", "Generos"],
  ["melhores animes de fantasia e magia", "Generos"],
  ["animes isekai: os melhores para começar", "Generos"],
  ["melhores animes dublados em português", "Onde"],
  ["onde assistir animes de graça e de forma legal", "Onde"],
  ["animes na Netflix que valem a pena", "Onde"],
  ["melhores animes da Crunchyroll para assistir agora", "Onde"],
  ["como começar a assistir One Piece sem se perder", "Reviews"],
  ["a ordem cronológica para assistir animes clássicos", "Reviews"],
  ["animes curtos para maratonar em um fim de semana", "Reviews"],
  ["melhores animes para quem está começando no mundo otaku", "Reviews"],
  ["animes com as melhores histórias e roteiros", "Reviews"],
  ["melhores aberturas de anime de todos os tempos", "Cultura"],
  ["os personagens de anime mais fortes já criados", "Personagens"],
  ["os vilões mais marcantes dos animes", "Personagens"],
  ["as protagonistas femininas mais incríveis dos animes", "Personagens"],
  ["animes baseados em mangás que superaram a obra", "Manga"],
  ["diferença entre anime, mangá, light novel e webtoon", "Cultura"],
  ["o que significa ser otaku: cultura e curiosidades", "Cultura"],
  ["gêneros de anime explicados: shounen, seinen, shoujo e mais", "Cultura"],
  ["melhores animes de esporte para se inspirar", "Generos"],
  ["animes de mistério e investigação imperdíveis", "Generos"],
  ["melhores filmes de anime para assistir", "Reviews"],
  ["animes de slice of life para relaxar", "Generos"],
  ["melhores estúdios de anime e suas obras marcantes", "Cultura"],
  ["animes que viraram fenômeno mundial", "Cultura"],
  ["melhores animes de mechas e robôs gigantes", "Generos"],
  ["como a cultura otaku cresceu no Brasil", "Cultura"],
  ["animes com finais que marcaram os fãs", "Reviews"],
  ["trilhas sonoras de anime que são obras-primas", "Cultura"],
];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
function slugify(s) { return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "anime"; }

async function getToken() {
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: REFRESH, grant_type: "refresh_token" }) });
  const j = await r.json();
  if (!j.access_token) throw new Error("token: " + JSON.stringify(j));
  return j.access_token;
}
async function titulosExistentes() {
  try { const r = await fetch(`https://www.blogger.com/feeds/${BLOG_ID}/posts/default?alt=json&max-results=500`, { headers: { "User-Agent": "Mozilla/5.0" } }); return (((await r.json()).feed || {}).entry || []).map(e => norm(e.title.$t)); } catch { return []; }
}
async function buscarNoticias(catKey) {
  const query = NEWS_Q[catKey] || "anime novidade";
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query + " when:30d")}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
    const xml = await (await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(9000) })).text();
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || [];
    return items.slice(0, 4).map(it => { const g = re => { const m = it.match(re); return m ? m[1] : ""; }; return { titulo: (g(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/) || "").replace(/&amp;/g, "&"), fonte: g(/<source[^>]*>(.*?)<\/source>/) }; }).filter(n => n.titulo);
  } catch { return []; }
}
const OR_KEY = process.env.OPENROUTER_API_KEY || "";
async function callAI(prompt) {
  const GK = process.env.GEMINI_API_KEY;
  if (GK) for (const model of ["gemini-3.1-flash-lite", "gemini-flash-latest"]) for (let t = 0; t < 3; t++) { try { const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GK}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.85, maxOutputTokens: 8000 } }), signal: AbortSignal.timeout(120000) }); if (r.status === 429 || r.status >= 500) { await sleep(15000); continue; } if (!r.ok) break; const c = ((await r.json()).candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("").trim(); if (c && c.length > 400) return c; } catch { await sleep(6000); } }
  for (let t = 0; t < 4; t++) { try { const r = await fetch("https://text.pollinations.ai/openai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "openai-fast", messages: [{ role: "user", content: prompt }], temperature: 0.8 }), signal: AbortSignal.timeout(90000) }); if (r.status === 429) { await sleep(20000); continue; } if (!r.ok) { await sleep(8000); continue; } const c = (await r.json()).choices?.[0]?.message?.content?.trim(); if (c && c.length > 400) return c; } catch { await sleep(6000); } }
  if (OR_KEY) for (const model of ["google/gemma-4-31b-it:free", "openai/gpt-oss-20b:free"]) for (let t = 0; t < 2; t++) { try { const r = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: { Authorization: "Bearer " + OR_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.85, max_tokens: 6000 }), signal: AbortSignal.timeout(90000) }); if (r.status === 429 || r.status >= 500) { await sleep(12000); continue; } if (!r.ok) break; const c = (await r.json()).choices?.[0]?.message?.content?.trim(); if (c && c.length > 400) return c; } catch { await sleep(5000); } }
  return null;
}
async function gerar(tema, noticias) {
  const ctx = noticias.length ? `\n\nNOTÍCIAS RECENTES DE ANIME (use como gancho se fizer sentido, cite a fonte):\n${noticias.map(n => "- " + n.titulo + " (" + n.fonte + ")").join("\n")}` : "";
  const prompt = `Você é redator(a) de um portal premium de animes em português (fãs otaku). Escreva um artigo EXTREMAMENTE bom, original e envolvente sobre: "${tema}".${ctx}\n\nEXIGÊNCIAS: 900-1400 palavras, apaixonado e informativo, com exemplos de títulos reais e explicações. 5-7 <h2> com <h3>, <ul><li> e onde couber UMA <table> (ex: ranking). Tom animado de fã, use você. Seção <h2>Perguntas frequentes</h2> com 4 <h3>. IMPORTANTE: NÃO forneça links de pirataria/download; ao falar de onde assistir, cite apenas plataformas legais (Crunchyroll, Netflix, etc.). NADA de conteúdo adulto/+18. NÃO invente datas/números específicos. NÃO se identifique como IA. NÃO escreva html/head/body/h1 nem markdown.\n\nFORMATO (exato):\nLinha 1: TITULO: <título até 65 caracteres>\nLinha 2: RESUMO: <1-2 frases>\nDepois: corpo em HTML puro (começando com <p>).`;
  const c = await callAI(prompt);
  if (!c) return null;
  const titulo = (c.match(/TITULO:\s*(.+)/i)?.[1] || tema).trim().replace(/^["#*\s]+|["*\s]+$/g, "").slice(0, 70);
  const resumo = (c.match(/RESUMO:\s*(.+)/i)?.[1] || "").trim();
  let corpo = /RESUMO:/i.test(c) ? c.replace(/^[\s\S]*?RESUMO:.*(?:\r?\n)+/i, "").trim() : c.replace(/^[\s\S]*?TITULO:.*(?:\r?\n)+/i, "").trim();
  corpo = corpo.replace(/^```(?:html)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  return corpo.length >= 500 ? { titulo, resumo, corpo } : null;
}
function montar(art, img, tema, noticias) {
  const alt = (art.titulo || tema || "anime").replace(/"/g, "");
  const fig = `<figure style="margin:0 0 24px"><img src="${img}" alt="${alt}" title="${alt}" style="width:100%;height:auto;border-radius:14px" /></figure>`;
  const tl = art.resumo ? `<div style="background:linear-gradient(135deg,#fdeef7,#f0eefe);border-left:5px solid #db2777;padding:18px 22px;border-radius:12px;margin:0 0 26px;font-size:1.05em"><strong style="color:#be185d">✨ Resumo rápido:</strong> ${art.resumo}</div>` : "";
  const fontes = noticias.length ? `\n<div style="background:#fafafa;border:1px solid #eee;border-radius:12px;padding:14px 18px;margin:26px 0;font-size:.9em;color:#555"><strong>Fonte e atualidade:</strong> considera o noticiário recente sobre animes${noticias[0]?.fonte ? " (como " + noticias[0].fonte + ")" : ""}.</div>` : "";
  const aviso = `\n<p style="font-size:.85em;color:#888;border-top:1px solid #eee;padding-top:14px;margin-top:26px"><em>Conteúdo informativo e opinativo para fãs. Assista sempre pelos canais oficiais e legais. 💜</em></p>`;
  return fig + tl + art.corpo + fontes + aviso;
}
const crypto = require("crypto");
function b64url(x) { return Buffer.from(x).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_"); }
async function notifyGoogle(postUrl) {
  const raw = process.env.GOOGLE_SA_JSON;
  if (!raw || !postUrl) return;
  try {
    const sa = JSON.parse(raw); const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/indexing", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
    const sig = b64url(crypto.sign("RSA-SHA256", Buffer.from(header + "." + claim), sa.private_key));
    const tr = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: header + "." + claim + "." + sig }) });
    const tk = (await tr.json()).access_token; if (!tk) return;
    const r = await fetch("https://indexing.googleapis.com/v3/urlNotifications:publish", { method: "POST", headers: { Authorization: "Bearer " + tk, "Content-Type": "application/json" }, body: JSON.stringify({ url: postUrl, type: "URL_UPDATED" }) });
    console.log("Indexing:", r.status === 200 ? "✅" : r.status);
  } catch (e) { console.log("Indexing erro:", e.message); }
}

(async () => {
  const existentes = await titulosExistentes();
  const jaTem = tema => { const w = norm(tema).split(" ").filter(x => x.length > 3); return existentes.some(t => w.filter(x => t.includes(x)).length >= Math.max(3, Math.ceil(w.length * 0.6))); };
  const candidatos = POOL.filter(([tema]) => !jaTem(tema));
  if (!candidatos.length) { console.log("Pool esgotado."); return; }
  const [tema, catKey] = candidatos[Math.floor(Math.random() * candidatos.length)];
  console.log("Tema:", tema, "| cat:", catKey);
  const noticias = await buscarNoticias(catKey);
  const art = await gerar(tema, noticias);
  if (!art) { console.error("❌ Geração falhou."); process.exit(1); }
  const seed = Math.floor(Date.now() % 999999);
  const iq = IMG_Q[catKey] || "anime style vibrant colorful";
  const img = IMG_BASE ? `${IMG_BASE}/${slugify(art.titulo)}.webp?q=${encodeURIComponent(iq)}&s=${seed}` : `https://image.pollinations.ai/prompt/${encodeURIComponent(iq)}?width=1200&height=630&seed=${seed}&nologo=true`;
  const html = montar(art, img, tema, noticias);
  const label = CAT_LABEL[catKey] || "Animes";
  const token = await getToken();
  const pr = await fetch(`https://www.googleapis.com/blogger/v3/blogs/${BLOG_ID}/posts/?isDraft=false`, { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ kind: "blogger#post", title: art.titulo, content: html, labels: [label] }) });
  const pd = await pr.json();
  if (pd.url) { console.log("✅ PUBLICADO:", art.titulo, "→", pd.url); await notifyGoogle(pd.url); }
  else { console.error("❌ FALHA:", JSON.stringify(pd.error?.message || pd).slice(0, 200)); process.exit(1); }
})().catch(e => { console.error("FALHA GERAL:", e.message); process.exit(1); });
