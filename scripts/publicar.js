// Publicação dos robôs: Blogger (padrão) ou motor próprio da Cloudflare (PUBLICAR_EM=cloudflare).
// Variáveis do motor novo: BLOG_URL (ex.: https://www.dinheironodiaadia.com) e BLOG_CHAVE (segredo do X-Chave).
// Retorno de publicar(): { url, status, erro }. Em falha HTTP do motor novo, status = 0 e o código real vai dentro de erro
// ("HTTP 401: ..."), para os laços de retry dos scripts (que reagem a 401/403/429 do Blogger) nunca repetirem à toa.
const env = k => (process.env[k] || "").replace(/^\uFEFF/, "").trim();
const PEDIDO = env("PUBLICAR_EM").toLowerCase();
const MODO = PEDIDO === "cloudflare" ? "cloudflare" : "blogger";
if (PEDIDO && PEDIDO !== "cloudflare" && PEDIDO !== "blogger") console.error(`⚠️ PUBLICAR_EM="${PEDIDO}" desconhecido; usando o Blogger.`);
const BASE = env("BLOG_URL").replace(/\/+$/, "");
const TIMEOUT_MS = 30000;

let tokenCache = null;
async function tokenBlogger() {
  if (tokenCache) return tokenCache;
  const r = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: process.env.BLOGGER_CLIENT_ID, client_secret: process.env.BLOGGER_CLIENT_SECRET, refresh_token: process.env.BLOGGER_REFRESH_TOKEN, grant_type: "refresh_token" }) });
  const j = await r.json();
  if (!j.access_token) throw new Error("token: " + JSON.stringify(j));
  return (tokenCache = j.access_token);
}

function exigirCredenciais(msgBlogger) {
  if (MODO === "cloudflare") {
    const falta = ["BLOG_URL", "BLOG_CHAVE"].filter(k => !env(k));
    if (falta.length) { console.error("❌ Faltam variáveis do motor novo: " + falta.join(" / ")); process.exit(1); }
    return;
  }
  const e = process.env;
  if (!e.BLOGGER_CLIENT_ID || !e.BLOGGER_CLIENT_SECRET || !e.BLOGGER_REFRESH_TOKEN || !e.BLOGGER_BLOG_ID) { console.error(msgBlogger); process.exit(1); }
}

async function publicar({ titulo, html, label, capa }) {
  if (MODO === "cloudflare") {
    let r;
    try {
      r = await fetch(`${BASE}/api/publicar`, { method: "POST", headers: { "Content-Type": "application/json", "X-Chave": env("BLOG_CHAVE") }, body: JSON.stringify({ titulo, html, labels: label ? [label] : [], capa }), signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) { return { status: 0, erro: "motor indisponível: " + e.message }; }
    const txt = await r.text();
    let j = null; try { j = JSON.parse(txt); } catch {}
    if (r.ok && j && j.url) return { url: j.url, path: j.path, id: j.id, status: r.status };
    return { status: 0, erro: `HTTP ${r.status}: ${(j && (j.error || j.erro)) || txt.slice(0, 200)}` };
  }
  const token = await tokenBlogger();
  const pr = await fetch(`https://www.googleapis.com/blogger/v3/blogs/${process.env.BLOGGER_BLOG_ID}/posts/?isDraft=false`, { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ kind: "blogger#post", title: titulo, content: html, labels: [label] }) });
  const pd = await pr.json();
  if (pr.status === 401) tokenCache = null;
  return { url: pd.url, status: pr.status, erro: pd.url ? undefined : (pd.error?.message || pd) };
}

// Lista de entradas do feed no formato do Blogger (feed.entry). Blogger: falha vira lista vazia, como sempre foi.
// Motor novo: falha lança erro (lista vazia faria o robô republicar tema repetido).
async function listarPublicados() {
  if (MODO === "cloudflare") {
    const r = await fetch(`${BASE}/feeds/posts/default?alt=json&max-results=500`, { headers: { "User-Agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!r.ok) throw new Error(`feed do motor novo: HTTP ${r.status}`);
    return ((await r.json()).feed || {}).entry || [];
  }
  try {
    const r = await fetch(`https://www.blogger.com/feeds/${process.env.BLOGGER_BLOG_ID}/posts/default?alt=json&max-results=500`, { headers: { "User-Agent": "Mozilla/5.0" } });
    return ((await r.json()).feed || {}).entry || [];
  } catch { return []; }
}

// Só para teste local (IA_DUBLE=1): artigo fixo de ~600 palavras com o título igual ao tema pedido no prompt.
function iaDuble(prompt) {
  const tema = ((prompt || "").match(/(?:sobre|about): "([^"]+)"/) || [])[1] || "Artigo de teste";
  const par = "Este parágrafo de teste existe apenas para validar a publicação automática do robô no motor novo, com texto corrido suficiente para passar nos filtros de tamanho mínimo.";
  let corpo = ""; for (let i = 1; i <= 5; i++) corpo += `<h2>Seção ${i}</h2>\n` + `<p>${par}</p>\n`.repeat(4);
  return `TITULO: ${tema}\nRESUMO: Resumo de teste do artigo dublê.\n${corpo}`;
}

module.exports = { publicar, listarPublicados, exigirCredenciais, iaDuble, MODO };
