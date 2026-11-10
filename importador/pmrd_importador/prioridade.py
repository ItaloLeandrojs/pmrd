"""Prioridade (1 a 11) a partir do nome na coluna DEMANDA."""
from .colunas import normalizar_nome

_MAPA = {
    "JUSTICA": 1, "RNT": 2, "OUVIDORIA": 3, "BANCO REGULADOR": 4,
    "TLC": 5, "TELECONTROLE": 5, "TRIPSAVER": 6,
    "CONJ CRITICO": 7, "CRITICA": 7,
    "OBRA": 8, "CHAVE DE OBRA": 8, "WTS": 9, "PLANO PCB": 10,
    "DEM EXTRA": 11, "FURTO": 11,
}


def prioridade_da_demanda(nome: str | None) -> int | None:
    if nome is None:
        return None
    return _MAPA.get(normalizar_nome(nome))
