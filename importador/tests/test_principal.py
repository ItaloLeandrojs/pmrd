import json

from fabrica import criar_demanda, linha
from pmrd_importador.nuvem import ErroNuvem
from pmrd_importador.principal import main


class NuvemFalsa:
    def __init__(self, falha_envio=None):
        self.chamadas = []
        self.falha_envio = falha_envio or {}

    def rpc(self, funcao, argumentos):
        self.chamadas.append((funcao, argumentos))
        if funcao == "enviar_demanda" and argumentos["p_regional"] in self.falha_envio:
            raise ErroNuvem(self.falha_envio[argumentos["p_regional"]])
        return None

    def de(self, funcao):
        return [a for f, a in self.chamadas if f == funcao]


def malha(tmp_path):
    q = [[-100, -100], [100, -100], [100, 100], [-100, 100], [-100, -100]]
    p = tmp_path / "malha.geojson"
    p.write_text(json.dumps({"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"nome": "Cidade"},
         "geometry": {"type": "Polygon", "coordinates": [q]}}]}), encoding="utf-8")
    return p


def pasta(tmp_path, sem_projeto=None, extras=()):
    d = tmp_path / "demanda"
    d.mkdir()
    for pref, reg in (("00_", "CS"), ("01_", "LESTE"), ("02_", "SUL")):
        kw = {"col_projeto": None} if pref == sem_projeto else {}
        criar_demanda(d, f"{pref}demanda.xlsx", linhas=[linha(-9000001, f"EXEMPLO-{reg}")],
                      coordenadas=[(str(-9000001), "-5,6", "-39,4")], **kw)
    for e in extras:
        criar_demanda(d, e, linhas=[linha()], coordenadas=[])
    return d


def rodar(tmp_path, d, *args, nuvem=None):
    return main(["--pasta", str(d), "--malha", str(malha(tmp_path)), *args], nuvem=nuvem)


def test_ensaio_ok_imprime_uma_linha_por_regional(tmp_path, capsys):
    d = pasta(tmp_path)
    assert rodar(tmp_path, d, "--ensaio") == 0
    out = capsys.readouterr().out
    for reg in ("CS", "LESTE", "SUL"):
        assert reg in out
    assert not (d / ".estado.json").exists() and not (d / "importador.log").exists()


def test_regional_com_erro_segue_as_outras(tmp_path):
    d = pasta(tmp_path, sem_projeto="02_")
    nuvem = NuvemFalsa()
    assert rodar(tmp_path, d, nuvem=nuvem) == 1
    assert [a["p_regional"] for a in nuvem.de("enviar_demanda")] == ["CS", "LESTE"]
    erros = nuvem.de("registrar_erro_importacao")
    assert len(erros) == 1 and erros[0]["p_regional"] == "SUL" and "PROJETO" in erros[0]["p_erro"]
    env = nuvem.de("enviar_demanda")[0]["p_envio"]
    assert env["projetos"][0]["municipio"] == "Cidade"


def test_ensaio_com_erro_nao_chama_nuvem_mas_sai_1(tmp_path):
    d = pasta(tmp_path, sem_projeto="02_")
    nuvem = NuvemFalsa()
    assert rodar(tmp_path, d, "--ensaio", nuvem=nuvem) == 1
    assert nuvem.chamadas == []


def test_segunda_rodada_nao_reenvia_e_forcar_reenvia(tmp_path):
    d = pasta(tmp_path)
    n1 = NuvemFalsa()
    assert rodar(tmp_path, d, nuvem=n1) == 0
    assert len(n1.de("enviar_demanda")) == 3
    estado = json.loads((d / ".estado.json").read_text(encoding="utf-8"))
    assert set(estado) == {"00_", "01_", "02_"}
    n2 = NuvemFalsa()
    assert rodar(tmp_path, d, nuvem=n2) == 0
    assert n2.de("enviar_demanda") == []
    n3 = NuvemFalsa()
    assert rodar(tmp_path, d, "--forcar", nuvem=n3) == 0
    assert len(n3.de("enviar_demanda")) == 3
    assert "importador.log" in [p.name for p in d.iterdir()]


def test_dois_arquivos_com_o_mesmo_prefixo(tmp_path):
    d = pasta(tmp_path, extras=["02_outra.xlsx"])
    nuvem = NuvemFalsa()
    assert rodar(tmp_path, d, nuvem=nuvem) == 1
    erros = nuvem.de("registrar_erro_importacao")
    assert [e["p_regional"] for e in erros] == ["SUL"]
    assert erros[0]["p_erro"] == "Mais de uma planilha 02_ na pasta. Deixe só uma."
    assert [a["p_regional"] for a in nuvem.de("enviar_demanda")] == ["CS", "LESTE"]


def test_regional_sem_arquivo_nao_e_erro(tmp_path):
    d = pasta(tmp_path)
    next(d.glob("01_*")).unlink()
    nuvem = NuvemFalsa()
    assert rodar(tmp_path, d, nuvem=nuvem) == 0
    assert nuvem.de("registrar_erro_importacao") == []


def test_erro_inesperado_vira_erro_registrado(tmp_path):
    d = pasta(tmp_path)
    next(d.glob("00_*")).write_bytes(b"nao e xlsx")
    nuvem = NuvemFalsa()
    assert rodar(tmp_path, d, nuvem=nuvem) == 1
    assert [e["p_regional"] for e in nuvem.de("registrar_erro_importacao")] == ["CS"]
    assert len(nuvem.de("enviar_demanda")) == 2


def test_erro_da_nuvem_nao_derruba_nem_grava_assinatura(tmp_path):
    d = pasta(tmp_path)
    nuvem = NuvemFalsa(falha_envio={"LESTE": "Prioridade fora de 1 a 11."})
    assert rodar(tmp_path, d, nuvem=nuvem) == 1
    assert len(nuvem.de("enviar_demanda")) == 3
    estado = json.loads((d / ".estado.json").read_text(encoding="utf-8"))
    assert set(estado) == {"00_", "02_"}


def test_ensaio_sem_malha_avisa_e_sem_ensaio_e_erro(tmp_path, capsys):
    d = pasta(tmp_path)
    assert main(["--pasta", str(d), "--malha", str(tmp_path / "nao.geojson"), "--ensaio"]) == 0
    assert "malha" in capsys.readouterr().out.lower()
    assert main(["--pasta", str(d), "--malha", str(tmp_path / "nao.geojson")], nuvem=NuvemFalsa()) == 1
