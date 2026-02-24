"""
RoK Game Tools - Kingdom Member Fetcher
=======================================
Login completamente automatico via email + password.
Nessun browser, nessuna dipendenza compilata.

Dipendenze:
    pip install requests supabase
"""

import json
import csv
import os
import time
import logging
import hashlib
import base64
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import requests

# ─────────────────────────────────────────────
# CONFIGURAZIONE
# ─────────────────────────────────────────────

CONFIG = {
    "app_id":       2104267,
    "app_uid":      "251984359",
    "email":        os.environ.get("LILITH_EMAIL", "dvdddrok@gmail.com"),
    "password_md5": os.environ.get("LILITH_PASSWORD_MD5", "a55a2046162c22ce5944165c9ea177ae"),
    "token_file":   "rok_tokens.json",
    "output_dir":   "output",
}

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")

PASSPORT_API  = "https://passport-global-api.lilithgame.com"
BASE_API      = "https://rok-game-tools-global-api.lilith.com"
DATA_API      = "https://plat-rok-gametools-global-api.lilithgames.com"

VISITOR_ID = hashlib.md5(CONFIG["email"].encode()).hexdigest()
ACCESS_KEY = "97r9ihrvxuh6d8kdrztw03ovlvxtssx4"
SECRET_KEY = "ccjdnt310y3k4etfbdl9snpajqs5ktjag6w126yz"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S"
)
log = logging.getLogger("RoK")


# ═══════════════════════════════════════════════════════════
# SUPABASE HELPERS
# ═══════════════════════════════════════════════════════════

def _get_supabase():
    """Crea il client Supabase (lazy import)."""
    from supabase import create_client
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def save_to_supabase(data: dict, start: str, end: str):
    """Upsert dei membri nella tabella kingdom_members su Supabase."""
    sb = _get_supabase()
    total = 0
    for svr_id, members in data.items():
        if not members:
            continue
        rows = []
        for m in members:
            rows.append({
                "id":         int(m["id"]),
                "kingdom_id": int(svr_id),
                "dt":         m.get("dt", start),
                "name":       m.get("name", ""),
                "power":      int(m.get("power", 0)),
                "max_power":  int(m.get("max_power", 0)),
                "collect":    int(m.get("collect", 0)),
                "dead":       int(m.get("dead", 0)),
                "kill":       int(m.get("kill", 0)),
                "t1":         int(m.get("t1", 0)),
                "t2":         int(m.get("t2", 0)),
                "t3":         int(m.get("t3", 0)),
                "t4":         int(m.get("t4", 0)),
                "t5":         int(m.get("t5", 0)),
                "help":       int(m.get("help", 0)),
                "dead_t1":    int(m.get("dead_t1", 0)),
                "dead_t2":    int(m.get("dead_t2", 0)),
                "dead_t3":    int(m.get("dead_t3", 0)),
                "dead_t4":    int(m.get("dead_t4", 0)),
                "dead_t5":    int(m.get("dead_t5", 0)),
            })
        # Upsert in batch (Supabase gestisce fino a ~1000 righe per chiamata)
        batch_size = 500
        for i in range(0, len(rows), batch_size):
            batch = rows[i:i + batch_size]
            sb.table("kingdom_members").upsert(batch, on_conflict="id,kingdom_id,dt").execute()
        total += len(rows)
        log.info(f"  Supabase: KD {svr_id} → {len(rows)} righe upserted")
    log.info(f"Supabase totale: {total} righe salvate")


# ═══════════════════════════════════════════════════════════
# TOKEN MANAGER (file locale + Supabase)
# ═══════════════════════════════════════════════════════════

class TokenManager:
    def __init__(self, token_file: str, use_supabase: bool = False):
        self.path = Path(token_file)
        self.use_supabase = use_supabase
        self._data = {}
        self._load()

    def _load(self):
        # Prova prima Supabase (per GitHub Actions)
        if self.use_supabase and SUPABASE_URL:
            try:
                sb = _get_supabase()
                result = sb.table("app_tokens").select("value").eq("key", "rok_pauthorization").maybe_single().execute()
                if result.data:
                    self._data["pauthorization"] = result.data["value"]
                    log.info("Token caricato da Supabase")
                    return
            except Exception as e:
                log.warning(f"Impossibile caricare token da Supabase: {e}")
        # Fallback: file locale
        if self.path.exists():
            self._data = json.loads(self.path.read_text())

    def save(self):
        # Salva su file locale
        self.path.write_text(json.dumps(self._data, indent=2))
        # Salva anche su Supabase se disponibile
        if self.use_supabase and SUPABASE_URL:
            try:
                sb = _get_supabase()
                sb.table("app_tokens").upsert({
                    "key": "rok_pauthorization",
                    "value": self._data.get("pauthorization", ""),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }).execute()
                log.info("Token salvato su Supabase")
            except Exception as e:
                log.warning(f"Impossibile salvare token su Supabase: {e}")

    def get(self) -> Optional[str]:
        token = self._data.get("pauthorization", "")
        if not token:
            return None
        try:
            payload = token.split(".")[1]
            payload += "=" * (4 - len(payload) % 4)
            exp       = json.loads(base64.b64decode(payload)).get("exp", 0)
            remaining = exp - datetime.now(timezone.utc).timestamp()
            if remaining > 0:
                log.info(f"Token valido ancora per ~{int(remaining // 3600)}h (~{int(remaining // 86400)}gg)")
                return token
            log.warning("Token scaduto.")
            return None
        except Exception:
            return token

    def set(self, token: str):
        token = token.removeprefix("Bearer ").strip()
        self._data["pauthorization"] = token
        self.save()
        log.info(f"Token salvato in {self.path}")


