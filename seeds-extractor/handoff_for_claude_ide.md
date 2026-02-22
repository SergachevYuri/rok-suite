# RoK Kingdom Stats — Handoff per Claude IDE

## Cosa abbiamo già

### Script Python: `rok_automation.py`
Scraper completamente automatico che:
1. Fa login su https://rok-game-tools-global.lilith.com/ tramite API diretta (no browser)
2. Ottiene un `pup_token` dall'endpoint `/api/v2/passport-login/captcha`
3. Fa login con email + MD5(password) → ottiene `jwt_token` (valido ~30 giorni, si rinnova automaticamente)
4. Scopre tutti i personaggi collegati all'account via `/api/lilith/roles`
5. Per ogni personaggio chiama `bind_role` → ottiene `bauthorization`
6. Scarica i dati membri da `https://plat-rok-gametools-global-api.lilithgames.com/api/kindomMember`
7. Salva i risultati in JSON

### Struttura dati — ogni membro ha questi campi:
```json
{
  "id": "209795470",
  "name": "NomeGiocatore",
  "power": "79334993",
  "max_power": "80558936",
  "collect": "3848820",
  "dead": "0",
  "kill": "0",
  "t1": "0", "t2": "0", "t3": "0", "t4": "0", "t5": "0",
  "help": "111",
  "dt": "2026/02/21",
  "dead_t1": "0", "dead_t2": "0", "dead_t3": "0", "dead_t4": "0", "dead_t5": "0"
}
```

### Account configurato:
- Email: dvdddrok@gmail.com
- Kingdom attivi: KD 3921 (~1174 membri), KD 4041
- I dati sono disponibili con 1 giorno di ritardo (oggi non disponibile, ieri sì)

### Uso attuale:
```bash
python rok_automation.py --start 2026-02-21 --end 2026-02-21
# Output: output/rok_members_2026-02-21_2026-02-21.json
```

---

## Cosa dobbiamo costruire

### Stack:
- **GitHub Actions** → esegue `rok_automation.py` ogni notte (cron), salva i dati su Supabase
- **Supabase** → database PostgreSQL, storicizza i dati giornalieri per kingdom
- **Vercel** → frontend Next.js che legge da Supabase e mostra dashboard

### Feature richieste:
1. **Top 400 del kingdom** per giorno — classifica per power, con colonne: nome, power, kill points, resources gathered, alliance helps
2. **Grafici storici** — andamento giornaliero dei totali aggregati (somma power, kill points, gather, help) nei giorni
3. Supporto multi-kingdom (al momento KD 3921 e KD 4041)

### Schema Supabase suggerito:
```sql
-- Tabella principale
CREATE TABLE kingdom_members (
  id          BIGINT,
  kingdom_id  INT,
  dt          DATE,
  name        TEXT,
  power       BIGINT,
  max_power   BIGINT,
  collect     BIGINT,
  dead        BIGINT,
  kill        BIGINT,
  t1 BIGINT, t2 BIGINT, t3 BIGINT, t4 BIGINT, t5 BIGINT,
  help        BIGINT,
  dead_t1 BIGINT, dead_t2 BIGINT, dead_t3 BIGINT, dead_t4 BIGINT, dead_t5 BIGINT,
  PRIMARY KEY (id, kingdom_id, dt)
);
```

### GitHub Actions — workflow da creare (`.github/workflows/daily_scrape.yml`):
- Schedule: `cron: '0 6 * * *'` (ogni mattina alle 6 UTC, dati di ieri disponibili)
- Secrets necessari: `LILITH_PASSWORD_MD5`, `SUPABASE_URL`, `SUPABASE_KEY`
- Lo script deve modificarsi per: invece di salvare JSON locale → inserire righe su Supabase via API

### Modifiche allo script Python necessarie:
- Aggiungere funzione `save_to_supabase(members, kingdom_id, date)` usando `supabase-py`
- Usare `--date yesterday` come default nel cron
- Rimuovere i `[DEBUG]` print che ora non servono più

---

## Note tecniche importanti

**Login flow** (tutto automatico, no browser):
1. `POST /api/v2/config/publish` + `POST /api/v2/config/game` (init sessione)
2. `GET /api/v2/pup/rok_game_tools_lglo?timestamp=...&signature=...` (signature = MD5("access_key=97r9ihrvxuh6d8kdrztw03ovlvxtssx4timestamp={ts}ccjdnt310y3k4etfbdl9snpajqs5ktjag6w126yz"))
3. `GET /api/v2/passport-login/captcha?timestamp=...&signature=...` → restituisce `pup_token`
4. `POST /api/v2/passport-login/password` con `{pup_token, username, password: MD5(password), client_id: "rok_game_tools_lglo"}` → restituisce `jwt_token`
5. `GET /api/lilith/roles` con header `pauthorization: Bearer {jwt_token}` → lista personaggi in `data.roles_list`
6. `POST /api/lilith/bind_role` con `{app_id: 2104267, app_uid: "251984359", uid}` → restituisce `bauthorization`
7. `GET /api/kindomMember?start=...&end=...&server_id=...` con entrambi i token → dati membri

**Il jwt_token dura ~30 giorni** — lo script lo salva in `rok_tokens.json` e si rinnova automaticamente quando scade.
