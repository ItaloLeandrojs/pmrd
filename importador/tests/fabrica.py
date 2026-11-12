"""Monta planilhas FICTÍCIAS (nada real) para os testes do importador."""
from pathlib import Path

from openpyxl import Workbook


def linha(id_defeito=-9000001, projeto="EXEMPLO-A", estado="PENDENTE",
          estrutura="EST-1", instalacao="ALIM-1", demanda="Obra", conjunto="CONJ-1"):
    return dict(id=id_defeito, projeto=projeto, estado=estado, estrutura=estrutura,
                instalacao=instalacao, demanda=demanda, conjunto=conjunto)


def criar_demanda(pasta: Path, nome="demanda.xlsx", linha_cabecalho=7,
                  col_projeto="PROJETO SGM", q_total="Q_TOTAL", linhas=None,
                  com_aba=True, coordenadas=None):
    """linhas: lista de dicts (ver `linha`). coordenadas: lista de (id, lat, lng)
    gravados como vêm da Enel (qualquer tipo); None = sem aba PBM_Manut_CE."""
    wb = Workbook()
    ws = wb.active
    ws.title = "DEMANDA MENSAL" if com_aba else "OUTRA"
    for i in range(1, linha_cabecalho):
        ws.cell(row=i, column=1, value=f"texto solto {i}")
    cab = ["PRIORIDADE", "ID_DEFEITO", "PROJETO"]
    if col_projeto:
        cab.append(col_projeto)
    cab += ["ESTRUTURA", "ESTADO", "INSTALACAO", "DEMANDA", "CONJUNTO", q_total]
    for c, v in enumerate(cab, 1):
        ws.cell(row=linha_cabecalho, column=c, value=v)
    r = linha_cabecalho + 1
    for d in linhas or []:
        vals = ["Sim", d["id"], "x"]
        if col_projeto:
            vals.append(d["projeto"])
        vals += [d["estrutura"], d["estado"], d["instalacao"], d["demanda"], d["conjunto"], 1]
        for c, v in enumerate(vals, 1):
            ws.cell(row=r, column=c, value=v)
        r += 1
    if coordenadas is not None:
        pbm = wb.create_sheet("PBM_Manut_CE")
        for c, v in enumerate(["ID_DEFEITO", "LATITUDE", "LONGITUDE"], 1):
            pbm.cell(row=1, column=c, value=v)
        for i, (idd, lat, lng) in enumerate(coordenadas, 2):
            pbm.cell(row=i, column=1, value=idd)
            pbm.cell(row=i, column=2, value=lat)
            pbm.cell(row=i, column=3, value=lng)
    caminho = pasta / nome
    wb.save(caminho)
    return caminho


# Colunas da aba CARTEIRA do xlsm, na ordem da planilha de controle (só os nomes).
CABECALHO_CARTEIRA = [
    "PROJETO", "OT CORREÇÃO", "ID GOM", "QTD DEFEITOS", "CARTEIRA", "MUNICÍPIO", "ENDEREÇO",
    "PRIORIDADE", "ELEMENTO DE CORTE", "QTD CLIENTES", "ESTRUTURA", "INTERVENÇÃO PREVISTA",
    "ETAPA DA CARTEIRA", "PRÓXIMA AÇÃO", "PRAZO DA PRÓXIMA AÇÃO", "DATA DA VISTORIA",
    "VALIDADE DA VISTORIA", "SITUAÇÃO DA VISTORIA", "RECURSO", "INTERVENÇÃO DO VISTORIADOR",
    "OBSERVAÇÃO TÉCNICA", "RESPONSÁVEL ATUAL", "DATA DO ENVIO DA VISTORIA", "DIAS AGUARDANDO VISTORIA",
]


