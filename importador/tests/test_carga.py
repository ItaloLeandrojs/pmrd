import json
import tempfile
from datetime import datetime
from pathlib import Path

import pytest

from fabrica import criar_demanda, criar_xlsm, linha, linha_carteira
from pmrd_importador import carga
from pmrd_importador.carga import ler_carteira_xlsm, ler_lista_xlsm, main, montar_carga
from pmrd_importador.municipios import Municipios
from pmrd_importador.planilha import Defeito, Demanda

# Tarefa 7: carga inicial do xlsm e da demanda. Tudo fictício.

QUADRADO = [[-100, -100], [100, -100], [100, 100], [-100, 100], [-100, -100]]
MALHA = Municipios([("Exemplópolis", (-100, -100, 100, 100), [[QUADRADO]])])


def defeito(id_gom, projeto, estado="PENDENTE", demanda="Obra"):
    return Defeito(id_gom=id_gom, projeto=projeto, estado=estado,
                   ativo=estado in ("PENDENTE", "EXECUÇÃO"), estrutura="EXEMPLO-EST",
                   alimentador="EXE01S1", demanda=demanda, conjunto=None)


def vazias():
    return {"CS": Demanda([]), "LESTE": Demanda([]), "SUL": Demanda([])}


# ---------------------------------------------------------------- leitura do xlsm

def test_id_gom_com_quebra_de_linha_vira_lista_e_linha_sem_projeto_e_ignorada(tmp_path):
    x = criar_xlsm(tmp_path, carteira=[
        linha_carteira(**{"ID GOM": "-9000001\n-9000002", "QTD DEFEITOS": 2,
                          "ESTRUTURA": "EXEMPLO-EST-1\nEXEMPLO-EST-2", "PRIORIDADE": "Obra\nTLC"}),
        linha_carteira(PROJETO=None),
        linha_carteira(PROJETO=99999000001, **{"ID GOM": -9000003}),
    ])
    c = ler_carteira_xlsm(x)
    assert [l["projeto"] for l in c] == ["EXEMPLO-0001", "99999000001"]
    assert c[0]["ids"] == ["-9000001", "-9000002"]
    assert c[0]["estruturas"] == ["EXEMPLO-EST-1", "EXEMPLO-EST-2"]
    assert c[0]["prioridades"] == ["Obra", "TLC"]
    assert c[1]["ids"] == ["-9000003"]


def test_datas_viram_aaaa_mm_dd(tmp_path):
    x = criar_xlsm(tmp_path, carteira=[linha_carteira(**{
        "PRAZO DA PRÓXIMA AÇÃO": datetime(2026, 10, 10), "DATA DA VISTORIA": "05/09/2026",
        "DATA DO ENVIO DA VISTORIA": "sem data"})])
    [l] = ler_carteira_xlsm(x)
    assert l["prazo_proxima_acao"] == "2026-10-10"
    assert l["vistoria_data"] == "2026-09-05"
    assert l["vistoria_enviada_em"] is None
    assert any("DATA DO ENVIO DA VISTORIA" in a for a in l["avisos"])


def test_lista_le_equipes_e_solicitantes_e_lvr_vira_maiusculo(tmp_path):
    x = criar_xlsm(tmp_path, equipes=[("JZN-ML-99X", "Pessoa Exemplo 1", "ML"),
                                      ("CPS-LV-99X", "Pessoa Exemplo 2", "LVr")],
                   solicitantes=["Solicitante Exemplo 1", "Solicitante Exemplo 2"])
    equipes, solicitantes = ler_lista_xlsm(x)
    assert [(e["lid"], e["tipo"]) for e in equipes] == [("JZN-ML-99X", "ML"), ("CPS-LV-99X", "LVR")]
    assert solicitantes == ["Solicitante Exemplo 1", "Solicitante Exemplo 2"]


def test_xlsm_sem_coluna_obrigatoria_e_erro(tmp_path):
    from pmrd_importador.planilha import ErroPlanilha
    from openpyxl import load_workbook
    x = criar_xlsm(tmp_path, carteira=[linha_carteira()])
    wb = load_workbook(x)
    wb["CARTEIRA"].cell(row=1, column=13, value="OUTRA COISA")   # ETAPA DA CARTEIRA
    wb.save(x)
    with pytest.raises(ErroPlanilha, match="ETAPA DA CARTEIRA"):
        ler_carteira_xlsm(x)


