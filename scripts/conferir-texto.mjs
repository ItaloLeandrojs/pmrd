// Conferência de texto do PMRD (adaptada da skill ls-qualidade). Uso: `npm run build && npm run conferir`.
// Sai com código 1 se achar qualquer problema.
//
// No HTML montado (dist/**/*.html):
//  - travessão (U+2014) em texto visível ou em alt, aria-label, title e placeholder (o traço curto U+2013 pode);
//  - a palavra "rua" (o texto do projeto diz "campo");
//  - e-mail que não termine em exemplo.test ou exemplo.com;
//  - <img> sem alt; alt vazio só com role="presentation" ou aria-hidden;
//  - <html lang="pt-BR"> e <title>;
//  - mais de um <h1> (o app é client:only: o h1 vem do React e é conferido no DOM montado por e2e/a11y.mjs).
// No código-fonte (src, supabase, public, tests, e2e, scripts, README, CREDITOS; sem node_modules/dist):
//  - e-mail que não termine em exemplo.test ou exemplo.com (repositório público sem dado real);
//  - travessão e "rua" nos textos de tela (src/**/*.tsx, fora dos testes).
// As funções exportadas são puras e têm teste em tests/scripts/conferir-texto.test.ts.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// Entidades nomeadas: todas as do Latin-1 (nbsp até yuml, U+00A0 a U+00FF, as do português
// como aacute, ccedil, atilde) e as comuns de pontuação. Os navegadores também aceitam, sem
// ponto e vírgula, as nomeadas "legadas" (Latin-1, amp, lt, gt, quot) e as numéricas.
const LATIN1 =
  "nbsp iexcl cent pound curren yen brvbar sect uml copy ordf laquo not shy reg macr deg plusmn sup2 sup3 " +
  "acute micro para middot cedil sup1 ordm raquo frac14 frac12 frac34 iquest Agrave Aacute Acirc Atilde " +
  "Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute " +
  "Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde " +
  "auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute " +
  "ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml";
const LEGADAS = { amp: "&", lt: "<", gt: ">", quot: '"' };
LATIN1.split(" ").forEach((nome, i) => {
  LEGADAS[nome] = String.fromCharCode(160 + i);
});
const ENTIDADES = {
  ...LEGADAS,
  apos: "'",
  mdash: "—",
  ndash: "–",
  hellip: "…",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  bull: "•",
  euro: "€",
  trade: "™",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
};
// Números 128 a 159 viram os caracteres do Windows-1252 (como no navegador): 150 e 151 são traços.
const WINDOWS_1252 = { 128: "€", 133: "…", 145: "‘", 146: "’", 147: "“", 148: "”", 149: "•", 150: "–", 151: "—", 153: "™" };
const NOMES_LEGADOS = Object.keys(LEGADAS).sort((x, y) => y.length - x.length);

// Decodifica UMA vez. Quem chama não deve passar texto já decodificado.
function decodificar(texto) {
  return texto.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*)(;?)/gi, (inteiro, nome, ponto) => {
    if (nome[0] === "#") {
      const hex = nome[1].toLowerCase() === "x";
      const codigo = hex ? parseInt(nome.slice(2), 16) : parseInt(nome.slice(1), 10);
      if (WINDOWS_1252[codigo]) return WINDOWS_1252[codigo];
      try {
        return String.fromCodePoint(codigo);
      } catch {
        return inteiro;
      }
    }
    if (ponto && nome in ENTIDADES) return ENTIDADES[nome];
    // Sem ponto e vírgula: vale o maior prefixo que seja entidade legada ("&aacuterio" = "árrio"...).
    const legado = NOMES_LEGADOS.find((n) => nome.startsWith(n));
    return legado ? LEGADAS[legado] + nome.slice(legado.length) + ponto : inteiro;
  });
}

// Troca por espaços (mesmo tamanho, para os índices continuarem valendo) o que não é texto
// visível: <script>, <style> e comentários.
function limparNaoVisivel(html) {
  const brancos = (m) => m.replace(/[^\n]/g, " ");
  return html
    .replace(/<!--[\s\S]*?-->/g, brancos)
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, brancos)
    .replace(/<style\b[\s\S]*?<\/style\s*>/gi, brancos);
}

