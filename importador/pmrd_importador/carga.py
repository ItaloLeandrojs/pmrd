"""pmrd-carga: carga inicial da carteira (xlsm de controle + demanda da Enel)."""
import argparse
import getpass
import re
import shutil
import tempfile
from collections import Counter
from datetime import date, datetime
from pathlib import Path

from .agrupar import montar_envio
from .colunas import id_texto, nome_canonico, normalizar_nome
from .municipios import Municipios
from .nuvem import ErroNuvem, Nuvem
from .pbm import ler_coordenadas
from .planilha import Demanda, ErroPlanilha, abrir, ler_demanda
from .prioridade import prioridade_da_demanda
from .principal import ENV_PADRAO, MALHA_PADRAO, REGIONAIS, _achar_arquivo, _ler_env

# Igual a BASES de src/dominio/equipes.ts.
BASES = {"JZN": "Juazeiro", "MLG": "Milagres", "ICO": "Icó", "IGT": "Iguatu", "CPS": "Campos Sales"}
REGIONAL_DA_BASE = {"JZN": "SUL", "MLG": "SUL", "CPS": "SUL", "ICO": "CS", "IGT": "CS"}
TIPOS = ("ML", "LVR", "MP", "LV")

ETAPAS = (
    "EM ANÁLISE", "SOLICITAR VISTORIA", "AGUARDANDO VISTORIA", "ANÁLISE PÓS-VISTORIA",
    "PROGRAMAR EXECUÇÃO", "SOLICITAR SGD", "AGUARDANDO SGD", "PROGRAMADA",
    "PENDENTE DE RETORNO", "EXECUTADA", "TRANSFERIDA", "NÃO EXECUTÁVEL",
)
_ETAPA = {normalizar_nome(e): e for e in ETAPAS} | {"SGD CONFIRMADO": "PROGRAMADA"}
_REGIONAL = {"SUL": "SUL", "CS": "CS", "C.S": "CS", "CENTRO SUL": "CS", "CENTRO-SUL": "CS", "LESTE": "LESTE"}

# Coluna da aba CARTEIRA -> chave da linha lida.
COLUNAS_CARTEIRA = {
    "PROJETO": "projeto", "OT CORREÇÃO": "ot_correcao", "ID GOM": "ids", "QTD DEFEITOS": "qtd_defeitos",
    "CARTEIRA": "carteira", "MUNICÍPIO": "municipio", "ENDEREÇO": "endereco", "PRIORIDADE": "prioridades",
    "ELEMENTO DE CORTE": "elemento_corte", "QTD CLIENTES": "qtd_clientes", "ESTRUTURA": "estruturas",
    "INTERVENÇÃO PREVISTA": "intervencao_prevista", "ETAPA DA CARTEIRA": "etapa",
    "PRÓXIMA AÇÃO": "proxima_acao", "PRAZO DA PRÓXIMA AÇÃO": "prazo_proxima_acao",
    "DATA DA VISTORIA": "vistoria_data", "SITUAÇÃO DA VISTORIA": "vistoria_situacao",
    "RECURSO": "vistoria_recurso", "INTERVENÇÃO DO VISTORIADOR": "vistoria_intervencao",
    "OBSERVAÇÃO TÉCNICA": "vistoria_observacao", "RESPONSÁVEL ATUAL": "responsavel",
    "DATA DO ENVIO DA VISTORIA": "vistoria_enviada_em",
}
_DATAS = ("PRAZO DA PRÓXIMA AÇÃO", "DATA DA VISTORIA", "DATA DO ENVIO DA VISTORIA")
_INTEIROS = ("QTD DEFEITOS", "QTD CLIENTES")
_LISTAS = ("ID GOM", "PRIORIDADE", "ESTRUTURA")
COLUNAS_LISTA = ("LID", "CHEFE DE TURMA", "TIPO DE EQUIPE", "NOMES SOLICITANTES")
_ID_GOM = re.compile(r"^-?\d+$")