# ---------------------------------------------------------------- montar_carga

def carteira_basica():
    return [
        # Na demanda do SUL: vira enel.
        linha_carteira(**{"ID GOM": "-9000001\n-9000002", "QTD DEFEITOS": 2,
                          "PRIORIDADE": "Obra\nDem Extra", "ETAPA DA CARTEIRA": "SGD CONFIRMADO"}),
        # Fora da demanda do CS: vira manual.
        linha_carteira(PROJETO="EXEMPLO-0002", CARTEIRA="C.S", **{
            "ID GOM": None, "QTD DEFEITOS": 4, "ETAPA DA CARTEIRA": "ETAPA ESTRANHA"}),
        # Regional fora da lista: fica de fora.
        linha_carteira(PROJETO="EXEMPLO-0004", CARTEIRA="NORTE", **{"ID GOM": -9000009}),
    ]


def montar(tmp_path, carteira=None, demandas=None, coords=None, equipes=None, solicitantes=None):
    x = criar_xlsm(tmp_path, carteira=carteira if carteira is not None else carteira_basica())
    linhas = ler_carteira_xlsm(x)
    if demandas is None:
        demandas = vazias()
        demandas["SUL"] = Demanda([
            defeito("-9000001", "EXEMPLO-0001", demanda="TLC"),
            defeito("-9000005", "EXEMPLO-0003"),
            defeito("-9000006", "EXEMPLO-0009", estado="EXECUTADA"),
        ])
    if coords is None:
        coords = {"-9000001": (-7.2, -39.4), "-9000005": (-7.3, -39.5)}
    return montar_carga(linhas, demandas, coords, MALHA, equipes or [], solicitantes or [])


def por_nome(c):
    return {p["projeto"]: p for p in c["projetos"]}


def test_projeto_na_demanda_vira_enel_com_ativos_mais_ids_so_do_xlsm(tmp_path):
    c = montar(tmp_path)
    p = por_nome(c)["EXEMPLO-0001"]
    assert p["origem"] == "enel" and p["regional"] == "SUL"
    assert p["etapa"] == "PROGRAMADA"                       # SGD CONFIRMADO
    assert [d["id_gom"] for d in p["defeitos"]] == ["-9000001", "-9000002"]
    d1, d2 = p["defeitos"]
    assert d1["estado_enel"] == "PENDENTE" and d1["prioridade"] == 5   # TLC da demanda
    assert isinstance(d1["lat"], float) and isinstance(d1["lng"], float)
    assert d2["estado_enel"] is None and d2["prioridade"] == 11       # Dem Extra do xlsm
    assert p["prioridade"] == 5                              # a menor dos ativos da demanda
    assert p["alimentadores"] == ["EXE01S1"]
    assert p["qtd_defeitos_informada"] is None


def test_projeto_fora_da_demanda_vira_manual_e_c_s_vira_cs(tmp_path):
    c = montar(tmp_path)
    p = por_nome(c)["EXEMPLO-0002"]
    assert p["origem"] == "manual" and p["regional"] == "CS"
    assert p["defeitos"] == [] and p["qtd_defeitos_informada"] == 4
    assert p["etapa"] == "EM ANÁLISE"
    assert any("ETAPA ESTRANHA" in a and "EXEMPLO-0002" in a for a in c["avisos"])


def test_regional_desconhecida_fica_de_fora_com_aviso(tmp_path):
    c = montar(tmp_path)
    assert "EXEMPLO-0004" not in por_nome(c)
    assert any("NORTE" in a and "EXEMPLO-0004" in a for a in c["avisos"])


@pytest.mark.parametrize("texto", ["SUL", "CS", "C.S", "CENTRO SUL", "CENTRO-SUL", "LESTE", "centro-sul"])
def test_nomes_da_regional(tmp_path, texto):
    c = montar(tmp_path, carteira=[linha_carteira(CARTEIRA=texto, **{"ID GOM": None})], demandas=vazias())
    esperado = {"SUL": "SUL", "LESTE": "LESTE"}.get(texto, "CS")
    assert c["projetos"][0]["regional"] == esperado


