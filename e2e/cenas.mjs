// Cenas do PMRD usadas pelo axe (e2e/a11y.mjs) e pelos prints (e2e/prints.mjs).
// "login" vem do dist (o que vai ao ar, sem internet). As telas logadas vêm da prévia (dist-previa),
// que troca o cliente do Supabase por um cliente em memória com dados fictícios: nenhuma rede.
import { abrirPrevia, escolherTodas } from "./util.mjs";

const PROJETO_FICHA = "EXEMPLO-0002";

async function abrirFicha(page) {
  await page.locator(`[role=row][data-projeto="${PROJETO_FICHA}"]`).getByText(PROJETO_FICHA).click();
  await page.locator(".ficha").first().waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
}

async function aba(page, nome) {
  await page.getByRole("tab", { name: nome }).click();
  await page.getByRole("tabpanel").waitFor();
  await page.waitForTimeout(400);
}

export const CENAS = [
  {
    id: "login",
    origem: "dist",
    abrir: async (page, url) => {
      await page.goto(url, { waitUntil: "load" });
      await page.locator("form").first().waitFor({ timeout: 10000 });
      await page.waitForTimeout(300);
    },
  },
  {
    id: "carteira-todas",
    origem: "previa",
    abrir: async (page, url) => {
      await abrirPrevia(page, url, "#/carteira");
      await escolherTodas(page);
    },
  },
  {
    id: "carteira-ficha",
    origem: "previa",
    abrir: async (page, url) => {
      await abrirPrevia(page, url, "#/carteira");
      await escolherTodas(page);
      await abrirFicha(page);
    },
  },
  {
    id: "novo-projeto",
    origem: "previa",
    abrir: async (page, url) => {
      await abrirPrevia(page, url, "#/carteira");
      await escolherTodas(page);
      await page.getByRole("button", { name: "Novo projeto" }).click();
      await page.getByRole("dialog", { name: "Novo projeto" }).waitFor();
      await page.waitForTimeout(400);
    },
  },
  ...["Equipes", "Solicitantes de SGD", "Motivos", "Prazos", "Usuários"].map((nome) => ({
    id: `configuracoes-${nome.toLowerCase().replace(/[^a-z]/g, "").replace("solicitantesdesgd", "solicitantes").replace("usurios", "usuarios")}`,
    origem: "previa",
    abrir: async (page, url) => {
      await abrirPrevia(page, url, "#/configuracoes");
      await page.getByRole("tab", { name: "Equipes" }).waitFor();
      await aba(page, nome);
    },
  })),
  {
    id: "chega-no-plano",
    origem: "previa",
    abrir: async (page, url) => {
      await abrirPrevia(page, url, "#/mapa");
      await page.getByText(/chega no plano/).waitFor();
    },
  },
];