# ---------------------------------------------------------------- leitura do xlsm

def _texto(v: object) -> str | None:
    if v is None:
        return None
    if isinstance(v, (int, float)) and not isinstance(v, bool):
        return id_texto(v)
    if isinstance(v, datetime):
        return v.date().isoformat()
    t = str(v).strip()
    return t or None


def _linhas(v: object) -> list[str]:
    """Um item por linha da célula."""
    t = _texto(v)
    if t is None:
        return []
    return [x.strip() for x in re.split(r"[\r\n]+", t) if x.strip()]


def _data(v: object) -> tuple[str | None, bool]:
    """(AAAA-MM-DD ou None, entendeu?)."""
    if v is None:
        return None, True
    if isinstance(v, datetime):
        return v.date().isoformat(), True
    if isinstance(v, date):
        return v.isoformat(), True
    t = str(v).strip()
    if not t:
        return None, True
    for formato in ("%d/%m/%Y", "%Y-%m-%d", "%d/%m/%y"):
        try:
            return datetime.strptime(t, formato).date().isoformat(), True
        except ValueError:
            pass
    return None, False


def _inteiro(v: object) -> tuple[int | None, bool]:
    if v is None or isinstance(v, bool):
        return None, v is None
    if isinstance(v, int):
        return v, True
    if isinstance(v, float):
        return (int(v), True) if v == int(v) else (None, False)
    t = str(v).strip()
    if not t:
        return None, True
    return (int(t), True) if re.fullmatch(r"\d+", t) else (None, False)


def _aba(wb, aba: str, caminho: Path, obrigatorias) -> tuple[dict[str, int], list[tuple]]:
    """Cabeçalho na linha 1. Devolve ({coluna: índice}, linhas de dados)."""
    if aba not in wb.sheetnames:
        raise ErroPlanilha(f"xlsm {caminho.name}: aba {aba} não encontrada.")
    linhas = list(wb[aba].iter_rows(values_only=True))
    cabecalho = [nome_canonico(c) for c in (linhas[0] if linhas else ())]
    mapa = {}
    for nome in obrigatorias:
        n = nome_canonico(nome)
        if n not in cabecalho:
            raise ErroPlanilha(f"xlsm {caminho.name}: coluna {nome} não encontrada na aba {aba}.")
        mapa[nome] = cabecalho.index(n)
    return mapa, linhas[1:]


def _celula(linha: tuple, idx: int):
    return linha[idx] if idx < len(linha) else None


def ler_carteira_xlsm(caminho: Path) -> list[dict]:
    """Aba CARTEIRA: uma linha por projeto (linha sem PROJETO é ignorada).
    Cada linha traz também 'linha' (número na planilha) e 'avisos'."""
    caminho = Path(caminho)
    wb = abrir(caminho)
    try:
        mapa, dados = _aba(wb, "CARTEIRA", caminho, COLUNAS_CARTEIRA)
    finally:
        wb.close()
    saida = []
    for n, linha in enumerate(dados, 2):
        projeto = _texto(_celula(linha, mapa["PROJETO"]))
        if projeto is None or projeto == "0":
            continue
        item: dict = {"linha": n, "avisos": []}
        for coluna, chave in COLUNAS_CARTEIRA.items():
            v = _celula(linha, mapa[coluna])
            if coluna in _LISTAS:
                item[chave] = _linhas(v)
            elif coluna in _DATAS:
                item[chave], ok = _data(v)
                if not ok:
                    item["avisos"].append(f"Projeto {projeto} (linha {n} do xlsm): {coluna} '{v}' "
                                          "não é data; ficou vazio.")
            elif coluna in _INTEIROS:
                item[chave], ok = _inteiro(v)
                if not ok:
                    item["avisos"].append(f"Projeto {projeto} (linha {n} do xlsm): {coluna} '{v}' "
                                          "não é número; ficou vazio.")
            else:
                item[chave] = _texto(v)
        ids = []
        for i in item["ids"]:
            i = id_texto(i)
            if i is not None and _ID_GOM.match(i):
                ids.append(i)
            else:
                item["avisos"].append(f"Projeto {projeto} (linha {n} do xlsm): ID GOM '{i}' fora do formato; "
                                      "ficou de fora.")
        item["ids"] = ids
        saida.append(item)
    return saida


