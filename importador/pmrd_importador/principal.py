"""pmrd-importar: lê as planilhas da Enel e manda a demanda ao PMRD."""
import argparse
import json
import shutil
import sys
import tempfile
from collections import Counter
from datetime import datetime
from pathlib import Path

from .agrupar import assinatura_arquivo, montar_envio
from .municipios import Municipios, baixar_malha
from .nuvem import ErroNuvem, Nuvem
from .pbm import ler_coordenadas
from .planilha import ErroPlanilha, ler_demanda

REGIONAIS = (("00_", "CS"), ("01_", "LESTE"), ("02_", "SUL"))
RAIZ = Path(__file__).resolve().parent.parent          # pasta importador
MALHA_PADRAO = RAIZ / "dados" / "municipios_ce.geojson"
ROBO_PADRAO = RAIZ / "dados" / "robo.txt"
ENV_PADRAO = RAIZ.parent / ".env.local"
PASTA_PADRAO = Path.home() / "Desktop" / "PMRD" / "demanda"
SERVICO_KEYRING = "pmrd-importador"


def _ler_env(caminho: Path) -> dict[str, str]:
    if not caminho.exists():
        raise ErroNuvem(f"Arquivo de configuração não encontrado: {caminho}.")
    env = {}
    # utf-8-sig: o PowerShell 5.1 grava texto com BOM no começo.
    for linha in caminho.read_text(encoding="utf-8-sig").splitlines():
        linha = linha.strip()
        if not linha or linha.startswith("#") or "=" not in linha:
            continue
        k, v = linha.split("=", 1)
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def _criar_nuvem(caminho_env: Path, robo: Path) -> Nuvem:
    env = _ler_env(caminho_env)
    url, chave = env.get("PUBLIC_SUPABASE_URL"), env.get("PUBLIC_SUPABASE_ANON_KEY")
    if not url or not chave:
        raise ErroNuvem("Faltam PUBLIC_SUPABASE_URL e PUBLIC_SUPABASE_ANON_KEY no .env.local.")
    if not robo.exists():
        raise ErroNuvem(f"E-mail do robô não encontrado: {robo}. Veja o README.")
    email = robo.read_text(encoding="utf-8-sig").strip()
    import keyring
    senha = keyring.get_password(SERVICO_KEYRING, email)
    if not senha:
        raise ErroNuvem("Senha do robô não está guardada no Windows. Veja o README (passo da senha).")
    nuvem = Nuvem(url, chave)
    nuvem.entrar(email, senha)
    return nuvem


def _achar_arquivo(pasta: Path, prefixo: str) -> Path | None:
    achados = sorted(p for p in pasta.iterdir()
                     if p.is_file() and p.name.startswith(prefixo)
                     and p.suffix.lower() in (".xlsx", ".xlsm") and not p.name.startswith("~$"))
    if len(achados) > 1:
        raise ErroPlanilha(f"Mais de uma planilha {prefixo} na pasta. Deixe só uma.")
    return achados[0] if achados else None


