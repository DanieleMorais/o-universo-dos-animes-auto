// SEED: publica até LIMIT artigos evergreen de ANIMES (PT-BR) no blog O Mundo dos Animes. Sem pirataria, sem +18.
const CLIENT_ID = process.env.BLOGGER_CLIENT_ID, CLIENT_SECRET = process.env.BLOGGER_CLIENT_SECRET, REFRESH = process.env.BLOGGER_REFRESH_TOKEN, BLOG_ID = process.env.BLOGGER_BLOG_ID;
const OR_KEY = process.env.OPENROUTER_API_KEY, IMG_BASE = process.env.IMG_BASE || "", SA_JSON = process.env.GOOGLE_SA_JSON || "", LIMIT = parseInt(process.env.LIMIT || "100", 10);
const crypto = require("crypto");
if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH || !BLOG_ID) { console.error("Missing secrets."); process.exit(1); }
const CAT = { Lancamentos: "Lançamentos", Noticias: "Notícias", Reviews: "Reviews", Onde: "Onde Assistir", Manga: "Mangá", Personagens: "Personagens", Generos: "Gêneros", Cultura: "Cultura Otaku" };
const IMGQ = { Lancamentos: "anime style vibrant action scene neon", Noticias: "anime style character colorful dramatic", Reviews: "anime style hero portrait cinematic", Onde: "anime watching cozy tv neon room", Manga: "manga panel black white dynamic art", Personagens: "anime character portrait detailed vibrant", Generos: "anime style romantic sunset colorful", Cultura: "anime convention crowd colorful japan" };
const POOL = [
["os melhores animes de todos os tempos","Reviews"],["melhores animes de romance para maratonar","Generos"],["melhores animes de acao que voce precisa ver","Generos"],["os shounen mais epicos ja feitos","Generos"],["melhores animes de comedia para rir alto","Generos"],["animes de terror e suspense para assistir a noite","Generos"],["melhores animes de fantasia e magia","Generos"],["melhores animes isekai para iniciantes","Generos"],["melhores animes na Netflix agora","Onde"],["onde assistir anime de graca e de forma legal","Onde"],["melhores animes na Crunchyroll para ver hoje","Onde"],["como comecar One Piece sem se perder","Reviews"],["animes curtos para maratonar em um fim de semana","Reviews"],["melhores animes para quem esta comecando","Reviews"],["animes com as melhores historias ja escritas","Reviews"],["as melhores aberturas de anime de todos os tempos","Cultura"],["os personagens mais fortes dos animes","Personagens"],["os viloes mais marcantes dos animes","Personagens"],["as melhores protagonistas femininas dos animes","Personagens"],["animes que superaram o manga original","Manga"],["shounen seinen e shoujo: entenda os generos","Cultura"],["o que significa ser otaku de verdade","Cultura"],["melhores animes de esporte para se inspirar","Generos"],["melhores animes de misterio e detetive","Generos"],["melhores filmes de anime que voce precisa ver","Reviews"],["melhores animes slice of life para relaxar","Generos"],["os maiores estudios de anime e suas obras-primas","Cultura"],["animes que viraram fenomeno mundial","Cultura"],["melhores animes de mecha e robos gigantes","Generos"],["animes com finais que chocaram os fas","Reviews"],["melhores animes psicologicos que mexem com a mente","Generos"],["os melhores casais dos animes","Personagens"],["trilhas sonoras de anime que sao obras-primas","Cultura"],["melhores mangas para quem ama anime","Manga"],["os animes mais aguardados de 2026","Lancamentos"],["guia completo dos arcos de One Piece","Reviews"],["por que Naruto ainda e um dos animes mais amados","Reviews"],["Jujutsu Kaisen explicado para novos fas","Reviews"],["Demon Slayer: por que todo mundo ama","Reviews"],["Attack on Titan e suas reviravoltas chocantes","Reviews"],["Chainsaw Man: por que conquistou o mundo","Reviews"],["Solo Leveling: do webtoon ao anime de sucesso","Manga"],["Spy x Family: o anime perfeito para todo mundo","Reviews"],["os melhores filmes do Studio Ghibli","Reviews"],["os melhores filmes de Makoto Shinkai","Reviews"],["melhores animes dark fantasy como Berserk","Generos"],["melhores animes de vampiros","Generos"],["melhores animes de viagem no tempo","Generos"],["melhores animes de culinaria e comida","Generos"],["melhores animes escolares","Generos"],["melhores animes de samurai e historia","Generos"],["melhores animes cyberpunk","Generos"],["melhores animes de jogos mentais e apostas","Generos"],["animes tristes que vao te fazer chorar","Reviews"],["animes wholesome para melhorar o dia","Reviews"],["animes subestimados que sao joias escondidas","Reviews"],["as maiores rivalidades dos animes","Personagens"],["as transformacoes mais iconicas dos animes","Personagens"],["manga ou anime: por onde comecar","Manga"],["manhwa e manga: qual a diferenca","Manga"],["melhores animes dublados em portugues","Onde"],["plataformas de streaming de anime comparadas","Onde"],["animes que merecem segunda temporada","Lancamentos"],["proximos filmes de anime para ficar de olho","Lancamentos"],
];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const slugify = s => (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "anime";
const b64url = x => Buffer.from(x).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
async function getToken() { const j = await (await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: REFRESH, grant_type: "refresh_token" }) })).json(); return j.access_token; }
async function existentes() { try { const r = await fetch(`https://www.blogger.com/feeds/${BLOG_ID}/posts/default?alt=json&max-results=500`); return (((await r.json()).feed || {}).entry || []).map(e => norm(e.title.$t)); } catch { return []; } }
async function callAI(prompt) {
  const GK = process.env.GEMINI_API_KEY;
  if (GK) for (const model of ["gemini-3.1-flash-lite", "gemini-flash-latest"]) for (let t = 0; t < 3; t++) { try { const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GK}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.85, maxOutputTokens: 8000 } }), signal: AbortSignal.timeout(120000) }); if (r.status === 429 || r.status >= 500) { await sleep(15000); continue; } if (!r.ok) break; const c = ((await r.json()).candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("").trim(); if (c && c.length > 400) return c; } catch { await sleep(6000); } }
  for (let t = 0; t < 4; t++) { try { const r = await fetch("https://text.pollinations.ai/openai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "openai-fast", messages: [{ role: "user", content: prompt }], temperature: 0.8 }), signal: AbortSignal.timeout(90000) }); if (r.status === 429) { await sleep(20000); continue; } if (!r.ok) { await sleep(8000); continue; } const c = (await r.json()).choices?.[0]?.message?.content?.trim(); if (c && c.length > 400) return c; } catch { await sleep(6000); } }
  if (OR_KEY) for (const model of ["google/gemma-4-31b-it:free", "openai/gpt-oss-20b:free"]) for (let t = 0; t < 2; t++) { try { const r = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: { Authorization: "Bearer " + OR_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.85, max_tokens: 6000 }), signal: AbortSignal.timeout(90000) }); if (r.status === 429 || r.status >= 500) { await sleep(12000); continue; } if (!r.ok) break; const c = (await r.json()).choices?.[0]?.message?.content?.trim(); if (c && c.length > 400) return c; } catch { await sleep(5000); } }
  return null;
}
async function gerar(tema) {
  const prompt = `Você é redator de um portal premium de animes para fãs brasileiros. Escreva um artigo EXCELENTE, original e apaixonado sobre: "${tema}".

REQUISITOS: 900-1400 palavras, tom de fã entusiasmado e informativo, com exemplos reais de animes. 5-7 <h2> com <h3>, <ul><li> e onde couber UMA <table> (ex: ranking). Fale com "você". Inclua uma seção <h2>Perguntas Frequentes</h2> com 4 <h3>. IMPORTANTE: NÃO indique links de pirataria/download; ao falar de onde assistir, cite só plataformas legais (Crunchyroll, Netflix etc.). NADA de conteúdo adulto/+18. Não invente datas/números específicos. Não se identifique como IA. Não escreva html/head/body/h1 nem markdown.

FORMATO (exato):
Linha 1: TITULO: <título até 65 caracteres>
Linha 2: RESUMO: <1-2 frases de valor>
Depois: corpo em HTML puro (começando com <p>).`;
  const c = await callAI(prompt); if (!c) return null;
  const titulo = (c.match(/TITULO:\s*(.+)/i)?.[1] || tema).trim().replace(/^["#*\s]+|["*\s]+$/g, "").slice(0, 70);
  const resumo = (c.match(/RESUMO:\s*(.+)/i)?.[1] || "").trim();
  let corpo = /RESUMO:/i.test(c) ? c.replace(/^[\s\S]*?RESUMO:.*(?:\r?\n)+/i, "").trim() : c.replace(/^[\s\S]*?TITULO:.*(?:\r?\n)+/i, "").trim();
  corpo = corpo.replace(/^```(?:html)?\s*/i, "").replace(/\s*```\s*$/i, "").trim();
  return corpo.length >= 500 ? { titulo, resumo, corpo } : null;
}
function montar(art, img, tema) {
  const alt = (art.titulo || tema || "anime").replace(/"/g, "");
  const fig = `<figure style="margin:0 0 24px"><img src="${img}" alt="${alt}" title="${alt}" style="width:100%;height:auto;border-radius:14px" /></figure>`;
  const tl = art.resumo ? `<div style="background:linear-gradient(135deg,#fdeef7,#f0eefe);border-left:5px solid #db2777;padding:18px 22px;border-radius:12px;margin:0 0 26px;font-size:1.05em"><strong style="color:#be185d">✨ Resumo rápido:</strong> ${art.resumo}</div>` : "";
  const aviso = `\n<p style="font-size:.85em;color:#888;border-top:1px solid #eee;padding-top:14px;margin-top:26px"><em>Conteúdo feito para fãs. Assista sempre pelos canais oficiais e legais. 💜</em></p>`;
  return fig + tl + art.corpo + aviso;
}
let saTok = null, saExp = 0;
async function notifyGoogle(url) { if (!SA_JSON) return; try { const sa = JSON.parse(SA_JSON); const now = Math.floor(Date.now() / 1000); if (!saTok || now > saExp) { const h = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" })); const c = b64url(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/indexing", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })); const sig = b64url(crypto.sign("RSA-SHA256", Buffer.from(h + "." + c), sa.private_key)); const tr = await (await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: h + "." + c + "." + sig }) })).json(); saTok = tr.access_token; saExp = now + 3000; } if (saTok) await fetch("https://indexing.googleapis.com/v3/urlNotifications:publish", { method: "POST", headers: { Authorization: "Bearer " + saTok, "Content-Type": "application/json" }, body: JSON.stringify({ url, type: "URL_UPDATED" }) }); } catch {} }
(async () => {
  const existe = await existentes();
  const jaTem = tema => { const w = norm(tema).split(" ").filter(x => x.length > 3); return existe.some(t => w.filter(x => t.includes(x)).length >= Math.max(4, Math.ceil(w.length * 0.7))); };
  const fila = POOL.filter(([t]) => !jaTem(t));
  console.log("candidates:", fila.length, "| limit:", LIMIT, "| already:", existe.length);
  let token = await getToken(); let ok = 0;
  for (let i = 0; i < fila.length && ok < LIMIT; i++) {
    const [tema, ck] = fila[i]; if (jaTem(tema)) continue;
    const art = await gerar(tema); if (!art || jaTem(art.titulo)) { console.log("skip:", tema.slice(0, 40)); continue; }
    const seed = Math.floor(Math.random() * 999999);
    const iq = IMGQ[ck] || "anime style vibrant colorful";
    const img = IMG_BASE ? `${IMG_BASE}/${slugify(art.titulo)}.webp?q=${encodeURIComponent(iq)}&s=${seed}` : `https://image.pollinations.ai/prompt/${encodeURIComponent(iq)}?width=1200&height=630&seed=${seed}&nologo=true`;
    const html = montar(art, img, tema); const label = CAT[ck] || "Anime";
    let done = false;
    for (let a = 0; a < 3 && !done; a++) { const pr = await fetch(`https://www.googleapis.com/blogger/v3/blogs/${BLOG_ID}/posts/?isDraft=false`, { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ kind: "blogger#post", title: art.titulo, content: html, labels: [label] }) }); const pd = await pr.json(); if (pd.url) { ok++; done = true; existe.push(norm(art.titulo)); console.log(`${ok} OK: ${art.titulo.slice(0, 50)}`); notifyGoogle(pd.url); } else if (pr.status === 401) token = await getToken(); else if (pr.status === 403 || pr.status === 429) { console.log("quota, 45s..."); await sleep(45000); } else { done = true; console.log("FAIL:", JSON.stringify(pd.error?.message || pd).slice(0, 100)); } }
    await sleep(1200);
  }
  console.log(`\n=== ${ok} articles published ===`);
})().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