def ler_lista_xlsm(caminho: Path) -> tuple[list[dict], list[str]]:
    """Aba LISTA: equipes [{lid, chefe, tipo}] e nomes dos solicitantes."""
    caminho = Path(caminho)
    wb = abrir(caminho)
    try:
        mapa, dados = _aba(wb, "LISTA", caminho, COLUNAS_LISTA)
    finally:
        wb.close()
    equipes, solicitantes = [], []
    for linha in dados:
        lid = _texto(_celula(linha, mapa["LID"]))
        if lid:
            equipes.append({"lid": lid.upper(),
                            "chefe": _texto(_celula(linha, mapa["CHEFE DE TURMA"])) or "",
                            "tipo": normalizar_nome(_celula(linha, mapa["TIPO DE EQUIPE"]))})
        nome = _texto(_celula(linha, mapa["NOMES SOLICITANTES"]))
        if nome and nome not in solicitantes:
            solicitantes.append(nome)
    return equipes, solicitantes


# ---------------------------------------------------------------- montagem

def grupo_sugerido(tipo: str, base: str | None) -> str | None:
    """Igual a grupoSugerido de src/dominio/equipes.ts."""
    if tipo == "MP":
        return "Manutenção Pesada"
    if tipo in ("LV", "LVR"):
        return "Linha Viva"
    return f"ML {BASES[base]}" if base in BASES else None


def _municipio_dos_pontos(defeitos: list[dict], m) -> str | None:
    """O que tem mais defeitos; empate, o primeiro em ordem alfabética."""
    if m is None:
        return None
    cont = Counter(mun for d in defeitos if d["lat"] is not None and d["lng"] is not None
                   for mun in [m.municipio_de(d["lat"], d["lng"])] if mun)
    if not cont:
        return None
    melhor = max(cont.values())
    return sorted(k for k, v in cont.items() if v == melhor)[0]


def _equipes(equipes: list[dict], avisos: list[str]) -> list[dict]:
    saida, vistos = [], set()
    for e in equipes:
        lid = e["lid"]
        prefixo = lid.split("-")[0]
        if lid in vistos:
            avisos.append(f"Equipe {lid} repetida na aba LISTA; vale a primeira.")
            continue
        if prefixo not in BASES:
            avisos.append(f"Equipe {lid}: prefixo {prefixo} desconhecido; ficou de fora.")
            continue
        if e["tipo"] not in TIPOS:
            avisos.append(f"Equipe {lid}: tipo {e['tipo'] or '(vazio)'} desconhecido; ficou de fora.")
            continue
        vistos.add(lid)
        saida.append({"lid": lid, "chefe": e["chefe"], "tipo": e["tipo"], "regional": REGIONAL_DA_BASE[prefixo],
                      "base": prefixo, "grupo_report": grupo_sugerido(e["tipo"], prefixo)})
    return saida


