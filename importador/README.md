# Importador da demanda da Enel

Este programa lê as planilhas da Enel e manda a demanda para o PMRD. Roda sozinho de hora em hora e só manda o que mudou desde o último envio com sucesso.

## 1. Onde salvar as planilhas

Salve as três planilhas na pasta `Desktop\PMRD\demanda`. O nome precisa começar assim:

- `00_` para o CS
- `01_` para o Leste
- `02_` para o Sul

Um nome com " (1)" no fim também serve. Deixe só uma planilha por prefixo. Se tiver duas, o PMRD mostra o erro e nada daquela regional é enviado.

## 2. Preparar o robô (uma vez)

Crie o arquivo `importador\dados\robo.txt` com uma linha só: o e-mail da conta robô `importador`. Essa pasta fica fora do Git.

Baixe a malha dos municípios do IBGE:

```
uv run pmrd-importar --baixar-malha
```

Guarde a senha do robô no Gerenciador de Credenciais do Windows. Você digita a senha, ela não aparece na tela:

```
uv run python -c "import keyring, getpass; keyring.set_password('pmrd-importador', '<e-mail do robô>', getpass.getpass())"
```

Troque `<e-mail do robô>` pelo e-mail que está no `robo.txt`.

## 3. Testar sem mandar nada

O ensaio lê as planilhas e mostra as contagens, sem chamar a nuvem e sem gravar nada:

```
uv run pmrd-importar --ensaio
```

Para mandar de verdade agora:

```
uv run pmrd-importar
```

Para mandar mesmo que a planilha não tenha mudado:

```
uv run pmrd-importar --forcar
```

## 4. Agendar de hora em hora

Abra o PowerShell na pasta `importador` e rode:

```
powershell -ExecutionPolicy Bypass -File .\agendar.ps1
```

Ele mostra o comando e espera você apertar Enter. A tarefa se chama "PMRD importador" e roda das 6h às 22h, só com você logado, sem abrir janela.

## 5. Onde ver o log

O log fica em `Desktop\PMRD\demanda\importador.log`, uma linha por regional a cada rodada. Planilha fora do padrão aparece também na tela do PMRD, e nesse caso nada é enviado daquela regional.