def test_projeto_so_da_demanda_entra_pela_demanda_com_municipio_da_coordenada(tmp_path):
    c = montar(tmp_path)
    assert [p["projeto"] for p in c["da_demanda"]] == ["EXEMPLO-0003"]
    p = c["da_demanda"][0]
    assert p["regional"] == "SUL" and p["municipio"] == "Exemplópolis"
    assert p["defeitos"][0]["lat"] == -7.3
    # Projeto só com defeito fechado não entra.
    assert "EXEMPLO-0009" not in [x["projeto"] for x in c["da_demanda"]]


def test_id_do_xlsm_ativo_em_outro_projeto_da_demanda_fica_la(tmp_path):
    car = [linha_carteira(PROJETO="EXEMPLO-0002", **{"ID GOM": "-9000005\n-9000007"})]
    c = montar(tmp_path, carteira=car)
    p = por_nome(c)["EXEMPLO-0002"]
    assert [d["id_gom"] for d in p["defeitos"]] == ["-9000007"]
    assert any("-9000005" in a and "EXEMPLO-0003" in a for a in c["avisos"])


def test_projeto_repetido_no_xlsm_vale_o_primeiro(tmp_path):
    car = [linha_carteira(**{"ID GOM": None}), linha_carteira(**{"ID GOM": None, "ETAPA DA CARTEIRA": "PROGRAMADA"})]
    c = montar(tmp_path, carteira=car, demandas=vazias())
    assert len(c["projetos"]) == 1 and c["projetos"][0]["etapa"] == "AGUARDANDO VISTORIA"
    assert any("repetido" in a and "EXEMPLO-0001" in a for a in c["avisos"])


def test_equipes_base_regional_grupo_e_prefixo_desconhecido(tmp_path):
    equipes = [
        {"lid": "JZN-ML-99X", "chefe": "Pessoa Exemplo 1", "tipo": "ML"},
        {"lid": "CPS-LV-99X", "chefe": "Pessoa Exemplo 2", "tipo": "LVR"},
        {"lid": "ICO-MP-99X", "chefe": "Pessoa Exemplo 3", "tipo": "MP"},
        {"lid": "XYZ-ML-01", "chefe": "Pessoa Exemplo 4", "tipo": "ML"},
    ]
    c = montar(tmp_path, equipes=equipes, solicitantes=["Solicitante Exemplo"])
    eq = {e["lid"]: e for e in c["equipes"]}
    assert set(eq) == {"JZN-ML-99X", "CPS-LV-99X", "ICO-MP-99X"}
    assert eq["JZN-ML-99X"] == {"lid": "JZN-ML-99X", "chefe": "Pessoa Exemplo 1", "tipo": "ML",
                                "regional": "SUL", "base": "JZN", "grupo_report": "ML Juazeiro"}
    assert eq["CPS-LV-99X"]["regional"] == "SUL" and eq["CPS-LV-99X"]["grupo_report"] == "Linha Viva"
    assert eq["ICO-MP-99X"]["regional"] == "CS" and eq["ICO-MP-99X"]["grupo_report"] == "Manutenção Pesada"
    assert any("XYZ-ML-01" in a for a in c["avisos"])
    assert c["solicitantes"] == ["Solicitante Exemplo"]


def test_carga_vira_json(tmp_path):
    c = montar(tmp_path)
    assert json.loads(json.dumps(c)) == c


# ---------------------------------------------------------------- main

class NuvemFalsa:
    def __init__(self):
        self.chamadas = []

    def entrar(self, email, senha):
        self.chamadas.append(("entrar", email))

    def rpc(self, funcao, argumentos):
        self.chamadas.append((funcao, argumentos))
        return {"projetos_enel": 1, "avisos": []}


