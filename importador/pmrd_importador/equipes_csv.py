"""Listas de equipes aprovadas (CSV com ';', uma por regional): equipes de campo.

Só o LID, a regional (Centro de Custo), a base (Centro de Serviço), o tipo (sigla
do LID) e o chefe (1º colaborador) saem daqui; os outros colaboradores, o gestor,
o coordenador e o supervisor não vão para a carga."""
import csv
import io
import re
import shutil
from collections import Counter
from pathlib import Path

from .colunas import normalizar_nome
from .planilha import ErroPlanilha

ARQUIVOS = "equipes_aprovadas_*.csv"
# Chave da linha lida -> coluna do CSV (comparada sem acento e caixa).
COLUNAS = {
    "codigo": "Código Equipe",
    "centro_custo": "Centro de Custo",
    "centro_servico": "Centro de Serviço",
    "colaboradores": "Colaboradores na Equipe (aprovados)",
}
TIPOS_NOVOS = ("RD", "LB", "LN", "MM", "SK", "GA", "TR", "RL", "LM", "MO")
TIPO_DA_SIGLA = {"LV": "LV", "ML": "ML", "MP": "MP", "COS": "MP"} | {t: t for t in TIPOS_NOVOS}
BASE_DO_CENTRO = {normalizar_nome(c): b for c, b in {
    "C.S. JUAZEIRO": "JZN", "C.S. MILAGRES": "MLG", "C.S. CAMPOS SALES": "CPS", "C.S. IGUATU": "IGT",
    "C.S. ICO": "ICO", "C.S. SENADOR POMPEU": "SNP", "C.S. TAUA": "TAA", "C.S. LIMOEIRO": "RSL",
    "C.S. ARACATI": "ART", "C.S. JAGUARIBE": "JGB",
}.items()}
# Equipes que não são de campo, pelo pedaço do código (na ordem em que são procuradas).
NAO_SAO_DE_CAMPO = ("APOIO-CMO", "ADM", "FERISTA", "INSS", "RETRO")
SIGLAS_DE_FORA = ("PEF",)
_LID_DE_CAMPO = re.compile(r"^[A-Z]{3}-([A-Z]{2,3})-\d{2}[A-Z]$")


def _decodificar(dados: bytes) -> str:
    try:
        return dados.decode("utf-8-sig")
    except UnicodeDecodeError:
        return dados.decode("cp1252")


def ler_lista(caminho: Path) -> list[dict]:
    """Uma lista (já copiada). Devolve [{codigo, centro_custo, centro_servico,
    colaboradores, arquivo, linha}]; coluna que falta é erro."""
    caminho = Path(caminho)
    linhas = list(csv.reader(io.StringIO(_decodificar(caminho.read_bytes()), newline=""), delimiter=";"))
    cabecalho = [normalizar_nome(c) for c in (linhas[0] if linhas else [])]
    indice = {}
    for chave, nome in COLUNAS.items():
        if normalizar_nome(nome) not in cabecalho:
            raise ErroPlanilha(f"Lista de equipes {caminho.name}: coluna {nome} não encontrada.")
        indice[chave] = cabecalho.index(normalizar_nome(nome))
    saida = []
    for n, linha in enumerate(linhas[1:], 2):
        if not any(c.strip() for c in linha):
            continue
        item = {k: (linha[i].strip() if i < len(linha) else "") for k, i in indice.items()}
        saida.append(item | {"arquivo": caminho.name, "linha": n})
    return saida


def ler_listas(pasta: Path, tmp: Path) -> list[dict]:
    """Copia cada equipes_aprovadas_*.csv da pasta para tmp (quem chama apaga) e lê as cópias."""
    arquivos = sorted(Path(pasta).glob(ARQUIVOS))
    if not arquivos:
        raise ErroPlanilha(f"Nenhuma lista {ARQUIVOS} na pasta {pasta}.")
    linhas = []
    for arquivo in arquivos:
        copia = Path(tmp) / ("equipes-" + arquivo.name)
        shutil.copy2(arquivo, copia)
        linhas += [l | {"arquivo": arquivo.name} for l in ler_lista(copia)]
    return linhas


def _regional(centro_custo: str) -> str | None:
    t = normalizar_nome(centro_custo)
    if "CENTRO SUL" in t:
        return "CS"
    if "LESTE" in t:
        return "LESTE"
    if "SUL" in t:
        return "SUL"
    return None


def _de_fora(n: int, o_que: str, de_campo: bool) -> str:
    um = n == 1
    nota = (" (não é de campo)" if um else " (não são de campo)") if not de_campo else ""
    return (f"Listas de equipes: {'1 equipe' if um else f'{n} equipes'} {o_que} "
            f"{'ficou' if um else 'ficaram'} de fora{nota}.")


def equipes_das_listas(linhas: list[dict]) -> tuple[list[dict], list[str]]:
    """Equipes de campo [{lid, chefe, tipo, regional, base}] e avisos.
    De fora: as que não são de campo e as de sigla PEF (contadas por motivo) e,
    com aviso cada uma, sigla, centro de serviço ou centro de custo desconhecidos."""
    equipes, avisos, vistos = [], [], set()
    fora: Counter = Counter()
    for l in linhas:
        lid = l["codigo"].rsplit("/", 1)[-1].strip().upper()
        if not lid:
            continue
        onde = f"Equipe {lid} (lista {l['arquivo']}, linha {l['linha']})"
        casou = _LID_DE_CAMPO.match(lid)
        if not casou:
            motivo = next((m for m in NAO_SAO_DE_CAMPO if m in lid), None)
            if motivo:
                fora[motivo] += 1
            else:
                avisos.append(f"{onde}: fora do formato de equipe de campo; ficou de fora.")
            continue
        sigla = casou.group(1)
        if sigla in SIGLAS_DE_FORA:
            fora[f"de sigla {sigla}"] += 1
            continue
        tipo = TIPO_DA_SIGLA.get(sigla)
        if tipo is None:
            avisos.append(f"{onde}: sigla {sigla} desconhecida; ficou de fora.")
            continue
        regional = _regional(l["centro_custo"])
        if regional is None:
            avisos.append(f"{onde}: centro de custo {l['centro_custo'] or '(vazio)'} desconhecido; ficou de fora.")
            continue
        base = BASE_DO_CENTRO.get(normalizar_nome(l["centro_servico"]))
        if base is None:
            avisos.append(f"{onde}: centro de serviço {l['centro_servico'] or '(vazio)'} desconhecido; "
                          "ficou de fora.")
            continue
        if lid in vistos:
            avisos.append(f"{onde}: equipe repetida nas listas; vale a primeira.")
            continue
        vistos.add(lid)
        chefe = l["colaboradores"].split(",")[0].strip()
        if not chefe:
            avisos.append(f"{onde}: sem colaboradores; entrou com o chefe vazio.")
        equipes.append({"lid": lid, "chefe": chefe, "tipo": tipo, "regional": regional, "base": base})
    for motivo in NAO_SAO_DE_CAMPO:
        if fora[motivo]:
            avisos.append(_de_fora(fora[motivo], motivo, de_campo=False))
    for sigla in SIGLAS_DE_FORA:
        if fora[f"de sigla {sigla}"]:
            avisos.append(_de_fora(fora[f"de sigla {sigla}"], f"de sigla {sigla}", de_campo=True))
    return equipes, avisos
