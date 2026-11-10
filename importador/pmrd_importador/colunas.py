"""Nomes de coluna e valores de célula: normalização."""
import unicodedata

# Apelidos: nome normalizado -> nome canônico (também normalizado).
APELIDOS = {
    "Q TOTAL": "Q_TOTAL",
}


def normalizar_nome(s: object) -> str:
    """strip, maiúsculas, sem acento, espaços simples."""
    if s is None:
        return ""
    t = unicodedata.normalize("NFKD", str(s))
    t = "".join(c for c in t if not unicodedata.combining(c))
    return " ".join(t.upper().split())


def nome_canonico(s: object) -> str:
    n = normalizar_nome(s)
    return APELIDOS.get(n, n)


def id_texto(v: object) -> str | None:
    """7680854 -> '7680854'; 7680854.0 -> '7680854'; ' -1 ' -> '-1'."""
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, float):
        if v != v or v in (float("inf"), float("-inf")):
            return None
        return str(int(v)) if v == int(v) else str(v)
    t = str(v).strip()
    if not t:
        return None
    if t.endswith(".0") and t[:-2].lstrip("-").isdigit():
        t = t[:-2]
    return t
