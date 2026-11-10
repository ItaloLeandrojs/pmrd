// Foco no navegador de verdade (Edge): no "Novo projeto", Tab a partir do Projeto chega ao Regional,
// e o ciclo de Tab fica dentro do quadro. Pela prévia de dados falsos, sem rede.
// Uso: npm run previa:montar && node e2e/foco.mjs
import { servidor, navegador, semInternet, abrirPrevia, escolherTodas, placar, DIST_PREVIA } from "./util.mjs";

const p = placar("foco.mjs");
const parar = await servidor({ raiz: DIST_PREVIA });
const browser = await navegador();
try {
  for (const todas of [false, true]) {
    const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
    await semInternet(ctx);
    const page = await ctx.newPage();
    await abrirPrevia(page, parar.url);
    if (todas) await escolherTodas(page);
    await page.getByRole("button", { name: "Novo projeto" }).click();
    const quadro = page.getByRole("dialog", { name: "Novo projeto" });
    await quadro.waitFor();
    const rotuloFoco = () => page.evaluate(() => {
      const e = document.activeElement;
      return (e?.labels?.[0]?.querySelector("span")?.textContent ?? e?.labels?.[0]?.textContent)?.trim() ?? e?.getAttribute("aria-label") ?? e?.textContent?.trim() ?? e?.tagName;
    });
    const nome = todas ? "Todas" : "CS";
    p.confere(`${nome}: o quadro abre com o foco no Projeto`, (await rotuloFoco()) === "Projeto");
    await page.keyboard.press("Tab");
    p.confere(`${nome}: Tab do Projeto chega ao Regional`, (await rotuloFoco()) === "Regional", await rotuloFoco());
    await page.keyboard.press("Tab");
    p.confere(`${nome}: segundo Tab chega ao Município`, (await rotuloFoco()) === "Município", await rotuloFoco());
    for (let i = 0; i < 14; i++) await page.keyboard.press("Tab");
    const dentro = await page.evaluate(() => !!document.activeElement?.closest("[role=dialog]"));
    p.confere(`${nome}: depois de várias voltas o foco continua dentro do quadro`, dentro);
    await ctx.close();
  }
} finally {
  await browser.close();
  await parar();
}
p.fim();
