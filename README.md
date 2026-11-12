# PMRD

PMRD (Planejamento de Manutenção da Rede de Distribuição) é o site do PCM para acompanhar a carteira de projetos de manutenção: etapas, prioridades, vistorias, prazos e defeitos. É feito com Astro, React e Supabase (banco e login). O repositório não tem nenhum dado real: só dados de exemplo, marcados com EXEMPLO.

## Como rodar

1. `npm install`
2. Copie `.env.exemplo` para `.env.local` e preencha `PUBLIC_SUPABASE_URL` e `PUBLIC_SUPABASE_ANON_KEY` com os valores do seu projeto Supabase. Só a chave pública entra aqui; nunca a chave secreta.
3. `npm run dev` abre o site em modo de desenvolvimento.
4. `npm test` roda os testes (o banco é testado em memória, sem internet).
5. `npm run build` gera o site pronto na pasta `dist`.

## Supabase

O passo a passo para criar o projeto, rodar o esquema, criar a função `usuarios` e as contas está em `docs/supabase-passo-a-passo.md`. O esquema do banco é `supabase/migracoes/001_base.sql`.

## Dados de exemplo

O arquivo `supabase/exemplo.sql` traz 9 equipes, 60 projetos e os defeitos deles, todos fictícios (`EXEMPLO-...`).

- **Carregar:** no Supabase, abra **SQL Editor**, cole o conteúdo do arquivo e clique em **Run**. Pode rodar de novo sem duplicar.
- **Limpar:** no topo do arquivo há um bloco de `delete` comentado. Tire o `--` do começo das linhas e rode, na ordem em que estão (defeitos, projetos, equipes e por último o histórico).
- As datas são calculadas a partir do dia em que o arquivo é rodado. Para renovar as datas, limpe e carregue de novo.

## Conferir o Supabase

`node scripts/conferir-supabase.mjs` confere, no Supabase de verdade, que as regras de acesso funcionam: quem não entrou não lê projetos, a conta de teste lê e muda a etapa de `EXEMPLO-0001` (e devolve), não consegue inserir em motivos, não consegue usar a função `usuarios`, lê as novidades e não consegue aceitar nenhuma. Cada item sai como OK ou FALHOU.

Ele precisa dos dados de `.env.local` e de um arquivo `pmrd-teste.env`, uma pasta acima do projeto (fora do Git), com duas linhas:

```
EMAIL_TESTE=<e-mail da conta de teste>
SENHA_TESTE=<senha da conta de teste>
```

A conta de teste deve ter o papel `equipe` e já ter trocado a senha provisória. Rode depois de carregar `supabase/exemplo.sql`. O script nunca mostra a senha nem a chave.
