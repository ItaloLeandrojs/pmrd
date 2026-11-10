"""Conversa com o Supabase (Auth + RPC) só com urllib."""
import json
import urllib.error
import urllib.request

TEMPO_LIMITE = 60


class ErroNuvem(Exception):
    """Mensagem do banco ou da rede, pronta para o log."""


def _mensagem(corpo: bytes, padrao: str) -> str:
    try:
        j = json.loads(corpo.decode("utf-8"))
        if isinstance(j, dict):
            return str(j.get("message") or j.get("error_description") or j.get("msg") or padrao)
    except Exception:
        pass
    return padrao


class Nuvem:
    def __init__(self, url: str, chave_publica: str):
        self.url = url.rstrip("/")
        self.chave = chave_publica
        self.token: str | None = None

    def _pedir(self, caminho: str, corpo: dict, token: str | None) -> bytes:
        req = urllib.request.Request(
            self.url + caminho, data=json.dumps(corpo).encode("utf-8"), method="POST",
            headers={"apikey": self.chave, "Authorization": f"Bearer {token or self.chave}",
                     "Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=TEMPO_LIMITE) as r:
                return r.read()
        except urllib.error.HTTPError as e:
            raise ErroNuvem(_mensagem(e.read(), f"Erro {e.code} da nuvem.")) from e
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            raise ErroNuvem(f"Sem conexão com a nuvem ({type(e).__name__}).") from e

    def entrar(self, email: str, senha: str) -> None:
        r = self._pedir("/auth/v1/token?grant_type=password", {"email": email, "password": senha}, None)
        token = json.loads(r.decode("utf-8")).get("access_token")
        if not token:
            raise ErroNuvem("Login do robô sem token.")
        self.token = token

    def rpc(self, funcao: str, argumentos: dict) -> object:
        if not self.token:
            raise ErroNuvem("Robô não está logado.")
        r = self._pedir(f"/rest/v1/rpc/{funcao}", argumentos, self.token)
        return json.loads(r.decode("utf-8")) if r.strip() else None
