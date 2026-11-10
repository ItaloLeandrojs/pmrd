// Peças comuns dos testes de ponta a ponta (e2e/*.mjs), adaptadas da skill ls-qualidade.
// - servidor(): serve uma pasta montada (dist ou dist-previa) sob a base /pmrd, em porta própria.
// - navegador(): abre o Edge instalado (channel "msedge") pelo Playwright de devDependency; nada é baixado.
// - semInternet(ctx): bloqueia todo pedido que não é localhost.
// - vigiarConsole(page): junta erros de console e de JavaScript da página.
// - placar(): confere(nome, cond) e fim() com código de saída 1 se algo falhou.
// Nenhum teste fala com o Supabase de verdade: o dist usa a chave pública mas a rede fica bloqueada,
// e as telas logadas vêm da prévia com cliente falso (e2e/previa).
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

export const PROJ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DIST = path.join(PROJ, "dist");
export const DIST_PREVIA = path.join(PROJ, "dist-previa");
export const BASE = "/pmrd";
export const PORTA = Number(process.env.E2E_PORTA) || 4411; // E2E_PORTA: rodar dois e2e ao mesmo tempo
export const PRINTS = path.join(PROJ, "e2e", "prints");

export const TELAS = [
  { nome: "390", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
  { nome: "1366", viewport: { width: 1366, height: 768 } },
  { nome: "1920", viewport: { width: 1920, height: 1080 } },
];

const TIPOS = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

/** Sobe um servidor estático para `raiz` sob a base /pmrd. Devolve a função de parar (parar.url = endereço da base). */
export async function servidor({ raiz = DIST, porta = PORTA } = {}) {
  if (!fs.existsSync(path.join(raiz, "index.html"))) {
    throw new Error(`Não achei ${path.join(raiz, "index.html")}. Monte antes (npm run build ou npm run previa:montar).`);
  }
  const srv = http.createServer((req, res) => {
    const url = new URL(req.url, "http://localhost");
    let rel = decodeURIComponent(url.pathname);
    if (rel !== BASE && !rel.startsWith(BASE + "/")) {
      res.writeHead(404).end("fora da base");
      return;
    }
    rel = rel.slice(BASE.length) || "/";
    let arq = path.join(raiz, rel);
    if (!arq.startsWith(raiz)) return void res.writeHead(403).end();
    if (fs.existsSync(arq) && fs.statSync(arq).isDirectory()) arq = path.join(arq, "index.html");
    if (!fs.existsSync(arq)) return void res.writeHead(404).end("não achei");
    res.writeHead(200, { "content-type": TIPOS[path.extname(arq)] ?? "application/octet-stream" });
    fs.createReadStream(arq).pipe(res);
  });
  await new Promise((ok, falha) => {
    srv.once("error", falha);
    srv.listen(porta, "127.0.0.1", ok);
  });
  const parar = () => new Promise((ok) => srv.close(() => ok()));
  parar.url = `http://localhost:${porta}${BASE}/`;
  return parar;
}

/** Edge instalado (canal "msedge"). Nada de navegador baixado pelo Playwright. */
export async function navegador(opcoes = {}) {
  return chromium.launch({ channel: "msedge", ...opcoes });
}

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/;
export const ehLocal = (url) => {
  try {
    return LOCAL.test(new URL(url).hostname);
  } catch {
    return false;
  }
};

/** Bloqueia todo pedido fora de localhost. Guarda os endereços barrados em ctx.barrados. */
export async function semInternet(ctx) {
  ctx.barrados = [];
  await ctx.route("**/*", (rota) => {
    const url = rota.request().url();
    if (ehLocal(url) || url.startsWith("data:") || url.startsWith("blob:")) return rota.continue();
    ctx.barrados.push(url);
    return rota.abort();
  });
}

const hostDe = (url) => {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
};

// Ruído conhecido, filtrado com precisão: o antivírus Kaspersky injeta um script de
// *.kaspersky-labs.com em toda página; pedidos e erros dele não são do site.
export function ruidoEsperado(mensagem) {
  const host = hostDe(mensagem.location()?.url ?? "");
  return host === "kaspersky-labs.com" || host.endsWith(".kaspersky-labs.com");
}

/** Junta erros de console (type "error") e de JavaScript. Devolve o array (vai enchendo). */
export function vigiarConsole(page, { avisos = false } = {}) {
  const erros = [];
  page.on("pageerror", (e) => erros.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    const tipo = m.type();
    if (tipo !== "error" && !(avisos && tipo === "warning")) return;
    if (ruidoEsperado(m)) return;
    erros.push(`${tipo}: ${m.text().slice(0, 160)} @ ${m.location()?.url ?? ""}`);
  });
  return erros;
}

/** Placar simples: confere(nome, cond, extra) e fim() sai com código 1 se algo falhou. */
export function placar(titulo, { silencioso = false } = {}) {
  const falhas = [];
  let total = 0;
  return {
    confere(nome, cond, extra = "") {
      total++;
      if (!cond) falhas.push(nome);
      if (!cond || !silencioso || process.env.E2E_VERBOSO) console.log(`${cond ? "ok    " : "FALHOU"} ${nome}${extra ? ` (${extra})` : ""}`);
      return cond;
    },
    falhas,
    fim() {
      console.log(`\n${titulo}: ${total - falhas.length}/${total} ok.`);
      if (falhas.length) {
        console.log(`${falhas.length} falha(s):\n- ${falhas.join("\n- ")}`);
        process.exitCode = 1;
      }
      return falhas.length === 0;
    },
  };
}

/** Abre uma tela da prévia (cliente falso, já logado) e espera o conteúdo. `hash` como "#/carteira". */
export async function abrirPrevia(page, urlBase, hash = "#/carteira") {
  await page.goto(`${urlBase}?previa=dentro${hash}`, { waitUntil: "load" });
  await page.locator("main").first().waitFor({ timeout: 10000 });
  if (hash.startsWith("#/carteira")) await page.getByRole("table", { name: "Carteira de projetos" }).waitFor({ timeout: 10000 });
  await page.waitForTimeout(400);
}

/** Escolhe "Todas" no seletor de regional do topo. */
export async function escolherTodas(page) {
  await page.getByRole("group", { name: "Regional" }).getByRole("button", { name: "Todas", exact: true }).click();
  await page.waitForTimeout(400);
}
