// Publica ATÉ 10 matérias com as últimas notícias de ANIME por execução (de 4 em 4h). Sem pirataria, sem +18.
const CLIENT_ID = process.env.BLOGGER_CLIENT_ID;
const CLIENT_SECRET = process.env.BLOGGER_CLIENT_SECRET;
const REFRESH = process.env.BLOGGER_REFRESH_TOKEN;
const BLOG_ID = process.env.BLOGGER_BLOG_ID;
const OR_KEY = process.env.OPENROUTER_API_KEY;
const IMG_BASE = process.env.IMG_BASE || "";
const SA_JSON = process.env.GOOGLE_SA_JSON || "";
const PER_RUN = parseInt(process.env.PER_RUN || "10", 10);
const crypto = require("crypto");
if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH || !BLOG_ID) { console.error("❌ Faltam secrets."); process.exit(1); }

const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const slugify = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "anime";
const b64url = x => Buffer.from(x).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

const QUERIES = [
  "anime lançamento nova temporada", "anime notícia trailer", "anime dublado Brasil", "Crunchyroll anime novidade",
  "mangá notícia capítulo", "anime estreia 2026", "anime adaptação confirmada", "One Piece Naruto Dragon Ball notícia",
  "anime Netflix novidade", "temporada de anime inverno verão", "anime recorde popularidade", "evento anime Brasil",
];
const CATS = ["Notícias", "Lançamentos", "Mangá", "Reviews", "Cultura Otaku", "Onde Assistir"];
const IMGQ = "anime style vibrant colorful dynamic dramatic scene";