// Etiqueta (inclui atributos entre aspas que contenham ">").
const ETIQUETA = /<(\/?)([a-zA-Z][^\s>\/]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;

function lerAtributos(trecho) {
  const atributos = {};
  const re = /([^\s"'<>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  let m;
  while ((m = re.exec(trecho))) {
    atributos[m[1].toLowerCase()] = decodificar(m[2] ?? m[3] ?? m[4] ?? "");
  }
  return atributos;
}

function etiquetasDe(limpo) {
  const lista = [];
  ETIQUETA.lastIndex = 0;
  let m;
  while ((m = ETIQUETA.exec(limpo))) {
    lista.push({
      nome: m[2].toLowerCase(),
      fecha: m[1] === "/",
      autoFecha: m[3].trimEnd().endsWith("/"),
      attrs: m[1] === "/" ? {} : lerAtributos(m[3]),
      ini: m.index,
      fim: m.index + m[0].length,
    });
  }
  return lista;
}

const ATRIBUTOS_VISIVEIS = ["alt", "aria-label", "title", "placeholder"];

function atributosDeTexto(etq) {
  const valores = [];
  for (const nome of ATRIBUTOS_VISIVEIS) if (etq.attrs[nome]) valores.push(etq.attrs[nome]);
  if (etq.nome === "meta" && etq.attrs.content) {
    const alvo = etq.attrs.name ?? etq.attrs.property ?? "";
    if (alvo === "description" || alvo.startsWith("og:") || alvo.startsWith("twitter:")) valores.push(etq.attrs.content);
  }
  return valores;
}

// Texto que o visitante lê (ou ouve, ou vê ao compartilhar), com as etiquetas trocadas por
// `separador`. Sem <script>, <style> e comentários; com alt, aria-label, title, placeholder
// e metas de descrição e compartilhamento. Entidades já decodificadas.
const TAGS_DE_BLOCO = new Set(
  "p li ul ol h1 h2 h3 h4 h5 h6 div dd dt dl tr td th table section article header footer nav aside main br hr blockquote figure figcaption form fieldset details summary address pre".split(" "),
);

// Cada trecho de texto é decodificado uma vez; os valores de atributos já saem decodificados
// de lerAtributos e não passam de novo por decodificar.
function montarTexto(html, sepBloco, sepInline = sepBloco) {
  const limpo = limparNaoVisivel(html);
  const etqs = etiquetasDe(limpo);
  let saida = "";
  let pos = 0;
  for (const etq of etqs) {
    saida += decodificar(limpo.slice(pos, etq.ini));
    const sep = TAGS_DE_BLOCO.has(etq.nome) ? sepBloco : sepInline;
    saida += sep + atributosDeTexto(etq).join(sep) + sep;
    pos = etq.fim;
  }
  saida += decodificar(limpo.slice(pos));
  return saida;
}

export function textoVerificavel(html) {
  return montarTexto(html, " ");
}

function contexto(texto, indice, tamanho) {
  const trecho = texto.slice(Math.max(0, indice - 30), indice + tamanho + 30).replace(/\s+/g, " ").trim();
  return `"${trecho}"`;
}

function acharTodos(texto, regex, rotulo, limite = 5) {
  const re = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : regex.flags + "g");
  const achados = [];
  let m;
  let total = 0;
  while ((m = re.exec(texto))) {
    total++;
    if (achados.length < limite) achados.push(`${rotulo}: ${contexto(texto, m.index, m[0].length)}`);
    if (m[0].length === 0) re.lastIndex++;
  }
  if (total > achados.length) achados.push(`${rotulo}: mais ${total - achados.length} ocorrência(s)`);
  return achados;
}

// Divide em itens: etiquetas já viraram quebra de linha; aqui também quebra em vírgula,
// ponto e vírgula e fim de frase fora de parênteses ("Aventura (104 MW), UFV Arinos (250 MWp)"
// são dois itens).
function itensDoTexto(textoComQuebras) {
  const itens = [];
  let atual = "";
  let nivel = 0;
  const t = textoComQuebras;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (c === "(") nivel++;
    else if (c === ")") nivel = Math.max(0, nivel - 1);
    const proximo = t[i + 1];
    const fimDeItem =
      c === "\n" ||
      (nivel === 0 && (c === ";" || c === "!" || c === "?")) ||
      (nivel === 0 && (c === "." || c === ",") && (proximo === undefined || /\s/.test(proximo)));
    if (fimDeItem) {
      itens.push(atual);
      atual = "";
    } else {
      atual += c;
    }
  }
  itens.push(atual);
  return itens;
}

// Posições do elemento que abre em etqs[i]: [ini, fim) contando abertura e fechamento.
function faixaDoElemento(etqs, i) {
  const e = etqs[i];
  let fim = e.fim;
  if (!e.autoFecha) {
    fim = Infinity;
    let profundidade = 1;
    for (let j = i + 1; j < etqs.length; j++) {
      const o = etqs[j];
      if (o.nome !== e.nome) continue;
      if (o.fecha) profundidade--;
      else if (!o.autoFecha) profundidade++;
      if (profundidade === 0) {
        fim = o.fim;
        break;
      }
    }
  }
  return { ini: e.ini, fimAbertura: e.fim, fim, nome: e.nome };
}

function elementosComAtributo(etqs, atributo) {
  const faixas = [];
  etqs.forEach((e, i) => {
    if (!e.fecha && atributo in e.attrs) faixas.push(faixaDoElemento(etqs, i));
  });
  return faixas;
}

const BLOCOS_DE_EXEMPLO = /^(depoimento|beneficio|faq|pergunta)/i;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}\b/g;
const EMAIL_OK = /@exemplo\.(test|com)$/i;