def linha_carteira(**mudar):
    """Uma linha FICTÍCIA da aba CARTEIRA ({nome da coluna: valor})."""
    valores = {
        "PROJETO": "EXEMPLO-0001", "OT CORREÇÃO": None, "ID GOM": -9000001, "QTD DEFEITOS": 1,
        "CARTEIRA": "SUL", "MUNICÍPIO": "Exemplópolis", "ENDEREÇO": "EXEMPLO, campo 1",
        "PRIORIDADE": "Obra", "ELEMENTO DE CORTE": "EXEMPLO-CHAVE", "QTD CLIENTES": 10,
        "ESTRUTURA": "EXEMPLO-EST-1", "INTERVENÇÃO PREVISTA": "DESL MT",
        "ETAPA DA CARTEIRA": "AGUARDANDO VISTORIA", "PRÓXIMA AÇÃO": "AGUARDAR VISTORIA",
        "PRAZO DA PRÓXIMA AÇÃO": None, "DATA DA VISTORIA": None, "VALIDADE DA VISTORIA": None,
        "SITUAÇÃO DA VISTORIA": "SEM VISTORIA", "RECURSO": None, "INTERVENÇÃO DO VISTORIADOR": None,
        "OBSERVAÇÃO TÉCNICA": None, "RESPONSÁVEL ATUAL": "Pessoa Exemplo",
        "DATA DO ENVIO DA VISTORIA": None, "DIAS AGUARDANDO VISTORIA": 3,
    }
    valores.update(mudar)
    return valores


CABECALHO_LISTA_EQUIPES = [
    "Código Equipe", "Centro de Custo", "Gestor", "Coordenador(es)", "Centro de Serviço",
    "Supervisor(es)", "Colaboradores na Equipe (aprovados)", "Horários",
]


def equipe_csv(codigo="9Z/JZN-ML-99X", custo="CONTRATO EXEMPLO SUL", servico="C.S. JUAZEIRO",
               colaboradores="Pessoa Exemplo 1, Pessoa Exemplo 2"):
    """Uma linha FICTÍCIA de lista de equipes."""
    return {"Código Equipe": codigo, "Centro de Custo": custo, "Centro de Serviço": servico,
            "Colaboradores na Equipe (aprovados)": colaboradores, "Gestor": "Gestor Exemplo",
            "Coordenador(es)": "Coordenador Exemplo", "Supervisor(es)": "Supervisor Exemplo",
            "Horários": "07:00 - 16:00"}


def criar_lista_equipes(pasta: Path, nome="equipes_aprovadas_exemplo.csv", linhas=(), aspas=False,
                        codificacao="utf-8-sig", cabecalho=None):
    """CSV FICTÍCIO com ';', como a lista de equipes aprovadas (com ou sem aspas)."""
    cab = cabecalho or CABECALHO_LISTA_EQUIPES

    def campo(v):
        return f'"{v}"' if aspas else str(v)
    texto = [";".join(campo(c) for c in cab)]
    texto += [";".join(campo(l.get(c, "")) for c in cab) for l in linhas]
    caminho = pasta / nome
    caminho.write_bytes(("\r\n".join(texto) + "\r\n").encode(codificacao))
    return caminho


def criar_xlsm(pasta: Path, nome="controle.xlsm", carteira=None, equipes=None, solicitantes=None):
    """xlsm FICTÍCIO com as abas CARTEIRA (cabeçalho na linha 1) e LISTA.
    carteira: lista de `linha_carteira`; equipes: lista de (LID, chefe, tipo)."""
    wb = Workbook()
    ws = wb.active
    ws.title = "RESUMO SEMANA"
    car = wb.create_sheet("CARTEIRA")
    for c, v in enumerate(CABECALHO_CARTEIRA, 1):
        car.cell(row=1, column=c, value=v)
    for r, d in enumerate(carteira or [], 2):
        for c, nome_col in enumerate(CABECALHO_CARTEIRA, 1):
            car.cell(row=r, column=c, value=d.get(nome_col))
    lista = wb.create_sheet("LISTA")
    cab = ["ETAPA DA CARTEIRA", "NOMES SOLICITANTES", "LID", "CHEFE DE TURMA", "TIPO DE EQUIPE", "PARÂMETRO"]
    for c, v in enumerate(cab, 1):
        lista.cell(row=1, column=c, value=v)
    lista.cell(row=2, column=1, value="EM ANÁLISE")
    lista.cell(row=2, column=6, value="VALIDADE DA VISTORIA")
    for r, s in enumerate(solicitantes or [], 2):
        lista.cell(row=r, column=2, value=s)
    for r, (lid, chefe, tipo) in enumerate(equipes or [], 2):
        lista.cell(row=r, column=3, value=lid)
        lista.cell(row=r, column=4, value=chefe)
        lista.cell(row=r, column=5, value=tipo)
    caminho = pasta / nome
    wb.save(caminho)
    return caminho
