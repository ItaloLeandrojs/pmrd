// Acessibilidade automática com o axe-core (@axe-core/playwright, só de teste) no Edge, sem internet,
// em 1366x768 e 390x844, claro e escuro, com WCAG 2.0/2.1/2.2 A e AA e as boas práticas do axe.
// Cenas em e2e/cenas.mjs: login (dist) e telas logadas pela prévia de dados falsos (dist-previa).
// Confere também que cada cena tem um único <h1> no DOM montado (o app é client:only).
//
// Uso: npm run build && npm run previa:montar && npm run a11y
import fs from "node:fs";
import path from "node:path";
import { AxeBuilder } from "@axe-core/playwright";
import { servidor, navegador, semInternet, placar, DIST, DIST_PREVIA, PRINTS, PORTA } from "./util.mjs";
import { CENAS } from "./cenas.mjs";

const REGRAS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

// Regras desligadas, cada uma com o motivo escrito ao lado ({ regra: "motivo" }).
// Hoje nenhuma: todas as regras das etiquetas acima valem.
const DESLIGADAS = {};

const p = placar("a11y.mjs", { silencioso: true });
const paraDist = await servidor({ raiz: DIST, porta: PORTA });
const paraPrevia = await servidor({ raiz: DIST_PREVIA, porta: PORTA + 1 });
const browser = await navegador();
const relatorio = [];

try {
  for (const [tela, viewport, extra] of [
    ["1366", { width: 1366, height: 768 }, {}],
    ["390", { width: 390, height: 844 }, { isMobile: true, hasTouch: true }],
  ]) {
    for (const esquema of ["light", "dark"]) {
      const ctx = await browser.newContext({ viewport, colorScheme: esquema, ...extra });
      await semInternet(ctx);
      for (const cena of CENAS) {
        const page = await ctx.newPage();
        const rotulo = `${tela} ${esquema === "dark" ? "escuro" : "claro"} ${cena.id}`;
        try {
          await cena.abrir(page, (cena.origem === "dist" ? paraDist : paraPrevia).url);
          const h1 = await page.locator("h1").count();
          p.confere(`${rotulo}: um único h1`, h1 === 1, `${h1} h1`);
          const r = await new AxeBuilder({ page }).withTags(REGRAS).disableRules(Object.keys(DESLIGADAS)).analyze();
          const problemas = r.violations.map((v) => ({
            regra: v.id,
            impacto: v.impact,
            ajuda: v.help,
            alvos: v.nodes.slice(0, 5).map((n) => `${n.target.join(" ")} :: ${n.failureSummary?.split("\n")[1]?.trim() ?? ""}`),
            total: v.nodes.length,
          }));
          if (problemas.length) relatorio.push({ cena: rotulo, problemas });
          p.confere(
            `${rotulo}: sem problemas do axe`,
            problemas.length === 0,
            problemas.map((x) => `${x.regra} (${x.impacto}, ${x.total}): ${x.alvos[0]}`).join(" | "),
          );
        } catch (e) {
          p.confere(`${rotulo}: a cena abriu`, false, String(e.message).split("\n")[0]);
        }
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

fs.mkdirSync(PRINTS, { recursive: true });
fs.writeFileSync(path.join(PRINTS, "a11y.json"), JSON.stringify(relatorio, null, 1));
p.fim();