/** E-mails que não terminam em exemplo.test nem exemplo.com. */
export function emailsProibidos(texto) {
  return (texto.match(EMAIL) ?? []).filter((e) => !EMAIL_OK.test(e));
}

export function conferirHtml(html) {
  const problemas = [];
  const limpo = limparNaoVisivel(html);
  const etqs = etiquetasDe(limpo);

  const texto = textoVerificavel(html);
  problemas.push(...acharTodos(texto, /—/, "travessão (—) no texto"));
  problemas.push(...acharTodos(texto, /(^|[^\p{L}])rua([^\p{L}]|$)/iu, 'palavra "rua" (o texto do projeto diz "campo")'));
  for (const e of emailsProibidos(texto)) problemas.push(`e-mail fora de exemplo.test e exemplo.com: ${e}`);

  for (const e of etqs) {
    if (e.fecha || e.nome !== "img") continue;
    const nome = e.attrs.src ? ` (${e.attrs.src.slice(0, 60)})` : "";
    if (!("alt" in e.attrs)) {
      problemas.push(`<img> sem alt${nome}`);
    } else if (e.attrs.alt.trim() === "") {
      const decorativa = e.attrs.role === "presentation" || (e.attrs["aria-hidden"] ?? "") === "true";
      if (!decorativa) problemas.push(`<img> com alt vazio sem role="presentation" ou aria-hidden="true"${nome}`);
    }
  }

  const h1 = etqs.filter((e) => e.nome === "h1" && !e.fecha).length;
  if (h1 > 1) problemas.push(`página com ${h1} <h1> (deve ter no máximo um no HTML estático)`);

  const html0 = etqs.find((e) => !e.fecha && e.nome === "html");
  if (!html0 || (html0.attrs.lang ?? "").toLowerCase() !== "pt-br") problemas.push('<html> sem lang="pt-BR"');
  const titulo = limpo.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim();
  if (!titulo) problemas.push("sem <title>");

  return problemas;
}

