"""Município de um ponto (lat, lng) pela malha do IBGE do Ceará."""
import gzip
import json
import urllib.request
from pathlib import Path

URL_MALHA = ("https://servicodados.ibge.gov.br/api/v3/malhas/estados/23"
             "?formato=application/vnd.geo+json&intrarregiao=municipio&qualidade=intermediaria")
URL_NOMES = "https://servicodados.ibge.gov.br/api/v1/localidades/estados/23/municipios"
TEMPO_LIMITE = 60
ASSINATURA_GZIP = bytes([0x1F, 0x8B])


def _dentro_do_anel(x: float, y: float, anel: list) -> bool:
    """Raio para a direita (x = lng, y = lat)."""
    dentro = False
    n = len(anel)
    j = n - 1
    for i in range(n):
        xi, yi = anel[i][0], anel[i][1]
        xj, yj = anel[j][0], anel[j][1]
        if (yi > y) != (yj > y) and x < (xj - xi) * (y - yi) / (yj - yi) + xi:
            dentro = not dentro
        j = i
    return dentro


class Municipios:
    def __init__(self, areas: list[tuple[str, tuple[float, float, float, float], list[list]]]):
        # (nome, (min_lng, min_lat, max_lng, max_lat), [polígono = [anel externo, buracos...]])
        self._areas = areas

    @classmethod
    def carregar(cls, geojson: Path) -> "Municipios":
        dados = json.loads(Path(geojson).read_text(encoding="utf-8"))
        areas = []
        for f in dados.get("features", []):
            nome = (f.get("properties") or {}).get("nome")
            g = f.get("geometry") or {}
            if not nome or not g:
                continue
            if g["type"] == "Polygon":
                poligonos = [g["coordinates"]]
            elif g["type"] == "MultiPolygon":
                poligonos = g["coordinates"]
            else:
                continue
            pontos = [p for pol in poligonos for p in pol[0]]
            lngs = [p[0] for p in pontos]
            lats = [p[1] for p in pontos]
            areas.append((nome, (min(lngs), min(lats), max(lngs), max(lats)), poligonos))
        return cls(areas)

    def municipio_de(self, lat: float, lng: float) -> str | None:
        for nome, (x0, y0, x1, y1), poligonos in self._areas:
            if not (x0 <= lng <= x1 and y0 <= lat <= y1):
                continue
            for pol in poligonos:
                if _dentro_do_anel(lng, lat, pol[0]) and not any(
                        _dentro_do_anel(lng, lat, buraco) for buraco in pol[1:]):
                    return nome
        return None


def _baixar_json(url: str):
    req = urllib.request.Request(url, headers={"User-Agent": "pmrd-importador", "Accept-Encoding": "identity"})
    with urllib.request.urlopen(req, timeout=TEMPO_LIMITE) as r:
        corpo = r.read()
    if corpo[:2] == ASSINATURA_GZIP:
        corpo = gzip.decompress(corpo)
    return json.loads(corpo.decode("utf-8"))


def baixar_malha(destino: Path) -> None:
    """Baixa a malha e os nomes do IBGE e grava um GeoJSON com properties.nome."""
    malha = _baixar_json(URL_MALHA)
    nomes = {str(m["id"]): m["nome"] for m in _baixar_json(URL_NOMES)}
    features = []
    for f in malha.get("features", []):
        cod = str((f.get("properties") or {}).get("codarea"))
        if cod in nomes:
            features.append({"type": "Feature", "properties": {"nome": nomes[cod], "codarea": cod},
                             "geometry": f["geometry"]})
    if not features:
        raise RuntimeError("A malha do IBGE veio sem municípios.")
    destino = Path(destino)
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(json.dumps({"type": "FeatureCollection", "features": features}), encoding="utf-8")