def preparar(tmp_path):
    x = criar_xlsm(tmp_path, carteira=carteira_basica(),
                   equipes=[("CPS-LV-99X", "Pessoa Exemplo", "LVr"), ("XYZ-ML-01", "Pessoa Exemplo", "ML")],
                   solicitantes=["Solicitante Exemplo"])
    d = tmp_path / "demanda"
    d.mkdir()
    criar_demanda(d, "00_cs.xlsx", linhas=[], coordenadas=[])
    criar_demanda(d, "01_leste.xlsx", linhas=[], coordenadas=[])
    criar_demanda(d, "02_sul.xlsx", linhas=[linha(-9000001, "EXEMPLO-0001"), linha(-9000005, "EXEMPLO-0003")],
                  coordenadas=[("-9000001", "-7,2", "-39,4"), ("-9000005", "-7,3", "-39,5")])
    m = tmp_path / "malha.geojson"
    m.write_text(json.dumps({"type": "FeatureCollection", "features": [
        {"type": "Feature", "properties": {"nome": "Exemplópolis"},
         "geometry": {"type": "Polygon", "coordinates": [QUADRADO]}}]}), encoding="utf-8")
    return ["--xlsm", str(x), "--pasta", str(d), "--malha", str(m)]


def test_main_ensaio_sai_0_e_nao_chama_a_nuvem(tmp_path, capsys, monkeypatch):
    def proibido(*a, **k):
        raise AssertionError("o ensaio não pode chamar a nuvem")
    monkeypatch.setattr(carga, "Nuvem", proibido)
    monkeypatch.setattr("builtins.input", proibido)
    nuvem = NuvemFalsa()
    assert main(["--ensaio", *preparar(tmp_path)], nuvem=nuvem) == 0
    assert nuvem.chamadas == []
    out = capsys.readouterr().out
    assert "SUL" in out and "CS" in out
    assert "CPS-LV-99X" in out and "XYZ-ML-01" in out
    assert "PROGRAMADA" in out
    assert "EXEMPLO-0004" in out                      # aviso da regional NORTE


def test_main_sem_ensaio_pede_carregar_e_chama_a_funcao(tmp_path, monkeypatch, capsys):
    respostas = iter(["admin@exemplo.test", "CARREGAR"])
    monkeypatch.setattr("builtins.input", lambda *a: next(respostas))
    monkeypatch.setattr("getpass.getpass", lambda *a, **k: "senha-de-teste")
    nuvem = NuvemFalsa()
    assert main(preparar(tmp_path) + ["--apagar-exemplos"], nuvem=nuvem) == 0
    assert nuvem.chamadas[0] == ("entrar", "admin@exemplo.test")
    [(funcao, args)] = nuvem.chamadas[1:]
    assert funcao == "carga_inicial" and args["p_apagar_exemplos"] is True
    assert {p["projeto"] for p in args["p_carga"]["projetos"]} == {"EXEMPLO-0001", "EXEMPLO-0002"}
    assert [p["projeto"] for p in args["p_carga"]["da_demanda"]] == ["EXEMPLO-0003"]


def test_main_sem_carregar_digitado_nao_chama_a_funcao(tmp_path, monkeypatch):
    respostas = iter(["admin@exemplo.test", "carregar depois"])
    monkeypatch.setattr("builtins.input", lambda *a: next(respostas))
    monkeypatch.setattr("getpass.getpass", lambda *a, **k: "senha-de-teste")
    nuvem = NuvemFalsa()
    assert main(preparar(tmp_path), nuvem=nuvem) == 1
    assert [c[0] for c in nuvem.chamadas] == ["entrar"]


def test_main_sem_planilha_de_uma_regional_e_erro(tmp_path, capsys):
    args = preparar(tmp_path)
    next((tmp_path / "demanda").glob("01_*")).unlink()
    assert main(["--ensaio", *args], nuvem=NuvemFalsa()) == 1
    assert "01_" in capsys.readouterr().out


