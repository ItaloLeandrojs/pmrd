// html-validate (só de teste): confere o HTML do dist/. Parte das regras recomendadas.
// Regra desligada só com o motivo escrito ao lado.
export default {
  extends: ["html-validate:recommended"],
  rules: {
    // O Astro injeta sozinho, no começo do <body>, um <style>astro-island,astro-slot{display:contents}</style>
    // para a ilha client:only do React. Não é código nosso e não dá para tirar; é o único erro do dist
    // (conferido em 10/11/2026). O HTML escrito por nós (src/pages/index.astro) passa nas demais regras.
    "element-permitted-content": "off",
  },
};
