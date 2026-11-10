"""Monta o envio (p_envio de enviar_demanda) a partir da demanda lida."""
import hashlib
from collections import Counter
from pathlib import Path

from .planilha import Demanda
from .prioridade import prioridade_da_demanda


def assinatura_arquivo(caminho: Path) -> str:
    h = hashlib.sha256()
    with open(caminho, "rb") as f:
        for bloco in iter(lambda: f.read(1024 * 1024), b""):
            h.update(bloco)
    return h.hexdigest()


def montar_envio(d: Demanda, coords: dict[str, tuple[float, float]], m, regional: str) -> dict:
    sem_projeto = f"SEM-PROJETO-{regional}"
    projetos: dict[str, dict] = {}
    presentes: list[str] = []
    fechados: list[dict] = []
    municipios_do_projeto: dict[str, Counter] = {}
    desconhecidas: Counter = Counter()
    sem_coord = 0

    def presente(nome: str) -> None:
        if nome not in presentes:
            presentes.append(nome)

    for df in d.defeitos:
        nome = df.projeto or sem_projeto
        presente(nome)
        if not df.ativo:
            if df.estado:
                fechados.append({"id_gom": df.id_gom, "estado_enel": df.estado})
            continue
        proj = projetos.setdefault(nome, {"projeto": nome, "municipio": None,
                                          "alimentadores": [], "defeitos": []})
        municipios_do_projeto.setdefault(nome, Counter())
        prioridade = prioridade_da_demanda(df.demanda)
        if prioridade is None:
            desconhecidas[df.demanda or "(vazio)"] += 1
        ponto = coords.get(df.id_gom)
        lat = lng = None
        if ponto is None:
            sem_coord += 1
        else:
            lat, lng = float(ponto[0]), float(ponto[1])
            mun = m.municipio_de(lat, lng) if m is not None else None
            if mun:
                municipios_do_projeto[nome][mun] += 1
        if df.alimentador and df.alimentador not in proj["alimentadores"]:
            proj["alimentadores"].append(df.alimentador)
        proj["defeitos"].append({
            "id_gom": df.id_gom, "prioridade": prioridade, "estrutura": df.estrutura,
            "alimentador": df.alimentador, "estado_enel": df.estado, "lat": lat, "lng": lng,
        })

    for nome, cont in municipios_do_projeto.items():
        if cont:
            melhor = max(cont.values())
            projetos[nome]["municipio"] = sorted(k for k, v in cont.items() if v == melhor)[0]

    avisos = list(d.avisos)
    for nome, n in desconhecidas.items():
        avisos.append(f"Prioridade desconhecida: {nome} ({n} defeitos)")
    if sem_coord:
        avisos.append(f"{sem_coord} defeitos sem coordenada na PBM")
    return {"projetos": list(projetos.values()), "presentes": presentes,
            "fechados": fechados, "avisos": avisos}