def montar_carga(carteira: list[dict], demandas: dict[str, Demanda], coords: dict, m: Municipios | None,
                 equipes, solicitantes) -> dict:
    """Monta o p_carga de carga_inicial (sem 'arquivo')."""
    avisos: list[str] = []
    envios = {reg: montar_envio(d, coords, m, reg) for reg, d in demandas.items()}
    for reg, env in envios.items():
        avisos += [f"Demanda {reg}: {a}" for a in env["avisos"]]
    ativos = {reg: {p["projeto"]: p for p in env["projetos"]} for reg, env in envios.items()}
    presentes = {reg: set(env["presentes"]) for reg, env in envios.items()}
    dono_ativo = {d["id_gom"]: p["projeto"] for env in envios.values()
                  for p in env["projetos"] for d in p["defeitos"]}
    fechados = {f["id_gom"]: f["estado_enel"] for env in envios.values() for f in env["fechados"]}

    projetos: list[dict] = []
    linha_do: dict[str, int] = {}
    for l in carteira:
        avisos += l["avisos"]
        nome = l["projeto"]
        onde = f"Projeto {nome} (linha {l['linha']} do xlsm)"
        if nome in linha_do:
            avisos.append(f"Projeto {nome} repetido no xlsm (linhas {linha_do[nome]} e {l['linha']}); "
                          "vale a primeira.")
            continue
        regional = _REGIONAL.get(normalizar_nome(l["carteira"]))
        if regional is None:
            avisos.append(f"{onde}: carteira {l['carteira'] or '(vazia)'} desconhecida; ficou de fora.")
            continue
        linha_do[nome] = l["linha"]

        etapa = _ETAPA.get(normalizar_nome(l["etapa"]))
        if etapa is None:
            avisos.append(f"{onde}: etapa {l['etapa'] or '(vazia)'} fora da lista; entrou em EM ANÁLISE.")
            etapa = "EM ANÁLISE"

        for outra, nomes in presentes.items():
            if outra != regional and nome in nomes:
                avisos.append(f"{onde}: está no xlsm como {regional}, mas aparece na demanda do {outra}.")

        prios = []
        for n in l["prioridades"]:
            p = prioridade_da_demanda(n)
            if p is None:
                avisos.append(f"{onde}: prioridade {n} desconhecida.")
            prios.append(p)
        ids, ests = l["ids"], l["estruturas"]
        if len(prios) > 1 and len(prios) != len(ids):
            avisos.append(f"{onde}: {len(prios)} prioridades para {len(ids)} ID GOM; defeitos do xlsm sem prioridade.")

        def prioridade_do(i: int) -> int | None:
            if len(prios) == len(ids):
                return prios[i]
            return prios[0] if len(prios) == 1 else None

        enel = nome in presentes.get(regional, set())
        ativo = ativos.get(regional, {}).get(nome) if enel else None
        defeitos = [dict(d) for d in ativo["defeitos"]] if ativo else []
        ja = {d["id_gom"] for d in defeitos}
        for i, id_gom in enumerate(ids):
            if id_gom in ja:
                continue
            dono = dono_ativo.get(id_gom)
            if dono is not None and dono != nome:
                avisos.append(f"{onde}: o defeito {id_gom} está no projeto {dono} na demanda e fica lá.")
                continue
            ja.add(id_gom)
            ponto = coords.get(id_gom)
            defeitos.append({
                "id_gom": id_gom, "prioridade": prioridade_do(i),
                "estrutura": ests[i] if len(ests) == len(ids) else None,
                "alimentador": None, "estado_enel": fechados.get(id_gom),
                "lat": float(ponto[0]) if ponto else None, "lng": float(ponto[1]) if ponto else None,
            })

        da_demanda = [d["prioridade"] for d in (ativo["defeitos"] if ativo else []) if d["prioridade"] is not None]
        do_xlsm = [p for p in prios if p is not None]
        prioridade = min(da_demanda) if da_demanda else (min(do_xlsm) if do_xlsm else None)

        projetos.append({
            "projeto": nome, "regional": regional, "origem": "enel" if enel else "manual",
            "ot_correcao": l["ot_correcao"],
            "municipio": l["municipio"] or (ativo["municipio"] if ativo else None)
            or _municipio_dos_pontos(defeitos, m),
            "endereco": l["endereco"], "prioridade": prioridade,
            "alimentadores": list(ativo["alimentadores"]) if ativo else [],
            "elemento_corte": l["elemento_corte"], "qtd_clientes": l["qtd_clientes"],
            "estruturas": ests, "intervencao_prevista": l["intervencao_prevista"], "etapa": etapa,
            "proxima_acao": l["proxima_acao"], "prazo_proxima_acao": l["prazo_proxima_acao"],
            "vistoria_data": l["vistoria_data"], "vistoria_situacao": l["vistoria_situacao"],
            "vistoria_recurso": l["vistoria_recurso"], "vistoria_intervencao": l["vistoria_intervencao"],
            "vistoria_observacao": l["vistoria_observacao"], "vistoria_enviada_em": l["vistoria_enviada_em"],
            "responsavel": l["responsavel"],
            # Como o site faz no projeto manual: com ID GOM, a quantidade de IDs.
            "qtd_defeitos_informada": None if enel else (len(defeitos) if defeitos else l["qtd_defeitos"]),
            "defeitos": defeitos,
        })

    so_demanda = [{"regional": reg, **p} for reg, env in envios.items()
                  for p in env["projetos"] if p["projeto"] not in linha_do]
    return {"projetos": projetos, "da_demanda": so_demanda, "equipes": _equipes(equipes, avisos),
            "solicitantes": list(solicitantes), "avisos": avisos}