# ═══════════════════════════════════════════════════════════
# LOGIN AUTOMATICO (puro requests, no browser)
# ═══════════════════════════════════════════════════════════

class LoginManager:
    def __init__(self, email: str, password_md5: str, tm: TokenManager):
        self.email        = email
        self.password_md5 = password_md5
        self.tm           = tm
        self.sess         = requests.Session()
        self.sess.headers.update({
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36",
            "accept-language": "en-US,en;q=0.9",
        })

    def _sign(self, timestamp: str) -> str:
        combo = f"access_key={ACCESS_KEY}timestamp={timestamp}{SECRET_KEY}"
        return hashlib.md5(combo.encode()).hexdigest()

    def _get_pup_token(self) -> str:
        import time as _time
        ts = str(int(_time.time() * 1000))
        sig = self._sign(ts)

        pup_url = f"{PASSPORT_API}/api/v2/pup/rok_game_tools_lglo?timestamp={ts}&signature={sig}&access_key={ACCESS_KEY}"
        self.sess.get(pup_url, headers={
            "accept": "application/json, text/plain, */*",
            "x-client-info": f"os-type=pc;language=en;visitor-id={VISITOR_ID}",
            "referer": "https://passport-global.lilith.com/",
        }, timeout=15)

        ts2 = str(int(_time.time() * 1000))
        sig2 = self._sign(ts2)
        captcha_url = f"{PASSPORT_API}/api/v2/passport-login/captcha?timestamp={ts2}&signature={sig2}&access_key={ACCESS_KEY}"

        log.info("Ottengo il pup_token via /captcha...")
        r = self.sess.get(captcha_url, headers={
            "accept": "application/json, text/plain, */*",
            "x-client-info": f"os-type=pc;language=en;visitor-id={VISITOR_ID}",
            "referer": "https://passport-global.lilith.com/",
        }, timeout=15)
        r.raise_for_status()
        data = r.json()

        token = (data.get("data") or {}).get("pup_token") or \
                (data.get("data") or {}).get("token")     or \
                data.get("pup_token") or data.get("token")

        if not token:
            raise RuntimeError(
                f"pup_token non ottenuto da /captcha.\n"
                f"Risposta: {json.dumps(data)[:400]}"
            )

        log.info(f"pup_token ottenuto: {str(token)[:16]}...")
        return str(token)

    def login(self, pup_token: str = None) -> str:
        pup_token = pup_token or self._get_pup_token()

        log.info("Eseguo login con email + password...")
        r = self.sess.post(
            f"{PASSPORT_API}/api/v2/passport-login/password",
            json={
                "pup_token":    pup_token,
                "client_id":    "rok_game_tools_lglo",
                "username":     self.email,
                "password":     self.password_md5,
                "account_type": 0,
                "login_free":   True,
            },
            headers={
                "accept":        "application/json, text/plain, */*",
                "content-type":  "application/json",
                "x-client-info": f"os-type=pc;language=en;visitor-id={VISITOR_ID}",
                "referer":       "https://passport-global.lilith.com/",
            },
            timeout=15,
        )
        r.raise_for_status()
        data = r.json()

        d = data.get("data") or {}
        pauth = (
            d.get("jwt_token") or
            d.get("token")     or
            d.get("access_token")
        )

        if not pauth:
            raise RuntimeError(f"Login fallito. Risposta: {json.dumps(data)[:500]}")

        log.info("Login riuscito!")
        self.tm.set(pauth)
        return pauth

    def ensure(self, pup_token: str = None) -> str:
        token = self.tm.get()
        if token:
            return token
        log.info("Token assente/scaduto, eseguo login automatico...")
        return self.login(pup_token=pup_token)


# ═══════════════════════════════════════════════════════════
# API CLIENT
# ═══════════════════════════════════════════════════════════

