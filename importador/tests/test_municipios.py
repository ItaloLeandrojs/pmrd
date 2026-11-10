import json

from pmrd_importador.municipios import Municipios


def quadrado(x0, y0, x1, y1):
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]


def geojson(tmp_path):
    # coordenadas GeoJSON: [lng, lat]
    a = {"type": "Feature", "properties": {"nome": "A"},
         "geometry": {"type": "Polygon", "coordinates": [quadrado(0, 0, 10, 10), quadrado(4, 4, 6, 6)]}}
    b = {"type": "Feature", "properties": {"nome": "B"},
         "geometry": {"type": "MultiPolygon", "coordinates": [[quadrado(20, 0, 30, 10)], [quadrado(40, 0, 50, 10)]]}}
    p = tmp_path / "m.geojson"
    p.write_text(json.dumps({"type": "FeatureCollection", "features": [a, b]}), encoding="utf-8")
    return p


def test_ponto_dentro_buraco_e_fora(tmp_path):
    m = Municipios.carregar(geojson(tmp_path))
    assert m.municipio_de(2, 2) == "A"        # lat, lng
    assert m.municipio_de(5, 5) is None       # no buraco de A
    assert m.municipio_de(50, 50) is None     # fora de tudo
    assert m.municipio_de(5, 25) == "B"
    assert m.municipio_de(5, 45) == "B"       # segundo polígono do MultiPolygon
