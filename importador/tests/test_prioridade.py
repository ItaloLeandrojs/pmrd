import pytest
from pmrd_importador.prioridade import prioridade_da_demanda


@pytest.mark.parametrize("nome,esperado", [
    ("Conj Crítico", 7), ("CRÍTICA", 7), ("TELECONTROLE", 5), ("Furto  ", 11),
    ("Chave de Obra", 8), ("Dem Extra", 11), ("justiça", 1), (None, None), ("XYZ", None),
    ("RNT", 2), ("Ouvidoria", 3), ("Banco Regulador", 4), ("TLC", 5), ("Tripsaver", 6),
    ("Obra", 8), ("WTS", 9), ("Plano PCB", 10),
])
def test_prioridade(nome, esperado):
    assert prioridade_da_demanda(nome) == esperado