class RoKApiClient:
    def __init__(self, app_id: int, app_uid: str, pauth: str):
        self.app_id  = app_id
        self.app_uid = app_uid
        self.sess    = requests.Session()
        self.sess.headers.update({
            "lang":           "en_US",
            "content-type":   "application/json",
            "pauthorization": f"Bearer {pauth}",
            "accept":         "application/json, text/plain, */*",
        })

    def discover_characters(self) -> dict:
        """GET /api/lilith/roles → {uid: svr_id}"""
        log.info("Scoperta automatica dei personaggi...")
        r = self.sess.get(f"{BASE_API}/api/lilith/roles")
        r.raise_for_status()
        data = r.json()

        raw = data.get("data", {})
        if isinstance(raw, dict):
            roles = raw.get("roles_list") or raw.get("list") or raw.get("roles") or []
        elif isinstance(raw, list):
            roles = raw
        else:
            roles = []

        characters = {}
        for role in roles:
            if not isinstance(role, dict):
                continue
            uid    = role.get("uid")    or role.get("role_id")  or role.get("id")
            svr_id = role.get("svr_id") or role.get("server_id")
            name   = role.get("name")   or role.get("roleName") or "?"
            power  = role.get("power")  or 0
            if uid and svr_id:
                characters[uid] = svr_id
                log.info(f"  KD {svr_id}  |  {name}  |  power={int(power):,}  |  uid={uid}")
        log.info(f"Totale: {len(characters)} personaggi")
        return characters

    def get_bauth(self, uid: int) -> tuple:
        r = self.sess.post(
            f"{BASE_API}/api/lilith/bind_role",
            json={"app_id": self.app_id, "app_uid": self.app_uid, "uid": uid}
        )
        r.raise_for_status()
        data = r.json()
        if data.get("code") != 200:
            raise RuntimeError(f"bind_role failed: {data}")
        info = data["data"]["user_base_info"]
        return f"Bearer {data['data']['access_token']}", info["svr_id"]

    INTL = {
        "id": "Character ID", "name": "Username", "power": "Power",
        "max_power": "Highest Power", "dead_t5": "T5 Deaths", "dead_t4": "T4 Deaths",
        "dead_t3": "T3 Deaths", "dead_t2": "T2 Deaths", "dead_t1": "T1 Deaths",
        "kill": "Total Kill Points", "t5": "T5 Kills", "t4": "T4 Kills",
        "t3": "T3 Kills", "t2": "T2 Kills", "t1": "T1 Kills",
        "collect": "Resources Gathered", "help": "Alliance Helps",
    }

    def get_members(self, svr_id: int, bauth: str, start: str, end: str, search: str = "") -> list:
        r = self.sess.get(
            f"{DATA_API}/api/kindomMember",
            params={"start": start, "end": end, "search": search, "server_id": svr_id},
            headers={"bauthorization": bauth},
        )
        r.raise_for_status()
        data = r.json()
        members = data.get("data", [])
        if isinstance(members, dict):
            members = members.get("list") or members.get("members") or []
        log.info(f"  KD {svr_id} [{start} -> {end}]: {len(members)} membri")
        return members

    def export_excel(self, svr_id: int, bauth: str, start: str, end: str,
                     out_dir: str, search: str = "") -> Path:
        import urllib.parse as _ul
        header = "1" * len(self.INTL)
        r = self.sess.get(
            f"{DATA_API}/api/kindomMember/export",
            params={
                "search": search, "start": start, "end": end,
                "language": "en", "header": header,
                "server_id": svr_id, "intl": _ul.quote(json.dumps(self.INTL, ensure_ascii=False)),
            },
            headers={"bauthorization": bauth},
        )
        r.raise_for_status()
        p = Path(out_dir); p.mkdir(exist_ok=True)
        f = p / f"rok_kd{svr_id}_{start}_{end}.xlsx"
        f.write_bytes(r.content)
        log.info(f"  Excel -> {f} ({len(r.content)//1024}kb)")
        return f

    def fetch_all(self, characters: dict, start: str, end: str,
                  output_format: str = "json", out_dir: str = "output",
                  search: str = "") -> dict:
        results = {}
        for uid, svr_id in characters.items():
            log.info(f"Fetching KD {svr_id} (uid={uid})...")
            try:
                bauth, actual_svr = self.get_bauth(uid)
                if output_format == "xlsx":
                    self.export_excel(actual_svr, bauth, start, end, out_dir, search)
                    results[actual_svr] = []
                else:
                    members = self.get_members(actual_svr, bauth, start, end, search)
                    results[actual_svr] = members
                time.sleep(0.5)
            except Exception as e:
                log.error(f"  KD {svr_id}: {e}")
        return results


