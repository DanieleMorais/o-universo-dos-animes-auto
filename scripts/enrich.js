// Remediação AdSense: engorda páginas de ferramenta (<500 palavras) com editorial único
// e reescreve posts finos (<450 palavras) pra 1300-1800. Marcadores evitam retrabalho.
const CLIENT_ID = process.env.BLOGGER_CLIENT_ID, CLIENT_SECRET = process.env.BLOGGER_CLIENT_SECRET, REFRESH = process.env.BLOGGER_REFRESH_TOKEN, BLOG_ID = process.env.BLOGGER_BLOG_ID;
const OR_KEY = process.env.OPENROUTER_API_KEY || "", SA_JSON = process.env.GOOGLE_SA_JSON || "";
const crypto = require("crypto");
if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH || !BLOG_ID) { console.error("Faltam secrets."); process.exit(1); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const wc = html => (html || "").replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
const b64url = x => Buffer.from(x).toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
const MARK_P = "<!--EDITORIAL-v1-->", MARK_A = "<!--EXPANDIDO-v1-->";

async function getToken() { const j = await (await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, refresh_token: REFRESH, grant_type: "refresh_token" }) })).json(); return j.access_token; }

async function callAI(prompt) {
  const GK = process.env.GEMINI_API_KEY;
  if (GK) for (const model of ["gemini-3.1-flash-lite", "gemini-flash-latest"]) for (let t = 0; t < 3; t++) { try { const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GK}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.8, maxOutputTokens: 8000 } }), signal: AbortSignal.timeout(120000) }); if (r.status === 429 || r.status >= 500) { await sleep(15000); continue; } if (!r.ok) break; const c = ((await r.json()).candidates?.[0]?.content?.parts || []).map(p => p.text || "").join("").trim(); if (c && c.length > 400) return c; } catch { await sleep(6000); } }
  for (let t = 0; t < 4; t++) { try { const r = await fetch("https://text.pollinations.ai/openai", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: "openai-fast", messages: [{ role: "user", content: prompt }], temperature: 0.8 }), signal: AbortSignal.timeout(90000) }); if (r.status === 429) { await sleep(20000); continue; } if (!r.ok) { await sleep(8000); continue; } const c = (await r.json()).choices?.[0]?.message?.content?.trim(); if (c && c.length > 400) return c; } catch { await sleep(6000); } }
  if (OR_KEY) for (const model of ["google/gemma-4-31b-it:free", "openai/gpt-oss-20b:free"]) for (let t = 0; t < 2; t++) { try { const r = await fetch("https://openrouter.ai/api/v1/chat/completions", { method: "POST", headers: { Authorization: "Bearer " + OR_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], temperature: 0.8, max_tokens: 6000 }), signal: AbortSignal.timeout(90000) }); if (r.status === 429 || r.status >= 500) { await sleep(12000); continue; } if (!r.ok) break; const c = (await r.json()).choices?.[0]?.message?.content?.trim(); if (c && c.length > 400) return c; } catch { await sleep(5000); } }
  return null;
}

function limpa(c) { return (c || "").replace(/^```(?:html)?\s*/i, "").replace(/\s*```\s*$/i, "").trim(); }

let saTok = null, saExp = 0;
async function notifyGoogle(url) { if (!SA_JSON) return; try { const sa = JSON.parse(SA_JSON); const now = Math.floor(Date.now() / 1000); if (!saTok || now > saExp) { const h = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" })); const c = b64url(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/indexing", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 })); const sig = b64url(crypto.sign("RSA-SHA256", Buffer.from(h + "." + c), sa.private_key)); const tr = await (await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: h + "." + c + "." + sig }) })).json(); saTok = tr.access_token; saExp = now + 3000; } if (saTok) await fetch("https://indexing.googleapis.com/v3/urlNotifications:publish", { method: "POST", headers: { Authorization: "Bearer " + saTok, "Content-Type": "application/json" }, body: JSON.stringify({ url, type: "URL_UPDATED" }) }); } catch {} }

