// Prints para olhar com os olhos (texto cortado, sobreposição, buraco): login, Carteira, Carteira com ficha
// e Configurações, em 390x844, 1366x768 e 1920x1080, claro e escuro. Pela prévia de dados falsos, sem rede.
// Saída: PRINTS_PASTA, ou e2e/prints (pasta ignorada pelo Git).
// Uso: npm run build && npm run previa:montar && node e2e/prints.mjs
import fs from "node:fs";
import path from "node:path";
import { servidor, navegador, semInternet, DIST, DIST_PREVIA, PORTA, PRINTS } from "./util.mjs";
import { CENAS } from "./cenas.mjs";

const SAIDA = process.env.PRINTS_PASTA || PRINTS;
const QUAIS = ["login", "carteira-todas", "carteira-ficha", "configuracoes-equipes"];
const TELAS = [
  ["390", { width: 390, height: 844 }, { isMobile: true, hasTouch: true }],
  ["1366", { width: 1366, height: 768 }, {}],
  ["1920", { width: 1920, height: 1080 }, {}],
];
fs.mkdirSync(SAIDA, { recursive: true });
const paraDist = await servidor({ raiz: DIST, porta: PORTA });
const paraPrevia = await servidor({ raiz: DIST_PREVIA, porta: PORTA + 1 });
const browser = await navegador();
try {
  for (const [tela, viewport, extra] of TELAS) {
    for (const esquema of ["light", "dark"]) {
      const ctx = await browser.newContext({ viewport, colorScheme: esquema, ...extra });
      await semInternet(ctx);
      for (const cena of CENAS.filter((c) => QUAIS.includes(c.id))) {
        const page = await ctx.newPage();
        await cena.abrir(page, (cena.origem === "dist" ? paraDist : paraPrevia).url);
        await page.screenshot({ path: path.join(SAIDA, `${tela}-${esquema === "dark" ? "escuro" : "claro"}-${cena.id}.png`) });
        await page.close();
      }
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  await paraDist();
  await paraPrevia();
}
console.log(`Prints em ${SAIDA}`);
