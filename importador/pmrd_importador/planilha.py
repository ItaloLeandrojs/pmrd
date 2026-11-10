"""Leitura da aba DEMANDA MENSAL da planilha da Enel."""
from dataclasses import dataclass, field
from itertools import chain, islice
from pathlib import Path
from typing import Iterable

from openpyxl import load_workbook

from .colunas import id_texto, nome_canonico, normalizar_nome


class ErroPlanilha(Exception):
    """Mensagem em português, pronta para a tela."""


@dataclass(frozen=True)
class Defeito:
    id_gom: str
    projeto: str | None
    estado: str
    ativo: bool
    estrutura: str | None
    alimentador: str | None
    demanda: str | None
    conjunto: str | None


@dataclass
class Demanda:
    defeitos: list[Defeito]
    avisos: list[str] = field(default_factory=list)


ESTADOS_ATIVOS = {"PENDENTE", "EXECUCAO"}


class CabecalhoNaoAchado(ErroPlanilha):
    pass


def achar_cabecalho(linhas: Iterable[tuple], max_linhas: int = 40) -> tuple[int, dict[str, int]]:
    """Acha a linha com a célula ID_DEFEITO nas `max_linhas` primeiras.
    Devolve (índice da linha, {nome canônico: índice da coluna}); vale a 1ª coluna de cada nome."""
    for i, linha in enumerate(islice(linhas, max_linhas)):
        nomes = [nome_canonico(c) for c in linha]
        if "ID_DEFEITO" in nomes:
            mapa: dict[str, int] = {}
            for j, n in enumerate(nomes):
                if n and n not in mapa:
                    mapa[n] = j
            return i, mapa
    raise CabecalhoNaoAchado(f"cabeçalho (ID_DEFEITO) não encontrado nas {max_linhas} primeiras linhas.")


def abrir(caminho: Path):
    try:
        return load_workbook(caminho, read_only=True, data_only=True)
    except Exception as e:  # zip ruim, arquivo incompleto, formato errado
        raise ErroPlanilha(
            f"Planilha {caminho.name}: não deu para abrir (arquivo incompleto ou corrompido).") from e


def linhas_com_cabecalho(wb, aba: str, caminho: Path):
    """Devolve (mapa de colunas, iterador das linhas de dados)."""
    if aba not in wb.sheetnames:
        raise ErroPlanilha(f"Planilha {caminho.name}: aba {aba} não encontrada.")
    ws = wb[aba]
    it = ws.iter_rows(values_only=True)
    primeiras = list(islice(it, 40))
    try:
        i, mapa = achar_cabecalho(iter(primeiras), 40)
    except CabecalhoNaoAchado as e:
        raise ErroPlanilha(f"Planilha {caminho.name}: aba {aba}: {e}") from e
    return mapa, chain(primeiras[i + 1:], it)


def _texto(v: object) -> str | None:
    if v is None:
        return None
    t = str(v).strip()
    return t or None


def _projeto(v: object) -> str | None:
    t = id_texto(v) if not isinstance(v, str) else _texto(v)
    if t is None or t == "0":
        return None
    return t


def _celula(linha: tuple, idx: int):
    return linha[idx] if idx < len(linha) else None


def ler_demanda(caminho: Path) -> Demanda:
    caminho = Path(caminho)
    wb = abrir(caminho)
    try:
        mapa, dados = linhas_com_cabecalho(wb, "DEMANDA MENSAL", caminho)
        col_proj = "PROJETO SGM" if "PROJETO SGM" in mapa else (
            "PROJETO WIN" if "PROJETO WIN" in mapa else None)
        if col_proj is None:
            raise ErroPlanilha(f"Planilha {caminho.name}: coluna do projeto "
                               "(PROJETO SGM ou PROJETO WIN) não encontrada.")
        for nome in ("ID_DEFEITO", "ESTRUTURA", "ESTADO", "INSTALACAO", "DEMANDA", "CONJUNTO"):
            if nome not in mapa:
                raise ErroPlanilha(f"Planilha {caminho.name}: coluna {nome} não encontrada.")
        c = {n: mapa[n] for n in ("ID_DEFEITO", "ESTRUTURA", "ESTADO", "INSTALACAO", "DEMANDA", "CONJUNTO")}
        c_proj = mapa[col_proj]
        por_id: dict[str, list[Defeito]] = {}
        try:
            for linha in dados:
                id_gom = id_texto(_celula(linha, c["ID_DEFEITO"]))
                if id_gom is None:
                    continue
                estado = _texto(_celula(linha, c["ESTADO"])) or ""
                inst = _texto(_celula(linha, c["INSTALACAO"]))
                if inst == "---":
                    inst = None
                por_id.setdefault(id_gom, []).append(Defeito(
                    id_gom=id_gom,
                    projeto=_projeto(_celula(linha, c_proj)),
                    estado=estado,
                    ativo=normalizar_nome(estado) in ESTADOS_ATIVOS,
                    estrutura=_texto(_celula(linha, c["ESTRUTURA"])),
                    alimentador=inst,
                    demanda=_texto(_celula(linha, c["DEMANDA"])),
                    conjunto=_texto(_celula(linha, c["CONJUNTO"])),
                ))
        except ErroPlanilha:
            raise
        except Exception as e:
            raise ErroPlanilha(f"Planilha {caminho.name}: não deu para abrir "
                               "(arquivo incompleto ou corrompido).") from e
    finally:
        wb.close()
    defeitos, avisos = [], []
    for id_gom, lista in por_id.items():
        if len(lista) > 1:
            avisos.append(f"ID_DEFEITO repetido: {id_gom}")
        defeitos.append(next((d for d in lista if d.ativo), lista[0]))
    return Demanda(defeitos, avisos)