def test_main_nao_deixa_copia_nem_mexe_no_xlsm(tmp_path, monkeypatch):
    args = preparar(tmp_path)
    temporaria = tmp_path / "temporaria"
    temporaria.mkdir()
    monkeypatch.setattr(tempfile, "tempdir", str(temporaria))
    criadas = []
    criar = tempfile.mkdtemp

    def espiar(*a, **k):
        criadas.append(criar(*a, **k))
        return criadas[-1]
    monkeypatch.setattr(tempfile, "mkdtemp", espiar)
    xlsm = tmp_path / "controle.xlsm"
    antes = xlsm.read_bytes()
    assert main(["--ensaio", *args], nuvem=NuvemFalsa()) == 0
    assert xlsm.read_bytes() == antes
    assert criadas and all(Path(c).parent == temporaria for c in criadas)   # a cópia foi feita lá
    assert list(temporaria.iterdir()) == []
    assert sorted(p.name for p in tmp_path.iterdir()) == ["controle.xlsm", "demanda", "malha.geojson", "temporaria"]


def test_main_copia_presa_avisa(tmp_path, monkeypatch, capsys):
    args = preparar(tmp_path)

    apagar = carga.shutil.rmtree

    def falha(caminho, *a, **k):
        apagar(caminho)          # apaga de verdade e finge que falhou
        raise OSError("EXEMPLO: arquivo em uso")
    monkeypatch.setattr(carga.shutil, "rmtree", falha)
    assert main(["--ensaio", *args], nuvem=NuvemFalsa()) == 0
    assert "não foi apagada" in capsys.readouterr().out


def test_main_erro_inesperado_mostra_tipo_e_mensagem(tmp_path, monkeypatch, capsys):
    args = preparar(tmp_path)

    def falha(*a, **k):
        raise ValueError("EXEMPLO de falha")
    monkeypatch.setattr(carga, "ler_lista_xlsm", falha)
    assert main(["--ensaio", *args], nuvem=NuvemFalsa()) == 1
    assert "ValueError: EXEMPLO de falha" in capsys.readouterr().out


# ---------------------------------------------------------------- decisões de 11/11

def test_d2_id_do_xlsm_no_sem_projeto_fica_no_projeto_do_xlsm(tmp_path):
    car = [linha_carteira(PROJETO="EXEMPLO-0002", **{"ID GOM": "-9000008", "PRIORIDADE": "WTS"})]
    demandas = vazias()
    demandas["SUL"] = Demanda([defeito("-9000008", None, demanda="TLC"), defeito("-9000010", None)])
    c = montar(tmp_path, carteira=car, demandas=demandas, coords={"-9000008": (-7.2, -39.4)})
    [p] = c["projetos"]
    assert p["origem"] == "manual"
    [d] = p["defeitos"]
    assert d == {"id_gom": "-9000008", "prioridade": 5, "estrutura": "EXEMPLO-EST", "alimentador": "EXE01S1",
                 "estado_enel": "PENDENTE", "lat": -7.2, "lng": -39.4}
    [sem] = c["da_demanda"]
    assert sem["projeto"] == "SEM-PROJETO-SUL"
    assert [x["id_gom"] for x in sem["defeitos"]] == ["-9000010"]
    assert not any("-9000008" in a for a in c["avisos"])


def test_d2_sem_projeto_que_fica_vazio_nao_entra(tmp_path):
    car = [linha_carteira(PROJETO="EXEMPLO-0002", **{"ID GOM": "-9000008"})]
    demandas = vazias()
    demandas["SUL"] = Demanda([defeito("-9000008", None)])
    c = montar(tmp_path, carteira=car, demandas=demandas, coords={})
    assert c["da_demanda"] == []
    assert [d["id_gom"] for d in c["projetos"][0]["defeitos"]] == ["-9000008"]


def test_d3_prioridade_separada_por_barra(tmp_path):
    car = [linha_carteira(**{"ID GOM": "-9000001\n-9000002", "PRIORIDADE": "Conj Crítico / WTS"})]
    [l] = ler_carteira_xlsm(criar_xlsm(tmp_path, carteira=car))
    assert l["prioridades"] == ["Conj Crítico", "WTS"]
    c = montar_carga([l], vazias(), {}, MALHA, [], [])
    assert [d["prioridade"] for d in c["projetos"][0]["defeitos"]] == [7, 9]
    assert c["projetos"][0]["prioridade"] == 7
    assert not any("desconhecida" in a for a in c["avisos"])


