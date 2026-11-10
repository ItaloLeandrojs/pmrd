"""Leitura das coordenadas na aba PBM_Manut_CE."""
import math
from pathlib import Path

from .colunas import id_texto
from .planilha import ErroPlanilha, abrir, linhas_com_cabecalho

ABA = "PBM_Manut_CE"


def _numero(v: object) -> float | None:
    """Número de verdade (float) a partir de número ou texto com vírgula."""
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        n = float(v)
    else:
        t = str(v).strip().replace(",", ".")
        if not t:
            return None
        try:
            n = float(t)
        except ValueError:
            return None
    return n if math.isfinite(n) else None


def ler_coordenadas(caminho: Path, ids: set[str]) -> dict[str, tuple[float, float]]:
    caminho = Path(caminho)
    wb = abrir(caminho)
    try:
        mapa, dados = linhas_com_cabecalho(wb, ABA, caminho)
        for nome in ("LATITUDE", "LONGITUDE"):
            if nome not in mapa:
                raise ErroPlanilha(f"Planilha {caminho.name}: coluna {nome} não encontrada na aba {ABA}.")
        ci, cla, clo = mapa["ID_DEFEITO"], mapa["LATITUDE"], mapa["LONGITUDE"]
        achados: dict[str, tuple[float, float]] = {}
        faltam = set(ids)
        try:
            for linha in dados:
                if not faltam:
                    break
                idd = id_texto(linha[ci] if ci < len(linha) else None)
                if idd is None or idd not in faltam:
                    continue
                lat = _numero(linha[cla] if cla < len(linha) else None)
                lng = _numero(linha[clo] if clo < len(linha) else None)
                if lat is None or lng is None:
                    continue
                achados[idd] = (lat, lng)
                faltam.discard(idd)
        except ErroPlanilha:
            raise
        except Exception as e:
            raise ErroPlanilha(f"Planilha {caminho.name}: não deu para abrir "
                               "(arquivo incompleto ou corrompido).") from e
        return achados
    finally:
        wb.close()
