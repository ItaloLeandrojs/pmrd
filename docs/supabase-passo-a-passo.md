# Supabase do PMRD: passo a passo

Este guia é para você, que administra o PMRD. Cada seção é um assunto, na ordem em que se faz. Os nomes dos botões ficam em inglês, do jeito que aparecem no Supabase.

Nenhum e-mail, nome ou senha de verdade entra neste arquivo nem no repositório. Onde aparece `<seu e-mail>`, você digita na hora, no painel do Supabase.

**Não traduza o painel.** O tradutor do Chrome quebra o painel do Supabase ("Uma extensão do navegador pode ter causado um erro"). No ícone de tradução da barra de endereço, escolha **Nunca traduzir este site** e atualize a página, ou use o Edge.

Antes de começar, saiba o que são as duas chaves:

- **Chave pública** (`anon` ou `publishable`): pode ficar no site. Sozinha ela não abre nada.
- **Chave secreta** (`service_role` ou `secret`): abre tudo. **Nunca** vai para o site, para o GitHub, para e-mail ou para conversa. O PMRD não precisa que você copie essa chave: a função `usuarios` recebe ela do próprio Supabase.

---

## 1. Criar o projeto

1. Abra https://supabase.com/dashboard e entre na sua conta.
2. Clique em **New project**.
3. Preencha:
   - **Name:** `pmrd`.
   - **Database Password:** clique em **Generate a password**. Copie e guarde no seu gerenciador de senhas agora. Depois não dá para ver de novo.
   - **Region:** **South America (São Paulo)**. Confira antes de criar: o painel pode escolher os EUA sozinho, e a região não muda depois.
   - **Pricing Plan:** **Free**.
4. Clique em **Create new project** e espere uns 2 minutos.

---

## 2. Rodar o esquema

O esquema cria as tabelas, as regras de acesso, o histórico e o gatilho que cria o perfil de cada conta nova.

1. No menu da esquerda, clique em **SQL Editor**.
2. Clique em **New query**.
3. Abra o arquivo `supabase/migracoes/001_base.sql` do projeto, copie tudo e cole.
4. Clique em **Run**.
5. Deve aparecer **Success. No rows returned**.

Pode rodar de novo sem medo. Ele não duplica nada.

---

## 3. Fechar o cadastro e ajustar a senha

Ninguém se cadastra sozinho: quem cria as contas é o administrador.

1. Menu **Authentication**, depois **Sign In / Providers**.
2. Desligue **Allow new users to sign up** e **Confirm email**. Deixe **Allow anonymous sign-ins** e **Allow manual linking** desligados. Clique em **Save changes**.
3. Na lista **Auth Providers**, clique em **Email**:
   - Em **Minimum password length**, ponha **8**.
   - Deixe desligados **Secure password change** e **Require current password when updating**.
   - Deixe **Password requirements** em **No required characters (default)**.
4. Clique em **Save**.

Não ligue **Password requirements**, **Secure password change** nem **Require current password when updating**: o site não sabe lidar com essas regras e a troca da senha provisória falharia.

---

## 4. Criar a função `usuarios`

É ela que cria contas, redefine senhas, muda o papel e desativa ou reativa pessoas. Ela confere o login de quem chama e só obedece a administrador ativo.

### Pelo painel (o jeito mais simples)

1. Menu **Edge Functions**.
2. Clique em **Deploy a new function** e escolha **Via Editor**.
3. Dê o nome `usuarios` (exatamente assim, minúsculo).
4. O editor abre com um arquivo `index.ts`. Apague o que veio nele, abra `supabase/functions/usuarios/index.ts` do projeto, copie tudo e cole.
5. Acrescente um arquivo novo no editor chamado `regras.ts`. Abra `supabase/functions/usuarios/regras.ts` do projeto, copie tudo e cole.
6. Clique em **Deploy function** e espere terminar.

Não precisa cadastrar nenhum segredo: `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` o Supabase já entrega para a função.

Sempre que `index.ts` ou `regras.ts` mudarem no projeto, cole os dois de novo e clique em **Deploy** outra vez.

### Pelo terminal (se preferir)

Na pasta `pcm-manutencao`:

```
npx supabase login
npx supabase link --project-ref <código do projeto>
npx supabase functions deploy usuarios
```

O código do projeto é o pedaço antes de `.supabase.co` na **Project URL**.

### Se a função responder "Invalid JWT"

Se, mesmo com login, a função responder **Invalid JWT** (a conferência da seção 7 avisa), abra a função em **Edge Functions → usuarios → Details**, desligue **Verify JWT with legacy secret** e salve. A função confere o login sozinha, então ela continua fechada para quem não entrou.