async function getToken() { return (await (await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: REFRESH, grant_type: "refresh_token" }) })).json()).access_token; }
async function existentes() { try { const r = await fetch(`https://www.blogger.com/feeds/${BLOG_ID}/posts/default?alt=json&max-results=500`); return (((await r.json()).feed || {}).entry || []).map(e => norm(e.title.$t)); } catch { return []; } }
async function coletar() {
  const vistos = new Set(), lista = [];
  for (const q of QUERIES.slice().sort(() => 0.5 - Math.random())) {
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q + " when:20d")}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
      const xml = await (await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(9000) })).text();
      for (const it of (xml.match(/<item>([\s\S]*?)<\/item>/g) || [])) {
        const g = re => { const m = it.match(re); return m ? m[1] : ""; };
        const titulo = (g(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/) || "").replace(/&amp;/g, "&").replace(/&#39;/g, "'").trim();
        const fonte = g(/<source[^>]*>(.*?)<\/source>/); const k = norm(titulo).slice(0, 60);
        if (titulo.length > 22 && !vistos.has(k)) { vistos.add(k); lista.push({ titulo, fonte }); }
      }
    } catch {}
    await sleep(400);
  }
  return lista;
}
async function callAI(prompt) {
  if (OR_KEY) for (const model of ["openai/gpt-4o-mini", "meta-llama/llama-3.3-70b-instruct:free"]) for (let t = 0; t < 3; t++) {
    try {
      const r = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: { Authorization: "Bearer " + OR_KEY, "Content-Type": "application/json", "HTTP-Referer": "https://ouniversoanimes.blogspot.com", "X-Title": "O Mundo dos Animes" }, body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.85, max_tokens: 3000 }), signal: AbortSignal.timeout(90000) });
      if (r.status === 429 || r.status >= 500) { await sleep(10000); continue; }
      if (!r.ok) break;
      const c = (await r.json()).choices?.[0]?.message?.content?.trim(); if (c && c.length > 400) return c;
    } catch { await sleep(4000); }
  }
  for (let t = 0; t < 3; t++) { try { const r = await fetch("https://text.pollinations.ai/openai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "openai-fast", messages: [{ role: "user", content: prompt }], temperature: 0.8 }), signal: AbortSignal.timeout(90000) }); if (r.status === 429) { await sleep(20000); continue; } if (!r.ok) { await sleep(8000); continue; } const c = (await r.json()).choices?.[0]?.message?.content?.trim(); if (c && c.length > 400) return c; } catch { await sleep(6000); } }
  return null;
}
async function gerar(n) {
  const prompt = `Você é redator(a) de um portal de notícias de ANIMES em português. Escreva uma MATÉRIA envolvente e informativa (700-1100 palavras) inspirada nesta notícia recente:\n"${n.titulo}"${n.fonte ? " (fonte: " + n.fonte + ")" : ""}\n\nREGRAS: explique o contexto e por que importa pros fãs; atribua à fonte. NÃO invente datas/números que não estejam na manchete. Ao citar onde assistir, só plataformas legais. NADA de pirataria, download ou +18. Tom animado de fã, use você. Estrutura: <p> abertura, 4-6 <h2> com <h3>/<ul>, e <h2>O que isso significa pros fãs</h2>. NÃO copie a manchete no título. NÃO se identifique como IA. Sem html/head/body/h1 nem markdown.\n\nFORMATO:\nLinha 1: TITULO: <título reescrito, até 65 caracteres>\nLinha 2: RESUMO: <1-2 frases>\nDepois: corpo HTML puro (<p>).`;
  const c = await callAI(prompt); if (!c) return null;
  const titulo = (c.match(/TITULO:\s*(.+)/i)?.[1] || n.titulo).trim().replace(/^["#*\s]+|["*\s]+$/g, "").slice(0, 70);
  const resumo = (c.match(/RESUMO:\s*(.+)/i)?.[1] || "").trim();
  let corpo = /RESUMO:/i.test(c) ? c.replace(/^[\s\S]*?RESUMO:.*(?:\r?\n)+/i, "").trim() : c.replace(/^[\s\S]*?TITULO:.*(?:\r?\n)+/i, "").trim();
  corpo = corpo.replace(/^```(?:html)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  return corpo.length >= 450 ? { titulo, resumo, corpo } : null;
}
function montar(art, img, fonte) {
  const alt = (art.titulo || "anime").replace(/"/g, "");
  const fig = `<figure style="margin:0 0 24px"><img src="${img}" alt="${alt}" title="${alt}" style="width:100%;height:auto;border-radius:14px" /></figure>`;
  const tl = art.resumo ? `<div style="background:linear-gradient(135deg,#fdeef7,#f0eefe);border-left:5px solid #db2777;padding:18px 22px;border-radius:12px;margin:0 0 26px;font-size:1.05em"><strong style="color:#be185d">✨ Resumo rápido:</strong> ${art.resumo}</div>` : "";
  const font = `\n<div style="background:#fafafa;border:1px solid #eee;border-radius:12px;padding:14px 18px;margin:26px 0;font-size:.9em;color:#555"><strong>Fonte:</strong> matéria baseada no noticiário recente de anime${fonte ? " (como " + fonte + ")" : ""}.</div>`;
  const aviso = `\n<p style="font-size:.85em;color:#888;border-top:1px solid #eee;padding-top:14px;margin-top:26px"><em>Conteúdo para fãs. Assista pelos canais oficiais. 💜</em></p>`;
  return fig + tl + art.corpo + font + aviso;
}
let saTok = null, saExp = 0;
async function notifyGoogle(url) {
  if (!SA_JSON) return;
  try {
    const sa = JSON.parse(SA_JSON); const now = Math.floor(Date.now() / 1000);
    if (!saTok || now > saExp) {
      const h = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
      const c = b64url(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/indexing", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
      const sig = b64url(crypto.sign("RSA-SHA256", Buffer.from(h + "." + c), sa.private_key));
      const tr = await (await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: h + "." + c + "." + sig }) })).json();
      saTok = tr.access_token; saExp = now + 3000;
    }
    if (saTok) await fetch("https://indexing.googleapis.com/v3/urlNotifications:publish", { method: "POST", headers: { Authorization: "Bearer " + saTok, "Content-Type": "application/json" }, body: JSON.stringify({ url, type: "URL_UPDATED" }) });
  } catch {}
}
(async () => {
  const jaTitulos = await existentes();
  const jaTem = tit => { const w = norm(tit).split(" ").filter(x => x.length > 3); return jaTitulos.some(t => w.filter(x => t.includes(x)).length >= Math.max(4, Math.ceil(w.length * 0.7))); };
  let noticias = (await coletar()).filter(n => !jaTem(n.titulo));
  console.log("manchetes novas:", noticias.length, "| meta:", PER_RUN);
  let token = await getToken(); let ok = 0;
  for (let i = 0; i < noticias.length && ok < PER_RUN; i++) {
    const n = noticias[i]; const art = await gerar(n);
    if (!art || jaTem(art.titulo)) continue;
    const seed = Math.floor(Math.random() * 999999);
    const img = IMG_BASE ? `${IMG_BASE}/${slugify(art.titulo)}.webp?q=${encodeURIComponent(IMGQ)}&s=${seed}` : `https://image.pollinations.ai/prompt/${encodeURIComponent(IMGQ)}?width=1200&height=630&seed=${seed}&nologo=true`;
    const html = montar(art, img, n.fonte); const label = CATS[Math.floor(Math.random() * CATS.length)];
    let done = false;
    for (let a = 0; a < 3 && !done; a++) {
      const pr = await fetch(`https://www.googleapis.com/blogger/v3/blogs/${BLOG_ID}/posts/?isDraft=false`, { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ kind: "blogger#post", title: art.titulo, content: html, labels: [label] }) });
      const pd = await pr.json();
      if (pd.url) { ok++; done = true; jaTitulos.push(norm(art.titulo)); console.log(`${ok} OK: ${art.titulo.slice(0, 46)}`); notifyGoogle(pd.url); }
      else if (pr.status === 401) token = await getToken();
      else if (pr.status === 403 || pr.status === 429) { console.log("quota, 40s..."); await sleep(40000); }
      else { done = true; console.log("FALHA:", JSON.stringify(pd.error?.message || pd).slice(0, 100)); }
    }
    await sleep(1500);
  }
  console.log(`\n=== ${ok} matérias publicadas ===`);
})().catch(e => { console.error("FALHA GERAL:", e.message); process.exit(1); });
