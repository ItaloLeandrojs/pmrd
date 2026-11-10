import pytest
from pmrd_importador.colunas import id_texto, normalizar_nome
from pmrd_importador.planilha import ErroPlanilha, achar_cabecalho, ler_demanda
from fabrica import criar_demanda, linha


def test_normalizar_e_id_texto():
    assert normalizar_nome("  Etapa  Proj. ") == "ETAPA PROJ."
    assert normalizar_nome("Crítica") == "CRITICA"
    assert normalizar_nome(None) == ""
    assert id_texto(7680854) == "7680854"
    assert id_texto(7680854.0) == "7680854"
    assert id_texto(" -1 ") == "-1"
    assert id_texto(None) is None
    assert id_texto("  ") is None


def test_achar_cabecalho_e_apelidos():
    linhas = [("x",), (None,), ("ID_DEFEITO", "Q TOTAL", "Etapa Proj.", "PROJETO WIN")]
    i, mapa = achar_cabecalho(iter(linhas))
    assert i == 2
    assert mapa["ID_DEFEITO"] == 0 and mapa["Q_TOTAL"] == 1
    assert mapa["ETAPA PROJ."] == 2 and mapa["PROJETO WIN"] == 3


def test_cabecalho_linha_8_win_igual_linha_7_sgm(tmp_path):
    dados = [linha(-9000001, "EXEMPLO-A", "PENDENTE"), linha(-9000002, "EXEMPLO-B", "EXECUÇÃO")]
    a = criar_demanda(tmp_path, "a.xlsx", 7, "PROJETO SGM", "Q_TOTAL", dados)
    b = criar_demanda(tmp_path, "b.xlsx", 8, "PROJETO WIN", "Q TOTAL", dados)
    da, db = ler_demanda(a), ler_demanda(b)
    assert da.defeitos == db.defeitos
    assert [d.id_gom for d in da.defeitos] == ["-9000001", "-9000002"]
    assert all(d.ativo for d in da.defeitos)
    assert da.defeitos[0].projeto == "EXEMPLO-A"


def test_campos_e_estados(tmp_path):
    dados = [
        linha(-9000001, "0", " pendente ", instalacao="---"),
        linha(-9000002, None, "EXECUTADA"),
        linha(-9000003, "EXEMPLO-A", "", demanda=None),
        linha(-9000004, "EXEMPLO-A", "Execucao"),
        linha(None, "EXEMPLO-A", "PENDENTE"),
    ]
    d = ler_demanda(criar_demanda(tmp_path, linhas=dados)).defeitos
    assert len(d) == 4  # sem ID ignorada
    assert d[0].projeto is None and d[0].alimentador is None and d[0].ativo
    assert d[0].estado == "pendente"
    assert d[1].projeto is None and not d[1].ativo
    assert d[2].estado == "" and not d[2].ativo and d[2].demanda is None
    assert d[3].ativo
    assert d[3].estrutura == "EST-1" and d[3].conjunto == "CONJ-1"


def test_sem_coluna_projeto(tmp_path):
    c = criar_demanda(tmp_path, col_projeto=None, linhas=[linha()])
    with pytest.raises(ErroPlanilha) as e:
        ler_demanda(c)
    assert str(e.value) == (f"Planilha {c.name}: coluna do projeto "
                            "(PROJETO SGM ou PROJETO WIN) não encontrada.")


def test_sem_aba(tmp_path):
    c = criar_demanda(tmp_path, com_aba=False, linhas=[linha()])
    with pytest.raises(ErroPlanilha) as e:
        ler_demanda(c)
    assert str(e.value) == f"Planilha {c.name}: aba DEMANDA MENSAL não encontrada."


def test_arquivo_corrompido(tmp_path):
    c = tmp_path / "ruim.xlsx"
    c.write_bytes(b"isto nao e um xlsx")
    with pytest.raises(ErroPlanilha) as e:
        ler_demanda(c)
    assert str(e.value) == (f"Planilha {c.name}: não deu para abrir "
                            "(arquivo incompleto ou corrompido).")


def test_id_repetido_fica_a_ativa(tmp_path):
    dados = [linha(-9000001, "EXEMPLO-A", "EXECUTADA"), linha(-9000002),
             linha(-9000001, "EXEMPLO-B", "PENDENTE")]
    r = ler_demanda(criar_demanda(tmp_path, linhas=dados))
    assert [d.id_gom for d in r.defeitos] == ["-9000001", "-9000002"]
    assert r.defeitos[0].ativo and r.defeitos[0].projeto == "EXEMPLO-B"
    assert r.avisos == ["ID_DEFEITO repetido: -9000001"]