/** Código-fonte: e-mails fora do padrão em qualquer arquivo; travessão e "rua" só nos textos de tela. */
export function conferirFonte(nome, conteudo, { tela = false } = {}) {
  const problemas = [];
  for (const e of emailsProibidos(conteudo)) problemas.push(`${nome}: e-mail fora de exemplo.test e exemplo.com: ${e}`);
  if (tela) {
    problemas.push(...acharTodos(conteudo, /—/, `${nome}: travessão (—)`));
    problemas.push(...acharTodos(conteudo, /["'`>][^"'`<>\n]*\brua\b/i, `${nome}: palavra "rua" em texto`));
  }
  return problemas;
}

export function extrairDescricao(html) {
  const e = etiquetasDe(limparNaoVisivel(html)).find(
    (x) => !x.fecha && x.nome === "meta" && x.attrs.name === "description",
  );
  return (e?.attrs.content ?? "").trim();
}

// paginas: [{ arquivo, html }]. Devolve um problema por descrição repetida.
export function descricoesRepetidas(paginas) {
  const porTexto = new Map();
  for (const p of paginas) {
    const d = extrairDescricao(p.html).replace(/\s+/g, " ").toLowerCase();
    if (!d) continue;
    if (!porTexto.has(d)) porTexto.set(d, []);
    porTexto.get(d).push(p.arquivo);
  }
  return [...porTexto.entries()]
    .filter(([, arquivos]) => arquivos.length > 1)
    .map(([d, arquivos]) => `meta description repetida em ${arquivos.join(", ")}: "${d.slice(0, 60)}"`);
}

function listarHtml(pasta) {
  const achados = [];
  for (const entrada of fs.readdirSync(pasta, { withFileTypes: true })) {
    const caminho = path.join(pasta, entrada.name);
    if (entrada.isDirectory()) achados.push(...listarHtml(caminho));
    else if (entrada.name.endsWith(".html")) achados.push(caminho);
  }
  return achados;
}

export function conferirPasta(dist) {
  const arquivos = listarHtml(dist).sort();
  const paginas = arquivos.map((a) => ({
    arquivo: path.relative(dist, a).split(path.sep).join("/"),
    html: fs.readFileSync(a, "utf8"),
  }));
  const saida = [];
  for (const p of paginas) for (const prob of conferirHtml(p.html)) saida.push(`${p.arquivo}: ${prob}`);
  for (const prob of descricoesRepetidas(paginas)) saida.push(prob);
  return { paginas: paginas.length, problemas: saida };
}

const IGNORAR = new Set(["node_modules", "dist", "dist-previa", ".git", ".astro", ".superpowers", "prints"]);
const EXTENSOES = new Set([".ts", ".tsx", ".mjs", ".js", ".css", ".astro", ".md", ".json", ".sql", ".html", ".svg", ".toml", ".yml"]);

function listarFontes(pasta, raiz) {
  const achados = [];
  for (const entrada of fs.readdirSync(pasta, { withFileTypes: true })) {
    if (IGNORAR.has(entrada.name)) continue;
    const caminho = path.join(pasta, entrada.name);
    if (entrada.isDirectory()) {
      if (path.relative(raiz, caminho).split(path.sep).join("/") === "docs/superpowers") continue; // fora do Git
      achados.push(...listarFontes(caminho, raiz));
    } else if (EXTENSOES.has(path.extname(entrada.name)) && entrada.name !== "package-lock.json") achados.push(caminho);
  }
  return achados;
}

export function conferirFontes(raiz) {
  const saida = [];
  for (const arq of listarFontes(raiz, raiz)) {
    const rel = path.relative(raiz, arq).split(path.sep).join("/");
    const tela = rel.startsWith("src/") && /\.tsx$/.test(rel) && !/\.test\./.test(rel);
    saida.push(...conferirFonte(rel, fs.readFileSync(arq, "utf8"), { tela }));
  }
  return saida;
}

const rodandoDireto = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (rodandoDireto) {
  const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const dist = path.join(raiz, "dist");
  if (!fs.existsSync(dist)) {
    console.error("Pasta dist/ não existe. Rode `npm run build` antes.");
    process.exit(1);
  }
  const { paginas, problemas: doHtml } = conferirPasta(dist);
  const problemas = [...doHtml, ...conferirFontes(raiz)];
  if (problemas.length === 0) {
    console.log(`Nenhum problema (${paginas} página(s) montada(s) e o código-fonte conferidos).`);
  } else {
    for (const p of problemas) console.log(p);
    console.log(`\n${problemas.length} problema(s).`);
    process.exit(1);
  }
}