def _ler_estado(caminho: Path) -> dict:
    try:
        return json.loads(caminho.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _resumo(envio: dict) -> str:
    projetos = envio["projetos"]
    defeitos = sum(len(p["defeitos"]) for p in projetos)
    sem_mun = sum(len(p["defeitos"]) for p in projetos if p["municipio"] is None)
    top = Counter(p["municipio"] for p in projetos if p["municipio"]).most_common(3)
    top_txt = ", ".join(f"{n} ({q})" for n, q in top) or "nenhum"
    return (f"{len(projetos)} projetos, {defeitos} defeitos ativos ({sem_mun} em projetos sem município), "
            f"{len(envio['fechados'])} fechados, municípios mais frequentes: {top_txt}, "
            f"{len(envio['avisos'])} avisos")


def _ler_regional(arquivo: Path, regional: str, malha) -> dict:
    """Copia para pasta temporária, lê a cópia, apaga a cópia. Devolve {'envio', 'sha'}."""
    tmp = Path(tempfile.mkdtemp(prefix="pmrd-"))
    try:
        copia = tmp / arquivo.name
        shutil.copy2(arquivo, copia)
        sha = assinatura_arquivo(copia)
        demanda = ler_demanda(copia)
        coords = ler_coordenadas(copia, {d.id_gom for d in demanda.defeitos if d.ativo})
        return {"envio": montar_envio(demanda, coords, malha, regional), "sha": sha, "copia": copia}
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main(argv: list[str] | None = None, nuvem=None) -> int:
    ap = argparse.ArgumentParser(prog="pmrd-importar")
    ap.add_argument("--pasta", type=Path, default=PASTA_PADRAO)
    ap.add_argument("--ensaio", action="store_true", help="só lê e mostra; não chama a nuvem nem grava nada")
    ap.add_argument("--forcar", action="store_true", help="manda mesmo que o arquivo não tenha mudado")
    ap.add_argument("--baixar-malha", action="store_true", help="baixa a malha do IBGE e sai")
    ap.add_argument("--malha", type=Path, default=MALHA_PADRAO)
    ap.add_argument("--env", type=Path, default=ENV_PADRAO)
    ap.add_argument("--robo", type=Path, default=ROBO_PADRAO)
    a = ap.parse_args(argv)

    if a.baixar_malha:
        try:
            baixar_malha(a.malha)
        except Exception as e:
            print(f"Não deu para baixar a malha do IBGE ({type(e).__name__}: {e}).")
            return 1
        print(f"Malha gravada em {a.malha}.")
        return 0

    if not a.pasta.is_dir():
        print(f"Pasta não encontrada: {a.pasta}.")
        return 1

    if a.malha.exists():
        malha = Municipios.carregar(a.malha)
    elif a.ensaio:
        malha = None
        print(f"Aviso: malha dos municípios não encontrada ({a.malha}); municípios ficam vazios. "
              "Rode: uv run pmrd-importar --baixar-malha")
    else:
        print(f"Malha dos municípios não encontrada: {a.malha}. Rode: uv run pmrd-importar --baixar-malha")
        return 1

    arq_estado = a.pasta / ".estado.json"
    arq_log = a.pasta / "importador.log"

    def log(msg: str) -> None:
        linha = f"{datetime.now():%Y-%m-%d %H:%M:%S} {msg}"
        print(linha)
        if not a.ensaio:
            with open(arq_log, "a", encoding="utf-8") as f:
                f.write(linha + "\n")

    # Com o agendador oculto, a falha ao entrar só aparece no importador.log.
    if not a.ensaio and nuvem is None:
        try:
            nuvem = _criar_nuvem(a.env, a.robo)
        except ErroNuvem as e:
            log(f"Não deu para entrar na nuvem: {e}")
            return 1
        except Exception as e:
            log(f"Não deu para entrar na nuvem ({type(e).__name__}: {e}).")
            return 1

    estado = _ler_estado(arq_estado)
    falhou = False

    def esquecer(prefixo: str) -> None:
        """Leitura com erro: a regional sai do .estado.json, e o próximo arquivo bom é enviado."""
        if a.ensaio or prefixo not in estado:
            return
        estado.pop(prefixo)
        arq_estado.write_text(json.dumps(estado, indent=2), encoding="utf-8")

    def registrar_erro(regional: str, arquivo: str, msg: str) -> None:
        if a.ensaio:
            return
        try:
            nuvem.rpc("registrar_erro_importacao",
                      {"p_regional": regional, "p_arquivo": arquivo, "p_erro": msg})
        except ErroNuvem as e:
            log(f"{regional}: não deu para registrar o erro na nuvem ({e}).")

    for prefixo, regional in REGIONAIS:
        nome = ""
        try:
            arquivo = _achar_arquivo(a.pasta, prefixo)
            if arquivo is None:
                log(f"{regional}: sem planilha")
                continue
            nome = arquivo.name
            if not a.ensaio and not a.forcar:
                tmp = Path(tempfile.mkdtemp(prefix="pmrd-sha-"))
                try:
                    copia = tmp / arquivo.name
                    shutil.copy2(arquivo, copia)
                    if estado.get(prefixo) == assinatura_arquivo(copia):
                        log(f"{regional}: sem mudança desde o último envio")
                        continue
                finally:
                    shutil.rmtree(tmp, ignore_errors=True)
            r = _ler_regional(arquivo, regional, malha)
            envio = r["envio"]
            if a.ensaio:
                log(f"{regional}: ensaio, {_resumo(envio)}")
                for av in envio["avisos"]:
                    log(f"{regional}: aviso: {av}")
                continue
            nuvem.rpc("enviar_demanda", {"p_regional": regional, "p_arquivo": nome, "p_envio": envio})
            estado[prefixo] = r["sha"]
            arq_estado.write_text(json.dumps(estado, indent=2), encoding="utf-8")
            log(f"{regional}: enviado, {_resumo(envio)}")
        except ErroPlanilha as e:
            falhou = True
            log(f"{regional}: erro: {e}")
            esquecer(prefixo)
            registrar_erro(regional, nome, str(e))
        except ErroNuvem as e:
            falhou = True
            log(f"{regional}: erro da nuvem: {e}")
        except Exception as e:
            falhou = True
            msg = f"Planilha {nome}: erro inesperado ao ler ({type(e).__name__})."
            log(f"{regional}: {msg}")
            esquecer(prefixo)
            registrar_erro(regional, nome, msg)
    return 1 if falhou else 0


def entrada() -> None:
    sys.exit(main())


if __name__ == "__main__":
    entrada()
