import json

import pytest

from fabrica import criar_lista_equipes, equipe_csv
from pmrd_importador.equipes_csv import equipes_das_listas, ler_lista, ler_listas
from pmrd_importador.planilha import ErroPlanilha

# Tarefa 7c: listas de equipes aprovadas (CSV). Tudo fictício.


def montar(tmp_path, linhas, **k):
    return equipes_das_listas(ler_lista(criar_lista_equipes(tmp_path, linhas=linhas, **k)))


def por_lid(equipes):
    return {e["lid"]: e for e in equipes}


@pytest.mark.parametrize("aspas", [False, True])
def test_lista_com_e_sem_aspas_dao_o_mesmo(tmp_path, aspas):
    equipes, avisos = montar(tmp_path, [equipe_csv()], aspas=aspas)
    assert equipes == [{"lid": "JZN-ML-99X", "chefe": "Pessoa Exemplo 1", "tipo": "ML",
                        "regional": "SUL", "base": "JZN"}]
    assert avisos == []


def test_lista_em_cp1252_tambem_le(tmp_path):
    equipes, _ = montar(tmp_path, [equipe_csv(colaboradores="Pessoa Exemplo Ícaro")], codificacao="cp1252")
    assert equipes[0]["chefe"] == "Pessoa Exemplo Ícaro"


def test_cabecalho_comparado_sem_acento_e_caixa(tmp_path):
    cab = ["CODIGO EQUIPE", "centro de custo", "Gestor", "Coordenador(es)", "CENTRO DE SERVICO",
           "Supervisor(es)", "colaboradores na equipe (aprovados)", "Horários"]
    linha = equipe_csv()
    linha = {c: linha[o] for c, o in zip(cab, ["Código Equipe", "Centro de Custo", "Gestor", "Coordenador(es)",
                                                "Centro de Serviço", "Supervisor(es)",
                                                "Colaboradores na Equipe (aprovados)", "Horários"])}
    equipes, _ = montar(tmp_path, [linha], cabecalho=cab)
    assert [e["lid"] for e in equipes] == ["JZN-ML-99X"]


def test_falta_coluna_e_erro(tmp_path):
    cab = ["Código Equipe", "Centro de Custo", "Centro de Serviço", "Outra coisa"]
    with pytest.raises(ErroPlanilha, match="Colaboradores na Equipe"):
        ler_lista(criar_lista_equipes(tmp_path, linhas=[equipe_csv()], cabecalho=cab))


def test_lid_e_o_texto_depois_da_ultima_barra_e_sem_barra_vale_inteiro(tmp_path):
    equipes, _ = montar(tmp_path, [
        equipe_csv(codigo="9Z/1/JZN-ML-98X"),
        equipe_csv(codigo="jzn-lb-97x"),
        equipe_csv(codigo=" 9Z/JZN-RD-96X "),
    ])
    assert [e["lid"] for e in equipes] == ["JZN-ML-98X", "JZN-LB-97X", "JZN-RD-96X"]


def test_fora_de_campo_e_pef_ficam_de_fora_com_a_contagem(tmp_path):
    equipes, avisos = montar(tmp_path, [
        equipe_csv(codigo="9Z/ADM-EXEMPLO-1JZN"), equipe_csv(codigo="9Z/ADM-EXEMPLO.2JZN"),
        equipe_csv(codigo="9Z/APOIO-CMO UT EXEMPLO"), equipe_csv(codigo="9Z/EXEMPLO-FERISTA"),
        equipe_csv(codigo="9Z/EXEMPLO-INSS"), equipe_csv(codigo="9Z/RETRO EXEMPLO [JZN]"),
        equipe_csv(codigo="9Z/JZN-PEF-99X"), equipe_csv(codigo="9Z/OUTRA-COISA"),
        equipe_csv(codigo="9Z/JZN-ML-99X"),
    ])
    assert [e["lid"] for e in equipes] == ["JZN-ML-99X"]
    assert "Listas de equipes: 2 equipes ADM ficaram de fora (não são de campo)." in avisos
    assert "Listas de equipes: 1 equipe APOIO-CMO ficou de fora (não é de campo)." in avisos
    assert "Listas de equipes: 1 equipe FERISTA ficou de fora (não é de campo)." in avisos
    assert "Listas de equipes: 1 equipe INSS ficou de fora (não é de campo)." in avisos
    assert "Listas de equipes: 1 equipe RETRO ficou de fora (não é de campo)." in avisos
    assert "Listas de equipes: 1 equipe de sigla PEF ficou de fora." in avisos
    assert any("OUTRA-COISA" in a and "formato" in a for a in avisos)


def test_cos_vira_mp_e_tipos_novos_ficam(tmp_path):
    siglas = ["COS", "LV", "ML", "MP", "RD", "LB", "LN", "MM", "SK", "GA", "TR", "RL", "LM", "MO"]
    equipes, avisos = montar(tmp_path, [equipe_csv(codigo=f"9Z/JZN-{s}-{i:02d}X") for i, s in enumerate(siglas)])
    assert [e["tipo"] for e in equipes] == ["MP", "LV", "ML", "MP", "RD", "LB", "LN", "MM", "SK", "GA",
                                            "TR", "RL", "LM", "MO"]
    assert avisos == []