# ═══════════════════════════════════════════════════════════
# OUTPUT
# ═══════════════════════════════════════════════════════════

def save_json(data: dict, out_dir: str, start: str, end: str) -> Path:
    p = Path(out_dir); p.mkdir(exist_ok=True)
    f = p / f"rok_members_{start}_{end}.json"
    f.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    log.info(f"JSON -> {f}")
    return f

def save_csv(data: dict, out_dir: str, start: str, end: str) -> list:
    p = Path(out_dir); p.mkdir(exist_ok=True)
    saved = []
    for svr_id, members in data.items():
        if not members: continue
        f = p / f"rok_kd{svr_id}_{start}_{end}.csv"
        with open(f, "w", newline="", encoding="utf-8") as fh:
            w = csv.DictWriter(fh, fieldnames=members[0].keys())
            w.writeheader(); w.writerows(members)
        log.info(f"CSV  -> {f} ({len(members)} righe)")
        saved.append(f)
    return saved

def print_summary(data: dict, start: str, end: str):
    total = 0
    log.info(f"--- RIEPILOGO {start} -> {end} ---")
    for svr_id, members in sorted(data.items()):
        count = len(members); total += count
        log.info(f"  KD {svr_id}: {count} membri")
    log.info(f"  TOTALE: {total} membri")


# ═══════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════

def main(
    start_date:    str  = None,
    end_date:      str  = None,
    search:        str  = "",
    output_format: str  = "json",
    kingdoms:      list = None,
    exclude_kingdoms: list = None,
    force_login:   bool = False,
    pup_token:     str  = None,
    use_supabase:  bool = False,
    yesterday:     bool = False,
):
    if yesterday:
        yday = (datetime.now() - timedelta(days=1)).strftime("%Y-%m-%d")
        start_date = start_date or yday
        end_date   = end_date   or yday
    else:
        today      = datetime.now(timezone(timedelta(hours=1))).strftime("%Y-%m-%d")
        start_date = start_date or today
        end_date   = end_date   or start_date

    log.info(f"RoK Kingdom Fetcher  {start_date} -> {end_date}")

    tm    = TokenManager(CONFIG["token_file"], use_supabase=use_supabase)
    lm    = LoginManager(CONFIG["email"], CONFIG["password_md5"], tm)
    pauth = lm.login(pup_token=pup_token) if force_login else lm.ensure(pup_token=pup_token)

    client     = RoKApiClient(CONFIG["app_id"], CONFIG["app_uid"], pauth)
    characters = client.discover_characters()

    if not characters:
        log.error("Nessun personaggio trovato. Verifica le credenziali.")
        return {}

    if kingdoms:
        characters = {uid: svr for uid, svr in characters.items() if svr in kingdoms}
    if exclude_kingdoms:
        characters = {uid: svr for uid, svr in characters.items() if svr not in exclude_kingdoms}

    data = client.fetch_all(characters, start_date, end_date, output_format, CONFIG["output_dir"], search)
    print_summary(data, start_date, end_date)

    if output_format in ("json", "both"):
        save_json(data, CONFIG["output_dir"], start_date, end_date)
    if output_format in ("csv", "both"):
        save_csv(data, CONFIG["output_dir"], start_date, end_date)

    if use_supabase:
        if not SUPABASE_URL or not SUPABASE_KEY:
            log.error("SUPABASE_URL e SUPABASE_KEY devono essere impostati per --supabase")
        else:
            save_to_supabase(data, start_date, end_date)

    return data


# ═══════════════════════════════════════════════════════════
# CLI
# ═══════════════════════════════════════════════════════════

if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser(description="RoK Kingdom Member Fetcher")
    p.add_argument("--start",       default=None)
    p.add_argument("--end",         default=None)
    p.add_argument("--search",      default="")
    p.add_argument("--format",      default="json", choices=["json", "csv", "xlsx", "both"])
    p.add_argument("--kingdoms",    nargs="+", type=int, default=None)
    p.add_argument("--exclude-kingdoms", nargs="+", type=int, default=None, help="Kingdom IDs da escludere")
    p.add_argument("--force-login", action="store_true", help="Forza re-login anche se il token e valido")
    p.add_argument("--pup-token",   default=None, help="pup_token manuale (da DevTools)")
    p.add_argument("--supabase",    action="store_true", help="Salva i dati su Supabase")
    p.add_argument("--yesterday",   action="store_true", help="Scarica i dati di ieri")
    args = p.parse_args()

    main(
        start_date=args.start,
        end_date=args.end,
        search=args.search,
        output_format=args.format,
        kingdoms=args.kingdoms,
        exclude_kingdoms=args.exclude_kingdoms,
        force_login=args.force_login,
        pup_token=args.pup_token,
        use_supabase=args.supabase,
        yesterday=args.yesterday,
    )
