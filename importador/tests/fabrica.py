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