> A conferir no painel real na Tarefa 10: os nomes dos botões desta seção ainda não foram testados num projeto de verdade.

---

## 5. Criar a sua conta de administrador

A primeira conta é feita no painel. As outras você cria depois pelo próprio site.

1. Menu **Authentication → Users**.
2. Clique em **Add user** e depois **Create new user**.
3. Preencha o seu **Email** e uma **Password** (mínimo 8 caracteres).
4. Marque **Auto Confirm User**.
5. Clique em **Create user**.
6. Menu **SQL Editor**, nova consulta. Rode, trocando `<seu e-mail>` pelo e-mail que você acabou de usar:

```
update public.perfis set papel = 'admin', senha_provisoria = false where email = '<seu e-mail>';
```

7. Deve aparecer **Success. 1 row affected** (ou parecido). Se aparecer 0, o e-mail digitado não bate com o da conta: confira e rode de novo.

### As contas da equipe

Depois de entrar no site como administrador, crie as outras contas em **Configurações → Usuários**, com uma senha provisória. No primeiro acesso o site pede para a pessoa trocar essa senha.

Esqueceu a senha? O site mostra **Esqueceu a senha? Peça ao administrador**. A pessoa fala com você, e você usa **Redefinir senha** em **Configurações → Usuários** e passa a senha provisória nova. Não há e-mail de recuperação: **não use "Send password recovery"** no painel, porque o site não trata esse link.

Para tirar alguém, use **Desativar** no site, não apague a conta: o histórico dos projetos continua apontando para a pessoa. O site não deixa você se desativar nem tirar o seu próprio acesso de administrador, e sempre sobra pelo menos um administrador ativo.

---

## 6. Copiar a URL e a chave pública para o site

**Copie no seu Chrome ou Edge, não no navegador de dentro do app do Claude.** Lá o botão de copiar dá "Unable to copy to clipboard" e o que se cola é outra coisa.

1. A **Project URL** aparece na página inicial do projeto (`https://<código>.supabase.co`).
2. Menu **Project Settings** (a engrenagem), depois **API Keys**. Copie a **Publishable key** (começa com `sb_publishable_`).
3. Na pasta `pcm-manutencao`, copie o arquivo `.env.exemplo` para `.env.local` e troque os valores:

```
PUBLIC_SUPABASE_URL=cole_aqui_a_Project_URL
PUBLIC_SUPABASE_ANON_KEY=cole_aqui_a_Publishable_key
```

Esse arquivo é ignorado pelo Git. Não vai para o GitHub. Não ponha a chave secreta nele.

---

## 7. Criar a conta de teste para a conferência

O script `scripts/conferir-supabase.mjs` entra com uma conta de teste do papel `equipe` e confere as regras de acesso no Supabase de verdade.

1. Crie a conta como nos passos 1 a 5 da seção 5, com um e-mail só para teste. **Não** rode o `update` de administrador: a conta nova já nasce como `equipe`.
2. Crie o arquivo `pmrd-teste.env` na pasta de **fora** do projeto (a mesma pasta onde fica `pcm-manutencao`, ou seja, `..\pmrd-teste.env`), com:

```
EMAIL_TESTE=e-mail da conta de teste
SENHA_TESTE=senha atual da conta de teste
```

3. Rode, na pasta `pcm-manutencao`:

```
node scripts/conferir-supabase.mjs
```

Cada item mostra OK ou FALHOU. Se a conta de teste trocar a senha no site, ponha a senha nova no arquivo.

A conferência usa o projeto `EXEMPLO-0001`. Depois da carga inicial com `--apagar-exemplos` (seção 12) esse projeto some e o item da troca de etapa passa a sair FALHOU: rode a conferência **antes** da carga.

---

## 8. Rodar as novidades (a entrada de dados)

O arquivo `002_novidades.sql` cria a fila de novidades da Enel, o papel do robô que envia a demanda e a carga inicial.

1. Menu **SQL Editor**, **New query**.
2. Abra `supabase/migracoes/001_base.sql`, copie tudo, cole e clique em **Run**. Ele mudou junto com o 002, então roda de novo.
3. **New query** outra vez. Abra `supabase/migracoes/002_novidades.sql`, copie tudo, cole e clique em **Run**.
4. Nos dois deve aparecer **Success. No rows returned**.

A ordem é sempre essa: primeiro o `001`, depois o `002`. Os dois podem rodar de novo sem duplicar nada.

Depois, rode a conferência da seção 7. Ela confere também que a conta de teste lê as novidades e não consegue aceitar nenhuma.

---

## 9. Criar a conta robô

O robô é a conta que o importador usa para mandar a demanda. Ele só envia: não lê a carteira e não entra no site (o site mostra "Esta conta não usa o site.").

