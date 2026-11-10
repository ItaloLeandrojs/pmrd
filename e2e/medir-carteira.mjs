// Mede a largura da Carteira (rolagem horizontal) em várias telas, pela prévia com dados falsos.
// Uso: npm run previa:montar && node e2e/medir-carteira.mjs
import { servidor, navegador, semInternet, abrirPrevia, escolherTodas, placar, DIST_PREVIA } from "./util.mjs";

const p = placar("medir-carteira.mjs");
const parar = await servidor({ raiz: DIST_PREVIA });
const browser = await navegador();
try {
  for (const largura of [1280, 1366, 1440, 1920]) {
    for (const aberta of [false, true]) {
      const ctx = await browser.newContext({ viewport: { width: largura, height: 800 } });
      await semInternet(ctx);
      const page = await ctx.newPage();
      await abrirPrevia(page, parar.url);
      await escolherTodas(page);
      if (aberta) {
        await page.locator('[role=row][data-projeto="EXEMPLO-0002"]').getByText("EXEMPLO-0002").click();
        await page.getByRole("complementary").or(page.locator(".ficha")).first().waitFor();
        await page.waitForTimeout(400);
      }
      const m = await page.evaluate(() => {
        const r = document.querySelector(".cart__rolagem");
        const cab = [...document.querySelectorAll(".cart__cab")].map((c) => `${c.textContent}:${Math.round(c.getBoundingClientRect().width)}`);
        return { cliente: r.clientWidth, rolagem: r.scrollWidth, larg: getComputedStyle(r).getPropertyValue("--larg"), cab: cab.join(" ") };
      });
      // select e input date não expõem o texto cortado (scrollWidth não serve): mede o texto renderizado
      // (canvas com a fonte calculada) contra a largura útil do controle (sem padding, seta e ícone).
      // MEDIR_ESTREITAR=N força a Etapa a N px para provar que a medição pega um corte de verdade.
      if (process.env.MEDIR_ESTREITAR) await page.addStyleTag({ content: `.cart__etapa{max-width:${Number(process.env.MEDIR_ESTREITAR)}px}` });
      const corte = await page.evaluate(() => {
        const c = document.createElement("canvas").getContext("2d");
        const larg = (el, txt) => { const s = getComputedStyle(el); c.font = `${s.fontStyle} ${s.fontWeight} ${s.fontSize} ${s.fontFamily}`; return c.measureText(txt).width; };
        const util = (el, extra) => { const s = getComputedStyle(el); return el.getBoundingClientRect().width - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight) - parseFloat(s.borderLeftWidth) - parseFloat(s.borderRightWidth) - extra; };
        const SETA = 20, ICONE_DATA = 24;
        const out = [];
        const sel = document.querySelector(".cart__etapa");
        const maior = [...sel.options].map((o) => [o.text, larg(sel, o.text)]).sort((x, y) => y[1] - x[1])[0];
        const folgaEtapa = util(sel, SETA) - maior[1];
        if (folgaEtapa < 0) out.push(`Etapa "${maior[0]}" precisa de ${Math.ceil(maior[1])}px e tem ${Math.floor(util(sel, SETA))}px`);
        const cel = document.querySelector(".cart__linha--atrasada .cart__prazo");
        const inp = cel.querySelector("input");
        const marca = cel.querySelector(".cart__atrasada").getBoundingClientRect().width;
        const precisa = larg(inp, "30/12/2026") + ICONE_DATA;
        const tem = util(inp, 0);
        if (tem < precisa) out.push(`Prazo: data precisa de ${Math.ceil(precisa)}px e tem ${Math.floor(tem)}px (Atrasada ocupa ${Math.round(marca)}px)`);
        const par = document.querySelector(".cart__parado--vermelho") ?? document.querySelector(".cart__parado");
        if (par.scrollWidth > par.clientWidth + 1) out.push(`Parado ${par.scrollWidth}>${par.clientWidth}`);
        const um = document.querySelector(".cart__projeto");
        const fantasma = document.createElement("span"); fantasma.className = "cart__salvando"; fantasma.textContent = "Salvando"; um.appendChild(fantasma);
        document.querySelectorAll(".cart__projeto-nome").forEach((n) => { if (n.scrollWidth > n.clientWidth + 1) out.push(`Projeto cortado: ${n.textContent}`); });
        fantasma.remove();
        return { out, folgaEtapa: Math.round(folgaEtapa), prazoFolga: Math.round(tem - precisa) };
      });
      if (!aberta && largura >= 1366) p.confere(`${largura}px: Projeto, Etapa, Prazo e Parado sem corte`, corte.out.length === 0, `${corte.out.join("; ")} [folga etapa ${corte.folgaEtapa}px, folga data ${corte.prazoFolga}px]`);
      const cabe = m.rolagem <= m.cliente;
      const nome = `${largura}px${aberta ? " com ficha" : ""}`;
      if (aberta) console.log(`info   ${nome}: cliente ${m.cliente}, rolagem ${m.rolagem}`);
      else p.confere(`${nome}: Carteira sem rolagem horizontal`, cabe || largura < 1366, `cliente ${m.cliente}, conteúdo ${m.rolagem}, ${m.cab}`);
      await ctx.close();
    }
  }
} finally {
  await browser.close();
  await parar();
}
p.fim();
