import pytest
from pmrd_importador.pbm import ler_coordenadas
from pmrd_importador.planilha import ErroPlanilha
from fabrica import criar_demanda, linha


def test_coordenadas_com_virgula(tmp_path):
    coords = [("-9000001", "-5,5000001", "-39,5000001"), ("-9000002", None, "-39,1"),
              ("-9000003", "abc", "-39,1"), ("-9000004", -5.5, -39.5),
              ("-9000009", "-1,0", "-2,0")]
    c = criar_demanda(tmp_path, linhas=[linha()], coordenadas=coords)
    r = ler_coordenadas(c, {"-9000001", "-9000002", "-9000003", "-9000004"})
    assert r == {"-9000001": (-5.5000001, -39.5000001), "-9000004": (-5.5, -39.5)}
    assert all(isinstance(v, float) for par in r.values() for v in par)


def test_sem_aba_pbm(tmp_path):
    c = criar_demanda(tmp_path, linhas=[linha()])
    with pytest.raises(ErroPlanilha) as e:
        ler_coordenadas(c, {"-9000001"})
    assert str(e.value) == f"Planilha {c.name}: aba PBM_Manut_CE não encontrada."
