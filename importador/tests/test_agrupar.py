from pmrd_importador.agrupar import assinatura_arquivo, montar_envio
from pmrd_importador.planilha import Defeito, Demanda


class MunFalso:
    """lng < 10 -> 'A'; senão 'B'."""

    def municipio_de(self, lat, lng):
        return "A" if lng < 10 else "B"


def d(id_, projeto="EXEMPLO-A", estado="PENDENTE", ativo=True, alim="ALIM-1", demanda="Obra"):
    return Defeito(id_gom=id_, projeto=projeto, estado=estado, ativo=ativo, estrutura="EST",
                   alimentador=alim, demanda=demanda, conjunto="C")


COORDS = {"1": (-5.0, 1.0), "2": (-5.0, 2.0), "3": (-5.0, 20.0)}


def test_agrupa_municipio_alimentadores_prioridade():
    dem = Demanda([d("1"), d("2", alim="ALIM-2"), d("3")], ["ID_DEFEITO repetido: 9"])
    env = montar_envio(dem, COORDS, MunFalso(), "SUL")
    assert len(env["projetos"]) == 1
    p = env["projetos"][0]
    assert p["projeto"] == "EXEMPLO-A" and p["municipio"] == "A"
    assert p["alimentadores"] == ["ALIM-1", "ALIM-2"]
    assert [x["id_gom"] for x in p["defeitos"]] == ["1", "2", "3"]
    assert p["defeitos"][0]["prioridade"] == 8
    assert p["defeitos"][0]["lat"] == -5.0 and isinstance(p["defeitos"][0]["lng"], float)
    assert p["defeitos"][0]["estado_enel"] == "PENDENTE"
    assert env["presentes"] == ["EXEMPLO-A"] and env["fechados"] == []
    assert env["avisos"] == ["ID_DEFEITO repetido: 9"]


def test_empate_de_municipio_vai_pela_ordem_alfabetica():
    env = montar_envio(Demanda([d("1"), d("3")]), COORDS, MunFalso(), "CS")
    assert env["projetos"][0]["municipio"] == "A"


def test_sem_projeto_fechado_e_avisos():
    dem = Demanda([
        d("1", projeto=None),
        d("2", projeto="EXEMPLO-B", estado="EXECUTADA", ativo=False),
        d("4", projeto=None, estado="CORRIGIDO", ativo=False),
        d("5", projeto="EXEMPLO-C", estado="", ativo=False),
        d("6", demanda="XYZ"), d("7", demanda="XYZ"),
    ])
    env = montar_envio(dem, COORDS, MunFalso(), "SUL")
    nomes = [p["projeto"] for p in env["projetos"]]
    assert "SEM-PROJETO-SUL" in nomes and "EXEMPLO-A" in nomes
    assert env["fechados"] == [{"id_gom": "2", "estado_enel": "EXECUTADA"},
                               {"id_gom": "4", "estado_enel": "CORRIGIDO"}]
    assert {"SEM-PROJETO-SUL", "EXEMPLO-B", "EXEMPLO-A"} <= set(env["presentes"])
    assert all(isinstance(x, str) and x for x in env["presentes"])
    assert len(env["presentes"]) == len(set(env["presentes"]))
    assert "Prioridade desconhecida: XYZ (2 defeitos)" in env["avisos"]
    assert any("sem coordenada" in a for a in env["avisos"])
    a = next(p for p in env["projetos"] if p["projeto"] == "EXEMPLO-A")
    desconhecido = [x for x in a["defeitos"] if x["id_gom"] == "6"][0]
    assert desconhecido["prioridade"] is None and desconhecido["lat"] is None


def test_sem_coordenada_municipio_nulo():
    env = montar_envio(Demanda([d("9")]), {}, MunFalso(), "LESTE")
    assert env["projetos"][0]["municipio"] is None
    assert "1 defeitos sem coordenada na PBM" in env["avisos"]


def test_assinatura_muda_com_o_conteudo(tmp_path):
    a = tmp_path / "a"
    a.write_bytes(b"x")
    b = tmp_path / "b"
    b.write_bytes(b"x")
    c = tmp_path / "c"
    c.write_bytes(b"y")
    assert assinatura_arquivo(a) == assinatura_arquivo(b) != assinatura_arquivo(c)