# ---------------------------------------------------------------- comando

def _ler_tudo(xlsm: Path, pasta: Path, malha) -> dict:
    """Copia o xlsm e as planilhas da demanda para uma pasta temporária, lê as
    cópias, apaga as cópias e monta a carga."""
    tmp = Path(tempfile.mkdtemp(prefix="pmrd-carga-"))
    try:
        copia = tmp / xlsm.name
        shutil.copy2(xlsm, copia)
        carteira = ler_carteira_xlsm(copia)
        equipes, solicitantes = ler_lista_xlsm(copia)
        ids_do_xlsm: dict[str, set[str]] = {}
        for l in carteira:
            reg = _REGIONAL.get(normalizar_nome(l["carteira"]))
            ids_do_xlsm.setdefault(reg, set()).update(l["ids"])
        demandas, coords = {}, {}
        for prefixo, regional in REGIONAIS:
            arquivo = _achar_arquivo(pasta, prefixo)
            if arquivo is None:
                raise ErroPlanilha(f"Falta a planilha {prefixo} ({regional}) na pasta {pasta}.")
            c = tmp / ("demanda-" + arquivo.name)
            shutil.copy2(arquivo, c)
            d = ler_demanda(c)
            ids = {x.id_gom for x in d.defeitos if x.ativo} | ids_do_xlsm.get(regional, set())
            coords.update(ler_coordenadas(c, ids))
            demandas[regional] = d
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    carga = montar_carga(carteira, demandas, coords, malha, equipes, solicitantes)
    carga["arquivo"] = xlsm.name
    return carga


def resumo_da_carga(carga: dict) -> list[str]:
    """Contagens por regional, etapas, equipes com a regional e todos os avisos."""
    linhas = ["Projetos por regional:"]
    for _, reg in sorted(REGIONAIS, key=lambda r: r[1]):
        xl = [p for p in carga["projetos"] if p["regional"] == reg]
        dem = [p for p in carga["da_demanda"] if p["regional"] == reg]
        enel = sum(p["origem"] == "enel" for p in xl)
        n_def = sum(len(p["defeitos"]) for p in xl + dem)
        linhas.append(f"  {reg}: {len(xl)} do xlsm ({enel} na demanda, {len(xl) - enel} manuais), "
                      f"{len(dem)} só da demanda, {n_def} defeitos")
    linhas.append("Etapas (do xlsm; os só da demanda entram em EM ANÁLISE):")
    for _, reg in sorted(REGIONAIS, key=lambda r: r[1]):
        cont = Counter(p["etapa"] for p in carga["projetos"] if p["regional"] == reg)
        texto = ", ".join(f"{e} {cont[e]}" for e in ETAPAS if cont[e]) or "nenhum"
        linhas.append(f"  {reg}: {texto}")
    linhas.append(f"Equipes ({len(carga['equipes'])}):")
    for e in carga["equipes"]:
        linhas.append(f"  {e['lid']}: {e['regional']}, base {e['base']}, {e['tipo']}, {e['grupo_report']}")
    linhas.append(f"Solicitantes: {len(carga['solicitantes'])}")
    linhas.append(f"Avisos ({len(carga['avisos'])}):")
    linhas += [f"  - {a}" for a in carga["avisos"]]
    return linhas