1. Menu **Authentication → Users**, **Add user**, **Create new user**.
2. Em **Email**, invente um e-mail só para o robô. Em **Password**, use uma senha forte e guarde no seu gerenciador de senhas.
3. Marque **Auto Confirm User** e clique em **Create user**.
4. Menu **SQL Editor**, nova consulta. Rode, trocando `<e-mail do robô>`:

```
update public.perfis set papel = 'importador', senha_provisoria = false where email = '<e-mail do robô>';
```

5. Deve aparecer **Success. 1 row affected**. Se aparecer 0, o e-mail não bate com o da conta.

---

## 10. Guardar o e-mail e a senha do robô no computador

Isto é feito no computador que vai rodar o importador, na pasta `pcm-manutencao\importador`.

1. Crie o arquivo `dados\robo.txt` com uma linha só: o e-mail do robô. Pode ser pelo Bloco de Notas. A pasta `dados` fica fora do Git.
2. Guarde a senha no Gerenciador de Credenciais do Windows. Você digita a senha e ela não aparece na tela:

```
uv run python -c "import keyring, getpass; keyring.set_password('pmrd-importador', '<e-mail do robô>', getpass.getpass())"
```

A senha não fica em arquivo nenhum do projeto.

---

## 11. Preparar a pasta das planilhas e ensaiar

1. Baixe a malha dos municípios do IBGE (uma vez):

```
uv run pmrd-importar --baixar-malha
```

2. Crie a pasta `Desktop\PMRD\demanda` e salve nela as três planilhas da Enel (`00_` CS, `01_` Leste, `02_` Sul), uma por prefixo.
3. Rode o ensaio. Ele lê as planilhas e mostra as contagens, sem chamar o Supabase e sem gravar nada:

```
uv run pmrd-importar --ensaio
```

**Não rode o importador para valer ainda.** A carga inicial (seção 12) vem antes: ela já traz os projetos ativos da demanda. Importando antes, todos chegariam como "novo" na fila.

---

## 12. Fazer a carga inicial (uma vez só)

A carga leva para o PMRD a carteira da planilha de controle, os projetos ativos da demanda e as equipes das listas.

1. Ensaie primeiro. Nada é gravado nem enviado:

```
uv run pmrd-carga --xlsm "<caminho da planilha de controle>" --pasta "<pasta das planilhas da demanda>" --equipes "<pasta das listas de equipes>" --ensaio
```

2. Confira as contagens (projetos, defeitos, equipes) e leia os avisos.
3. Para valer, é o mesmo comando sem `--ensaio` e com `--apagar-exemplos`:

```
uv run pmrd-carga --xlsm "<caminho da planilha de controle>" --pasta "<pasta das planilhas da demanda>" --equipes "<pasta das listas de equipes>" --apagar-exemplos
```

4. O programa pede o e-mail e a senha do administrador (a senha não aparece na tela), mostra o resumo e só grava se você digitar `CARREGAR`.

O que saber antes:

- A carga roda **uma vez**. Na segunda o banco responde "A carga inicial já foi feita".
- Tudo acontece numa transação só: se der erro no meio, nada fica pela metade.
- Com `--apagar-exemplos`, os projetos `EXEMPLO-` saem, as equipes de exemplo são desativadas e a importação de exemplo é apagada.
- A contagem de dias em cada etapa começa na data da carga.
- O chefe de turma das equipes que não estão na planilha de controle é o primeiro colaborador da lista. Corrija na tela de equipes.

### Se a carga for cortada por tempo

O Supabase corta em 8 segundos o que uma conta logada pede. Se a carga responder com erro de tempo (`statement timeout`), nada foi gravado. No **SQL Editor**, suba o limite, rode a carga de novo e volte ao padrão:

```
alter role authenticated set statement_timeout = '60s';
notify pgrst, 'reload config';
```

Depois da carga:

```
alter role authenticated set statement_timeout = '8s';
notify pgrst, 'reload config';
```

Depois da carga, abra a **Carteira** no site e confira alguns projetos de cada regional contra a planilha de controle.

---

## 13. Primeira importação e agendador

1. Rode a primeira importação de verdade, na pasta `importador`:

```
uv run pmrd-importar --forcar
```

2. Abra a tela **Novidades** no site. A fila não vem vazia: defeitos da planilha de controle que a Enel já fechou aparecem como "corrigido", e defeitos que só existem na planilha de controle aparecem como "mudou". É esperado. Decida cada um na tela.
3. Ligue o agendador. Ele roda o importador de hora em hora, das 6h às 22h, só com você logado:

```
powershell -ExecutionPolicy Bypass -File .\agendar.ps1
```

O log de cada rodada fica em `Desktop\PMRD\demanda\importador.log`.
