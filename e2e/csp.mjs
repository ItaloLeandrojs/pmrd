// Política de segurança: abre o login do dist (o que vai ao ar) e confere que o navegador não
// registra nenhuma violação de CSP (fontes embutidas, scripts da hidratação, estilos), sem internet.
// Uso: npm run build && node e2e/csp.mjs   (ou npm run csp)
import { servidor, navegador, semInternet, vigiarConsole, placar } from "./util.mjs";

const p = placar("csp.mjs");
const parar = await servidor();
const browser = await navegador();
try {
  const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await semInternet(ctx);
  const page = await ctx.newPage();
  const erros = vigiarConsole(page, { avisos: true });
  const violacoes = [];
  await page.addInitScript(() => {
    document.addEventListener("securitypolicyviolation", (e) =>
      (window.__csp ??= []).push(`${e.violatedDirective} bloqueou ${e.blockedURI.slice(0, 40)}`),
    );
  });
  await page.goto(parar.url, { waitUntil: "load" });
  await page.getByRole("heading", { name: /entrar/i }).first().waitFor({ timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(800);
  violacoes.push(...(await page.evaluate(() => window.__csp ?? [])));
  const csp = erros.filter((e) => /content security policy|refused to/i.test(e));
  p.confere("o login monta (há formulário na tela)", (await page.locator("form").count()) > 0);
  p.confere("nenhum erro de CSP no console", csp.length === 0, csp.join(" | "));
  p.confere("nenhum evento securitypolicyviolation", violacoes.length === 0, violacoes.join(" | "));
  p.confere("nenhum outro erro de console ou de JavaScript", erros.length === csp.length, erros.join(" | "));
  await ctx.close();
} finally {
  await browser.close();
  await parar();
}
p.fim();