def main(argv: list[str] | None = None, nuvem=None) -> int:
    ap = argparse.ArgumentParser(prog="pmrd-carga")
    ap.add_argument("--xlsm", type=Path, required=True, help="planilha de controle (CONTROLE_DE_MANUTENÇÕES.xlsm)")
    ap.add_argument("--pasta", type=Path, required=True, help="pasta com as planilhas 00_, 01_ e 02_ da demanda")
    ap.add_argument("--ensaio", action="store_true", help="só lê e mostra; não chama a nuvem nem grava nada")
    ap.add_argument("--apagar-exemplos", action="store_true", help="apaga os projetos EXEMPLO- antes da carga")
    ap.add_argument("--malha", type=Path, default=MALHA_PADRAO)
    ap.add_argument("--env", type=Path, default=ENV_PADRAO)
    a = ap.parse_args(argv)

    if not a.xlsm.is_file():
        print(f"xlsm não encontrado: {a.xlsm}.")
        return 1
    if not a.pasta.is_dir():
        print(f"Pasta não encontrada: {a.pasta}.")
        return 1
    if a.malha.exists():
        malha = Municipios.carregar(a.malha)
    elif a.ensaio:
        malha = None
        print(f"Aviso: malha dos municípios não encontrada ({a.malha}); municípios pela coordenada ficam vazios.")
    else:
        print(f"Malha dos municípios não encontrada: {a.malha}. Rode: uv run pmrd-importar --baixar-malha")
        return 1

    try:
        carga = _ler_tudo(a.xlsm, a.pasta, malha)
    except ErroPlanilha as e:
        print(f"Erro: {e}")
        return 1
    except Exception as e:
        print(f"Erro inesperado ao ler as planilhas ({type(e).__name__}).")
        return 1

    if a.ensaio:
        print("Ensaio da carga inicial: nada foi gravado nem enviado.")
        print("\n".join(resumo_da_carga(carga)))
        return 0

    try:
        if nuvem is None:
            env = _ler_env(a.env)
            url, chave = env.get("PUBLIC_SUPABASE_URL"), env.get("PUBLIC_SUPABASE_ANON_KEY")
            if not url or not chave:
                raise ErroNuvem("Faltam PUBLIC_SUPABASE_URL e PUBLIC_SUPABASE_ANON_KEY no .env.local.")
            nuvem = Nuvem(url, chave)
        email = input("E-mail do administrador: ").strip()
        senha = getpass.getpass("Senha do administrador (não aparece na tela): ")
        nuvem.entrar(email, senha)
    except ErroNuvem as e:
        print(f"Não deu para entrar na nuvem: {e}")
        return 1

    print("\n".join(resumo_da_carga(carga)))
    if a.apagar_exemplos:
        print("Os projetos EXEMPLO- serão apagados antes da carga.")
    if input("Para gravar a carga no PMRD, digite CARREGAR: ").strip() != "CARREGAR":
        print("Carga cancelada: nada foi gravado.")
        return 1
    try:
        r = nuvem.rpc("carga_inicial", {"p_carga": carga, "p_apagar_exemplos": a.apagar_exemplos})
    except ErroNuvem as e:
        print(f"A carga não foi feita: {e}")
        return 1
    print("Carga feita:")
    for k, v in (r or {}).items():
        if k == "avisos":
            print(f"  avisos: {len(v)}")
            for av in v:
                print(f"    - {av}")
        else:
            print(f"  {k}: {v}")
    return 0