def test_sigla_desconhecida_fica_de_fora_com_aviso(tmp_path):
    equipes, avisos = montar(tmp_path, [equipe_csv(codigo="9Z/JZN-XQ-99X")])
    assert equipes == []
    assert any("JZN-XQ-99X" in a and "XQ" in a for a in avisos)


def test_base_vem_do_centro_de_servico_mesmo_com_prefixo_diferente(tmp_path):
    centros = [("C.S. JUAZEIRO", "JZN"), ("C.S. MILAGRES", "MLG"), ("C.S. CAMPOS SALES", "CPS"),
               ("C.S. IGUATU", "IGT"), ("C.S. ICO", "ICO"), ("C.S. SENADOR POMPEU", "SNP"),
               ("C.S. TAUA", "TAA"), ("C.S. LIMOEIRO", "RSL"), ("C.S. ARACATI", "ART"),
               ("c.s. jaguaribe", "JGB"), ("C.S. Icó", "ICO")]
    linhas = [equipe_csv(codigo=f"9Z/XYZ-ML-{i:02d}X", servico=c) for i, (c, _) in enumerate(centros)]
    equipes, _ = montar(tmp_path, linhas)
    assert [e["base"] for e in equipes] == [b for _, b in centros]


def test_centro_de_servico_desconhecido_fica_de_fora_com_aviso(tmp_path):
    equipes, avisos = montar(tmp_path, [equipe_csv(codigo="9Z/JZN-ML-99X", servico="C.S. EXEMPLO")])
    assert equipes == []
    assert any("JZN-ML-99X" in a and "C.S. EXEMPLO" in a for a in avisos)


@pytest.mark.parametrize("custo,regional", [
    ("EXEMPLO (CE) - SERVIÇOS CENTRO SUL II", "CS"),
    ("CONTRATO SERVIÇOS EXEMPLO SUL", "SUL"),
    ("EXEMPLO (CE) - SERVIÇOS LESTE II", "LESTE"),
    ("contrato centro sul", "CS"),
])
def test_regional_pelo_centro_de_custo(tmp_path, custo, regional):
    equipes, _ = montar(tmp_path, [equipe_csv(custo=custo)])
    assert equipes[0]["regional"] == regional


def test_centro_de_custo_desconhecido_fica_de_fora_com_aviso(tmp_path):
    equipes, avisos = montar(tmp_path, [equipe_csv(custo="CONTRATO NORTE")])
    assert equipes == []
    assert any("JZN-ML-99X" in a and "CONTRATO NORTE" in a for a in avisos)


def test_chefe_e_o_primeiro_colaborador_e_os_outros_nao_vao_para_a_carga(tmp_path):
    equipes, _ = montar(tmp_path, [equipe_csv(colaboradores=" Pessoa Exemplo Um , Pessoa Exemplo Dois, Pessoa Três")])
    assert equipes[0]["chefe"] == "Pessoa Exemplo Um"
    texto = json.dumps(equipes, ensure_ascii=False)
    assert "Dois" not in texto and "Três" not in texto and "Supervisor" not in texto and "Gestor" not in texto


def test_colaboradores_vazio_entra_com_chefe_vazio_e_aviso(tmp_path):
    equipes, avisos = montar(tmp_path, [equipe_csv(colaboradores="")])
    assert equipes[0]["chefe"] == ""
    assert any("JZN-ML-99X" in a and "chefe" in a for a in avisos)


def test_lid_repetido_vale_o_primeiro(tmp_path):
    equipes, avisos = montar(tmp_path, [equipe_csv(colaboradores="Pessoa A"), equipe_csv(colaboradores="Pessoa B")])
    assert [(e["lid"], e["chefe"]) for e in equipes] == [("JZN-ML-99X", "Pessoa A")]
    assert any("JZN-ML-99X" in a and "repetida" in a for a in avisos)


def test_ler_listas_copia_para_a_temporaria_e_le_so_as_listas(tmp_path):
    pasta = tmp_path / "equipes"
    pasta.mkdir()
    a = criar_lista_equipes(pasta, "equipes_aprovadas_1.csv", [equipe_csv(codigo="9Z/JZN-ML-98X")])
    criar_lista_equipes(pasta, "equipes_aprovadas_2.csv", [equipe_csv(codigo="9Z/JZN-ML-97X")], aspas=True)
    criar_lista_equipes(pasta, "outra_coisa.csv", [equipe_csv(codigo="9Z/JZN-ML-96X")])
    antes = a.read_bytes()
    tmp = tmp_path / "tmp"
    tmp.mkdir()
    linhas = ler_listas(pasta, tmp)
    equipes, _ = equipes_das_listas(linhas)
    assert sorted(e["lid"] for e in equipes) == ["JZN-ML-97X", "JZN-ML-98X"]
    assert sorted(p.name for p in tmp.iterdir()) == ["equipes-equipes_aprovadas_1.csv",
                                                     "equipes-equipes_aprovadas_2.csv"]
    assert a.read_bytes() == antes


def test_pasta_sem_lista_e_erro(tmp_path):
    with pytest.raises(ErroPlanilha, match="equipes_aprovadas_"):
        ler_listas(tmp_path, tmp_path)