def test_d3_id_gom_com_virgula_no_fim(tmp_path):
    car = [linha_carteira(**{"ID GOM": "-9000001,\n-9000002\n-9000003;"})]
    [l] = ler_carteira_xlsm(criar_xlsm(tmp_path, carteira=car))
    assert l["ids"] == ["-9000001", "-9000002"]
    assert any("-9000003;" in a for a in l["avisos"])


@pytest.mark.parametrize("valor,esperado,aviso", [
    ("85\n3", 88, False), ("\n97\n0", 97, False), (12, 12, False), ("12\nEXEMPLO", None, True)])
def test_d3_qtd_clientes_um_por_linha_soma(tmp_path, valor, esperado, aviso):
    [l] = ler_carteira_xlsm(criar_xlsm(tmp_path, carteira=[linha_carteira(**{"QTD CLIENTES": valor})]))
    assert l["qtd_clientes"] == esperado
    assert any("QTD CLIENTES" in a for a in l["avisos"]) == aviso


def test_d3_municipio_com_o_nome_do_ibge(tmp_path):
    car = [linha_carteira(MUNICÍPIO="EXEMPLOPOLIS", **{"ID GOM": None}),
           linha_carteira(PROJETO="EXEMPLO-0002", MUNICÍPIO="Outra Exemplo", **{"ID GOM": None}),
           linha_carteira(PROJETO="EXEMPLO-0003", MUNICÍPIO="outra exemplo", **{"ID GOM": None})]
    c = montar(tmp_path, carteira=car, demandas=vazias())
    p = por_nome(c)
    assert p["EXEMPLO-0001"]["municipio"] == "Exemplópolis"
    assert p["EXEMPLO-0002"]["municipio"] == "Outra Exemplo"
    assert p["EXEMPLO-0003"]["municipio"] == "outra exemplo"
    sem_par = [a for a in c["avisos"] if "Outra Exemplo" in a or "outra exemplo" in a]
    assert len(sem_par) == 2


def test_d3_prioridade_e_estrutura_alinham_pelas_linhas_cruas(tmp_path):
    car = [linha_carteira(**{"ID GOM": "-9000001\nEXEMPLO-LIXO\n-9000003", "PRIORIDADE": "Obra\nTLC\nWTS",
                             "ESTRUTURA": "EXEMPLO-E1\nEXEMPLO-E2\nEXEMPLO-E3"})]
    c = montar(tmp_path, carteira=car, demandas=vazias(), coords={})
    ds = c["projetos"][0]["defeitos"]
    assert [(d["id_gom"], d["prioridade"], d["estrutura"]) for d in ds] == [
        ("-9000001", 8, "EXEMPLO-E1"), ("-9000003", 9, "EXEMPLO-E3")]


def test_d4_bases_snp_e_taa_no_cs(tmp_path):
    equipes = [
        {"lid": "SNP-COS-99X", "chefe": "Pessoa Exemplo", "tipo": "MP"},
        {"lid": "TAA-ML-99X", "chefe": "Pessoa Exemplo", "tipo": "ML"},
        {"lid": "SNP-RL-99X(SUPLENTE)", "chefe": "Pessoa Exemplo", "tipo": "ML"},
        {"lid": "XYZ-ML-01", "chefe": "Pessoa Exemplo", "tipo": "ML"},
    ]
    c = montar(tmp_path, equipes=equipes)
    eq = {e["lid"]: (e["regional"], e["base"], e["grupo_report"]) for e in c["equipes"]}
    assert eq == {"SNP-COS-99X": ("CS", "SNP", "Manutenção Pesada"),
                  "TAA-ML-99X": ("CS", "TAA", "ML Tauá"),
                  "SNP-RL-99X(SUPLENTE)": ("CS", "SNP", "ML Senador Pompeu")}
    assert any("XYZ-ML-01" in a for a in c["avisos"])


def test_projeto_ativo_em_duas_regionais_avisa(tmp_path):
    demandas = vazias()
    demandas["CS"] = Demanda([defeito("-9000011", "EXEMPLO-0007")])
    demandas["SUL"] = Demanda([defeito("-9000012", "EXEMPLO-0007")])
    c = montar(tmp_path, carteira=[], demandas=demandas, coords={})
    assert any("EXEMPLO-0007" in a and "CS" in a and "SUL" in a for a in c["avisos"])