// grava com backoff de cota; retorna "ok" | "quota" | "fail"
async function put(url, token, body) {
  for (let a = 0; a < 3; a++) {
    const r = await fetch(url, { method: "PUT", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (r.ok) return "ok";
    if (r.status === 401) return "auth";
    if (r.status === 403 || r.status === 429) { console.log("  quota, 45s..."); await sleep(45000); continue; }
    console.log("  FAIL", r.status, (await r.text()).slice(0, 120)); return "fail";
  }
  return "quota";
}

(async () => {
  let token = await getToken();
  let feitos = 0, pendentes = 0, quotaDead = false;

  // ===== PÁGINAS =====
  const pg = await (await fetch(`https://www.googleapis.com/blogger/v3/blogs/${BLOG_ID}/pages?fetchBodies=true&maxResults=50`, { headers: { Authorization: "Bearer " + token } })).json();
  for (const p of (pg.items || [])) {
    const c = p.content || "";
    if (c.includes(MARK_P) || wc(c) >= 500) continue;
    if (quotaDead) { pendentes++; continue; }
    console.log("PAGINA:", p.title, `(${wc(c)} palavras)`);
    const prompt = `Você é redator de um portal premium de animes para fãs brasileiros. A página institucional "${p.title}" está curta demais e precisa de conteúdo próprio e substancial.\n\nEscreva 800-1100 palavras adequadas ao propósito da página "${p.title}" (se for Sobre: a proposta editorial do portal, o que o leitor encontra, como o conteúdo é apurado, os temas cobertos; se for Contato: como e por que falar com a redação, tipos de contato, sugestões de pauta, prazos; se for Política de Privacidade ou Termos: texto completo, claro e em conformidade com a LGPD, cobrindo cookies, dados coletados, direitos do usuário, propriedade intelectual e conduta). Inclua <h2>Perguntas Frequentes</h2> com 4 <h3>. Português do Brasil, tom profissional e acessível. Não se identifique como IA. HTML puro com <h2>, <h3>, <p>, <ul><li> (sem h1, sem html/head/body, sem markdown). Comece direto com <h2>.`;
    const art = limpa(await callAI(prompt));
    if (!art || wc(art) < 400) { console.log("  geracao falhou, pulo"); pendentes++; continue; }
    const novo = c + `\n${MARK_P}\n<div class="editorial">${art}</div>`;
    const st = await put(`https://www.googleapis.com/blogger/v3/blogs/${BLOG_ID}/pages/${p.id}`, token, { ...p, content: novo });
    if (st === "auth") { token = await getToken(); pendentes++; continue; }
    if (st === "ok") { feitos++; console.log("  OK"); }
    else { pendentes++; if (st === "quota") quotaDead = true; }
    await sleep(1500);
  }

  // ===== POSTS FINOS =====
  let pageToken = "";
  const finos = [];
  do {
    const ps = await (await fetch(`https://www.googleapis.com/blogger/v3/blogs/${BLOG_ID}/posts?fetchBodies=true&maxResults=100${pageToken ? "&pageToken=" + pageToken : ""}`, { headers: { Authorization: "Bearer " + token } })).json();
    for (const p of (ps.items || [])) if (!(p.content || "").includes(MARK_A) && wc(p.content) < 450) finos.push(p);
    pageToken = ps.nextPageToken || "";
  } while (pageToken);
  console.log(`\n${finos.length} posts finos`);
  for (const p of finos) {
    if (quotaDead) { pendentes++; continue; }
    console.log("POST:", p.title.slice(0, 55), `(${wc(p.content)} palavras)`);
    const fig = (p.content.match(/<figure[\s\S]*?<\/figure>/i) || [""])[0];
    const prompt = `Você é redator de um portal premium de animes para fãs brasileiros. O post "${p.title}" está raso e precisa virar matéria completa.\n\nConteúdo atual (base factual, NÃO invente fatos além dele):\n${p.content.replace(/<[^>]+>/g, " ").slice(0, 2500)}\n\nReescreva com 1300-1800 palavras: contexto da obra/estúdio, por que importa pro fã, análise, o que esperar, e uma seção <h2>Perguntas Frequentes</h2> com 4 <h3>. Tom de fã especialista. NÃO indique pirataria/download — só plataformas legais (Crunchyroll, Netflix etc.). NADA de conteúdo +18. Não invente datas/números. Não se identifique como IA. HTML puro com <h2>, <h3>, <p>, <ul><li> (sem h1, sem html/head/body, sem markdown). Comece direto com <p>.`;
    const art = limpa(await callAI(prompt));
    if (!art || wc(art) < 700) { console.log("  geracao falhou, pulo"); pendentes++; continue; }
    const novo = `${fig}\n${MARK_A}\n${art}`;
    const st = await put(`https://www.googleapis.com/blogger/v3/blogs/${BLOG_ID}/posts/${p.id}`, token, { ...p, content: novo });
    if (st === "auth") { token = await getToken(); pendentes++; continue; }
    if (st === "ok") { feitos++; console.log("  OK"); notifyGoogle(p.url); }
    else { pendentes++; if (st === "quota") quotaDead = true; }
    await sleep(1500);
  }

  console.log(`\n=== enriquecidos: ${feitos} | pendentes: ${pendentes} ===`);
  if (pendentes === 0) console.log("TUDO-PRONTO");
})().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
