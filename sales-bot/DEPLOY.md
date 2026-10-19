# Deploy na VPS (Contabo)

O `sales-bot` roda como processo pm2 **separado**. Estes passos mexem **somente** em `~/Bot-UGC/sales-bot` e no processo `sales-bot` — nunca reinicie/pare `velvet-bot` ou `group-tenure-bot`.

## Pré-requisitos (uma vez)

```bash
node -v        # precisa ser >= 20 (recomendado 22 LTS ou mais novo)
pm2 -v
# Fontes para o texto do /grafico (se a VPS for mínima):
sudo apt-get install -y fonts-dejavu-core
```

Se `node -v` for menor que 20, atualize o Node antes (ex.: via nvm). O `better-sqlite3` baixa binário pronto para Linux x64; se a compilação falhar, o bot usa o SQLite embutido do Node (exige Node ≥ 22.13).

## Primeira instalação

No PC (Windows), depois dos commits:
```bash
cd D:\Bot-UGC
git push origin main
```

Na VPS:
```bash
cd ~/Bot-UGC && git pull
cd sales-bot
npm install --omit=dev        # 1ª vez (gera o package-lock.json); depois use: npm ci --omit=dev
nano .env                     # colar as variáveis (o .env NUNCA vai pelo git)
chmod 600 .env
cp config/groups.example.json config/groups.json && nano config/groups.json
npm run check                 # tudo precisa ficar ✔ (cookie, permissão em cada grupo, token, canais)
npm run sync:once             # opcional: importa o histórico antes de ligar o bot
pm2 start src/index.js --name sales-bot
pm2 save
pm2 logs sales-bot --lines 50
```

Depois, no Discord: `/status` (efêmero) deve mostrar o cookie ✅ e a última sincronização.

> Por que `npm install` na primeira vez? O repositório ainda não tem `package-lock.json` (o ambiente onde o bot foi escrito não acessava o registro npm). Gere o lock no PC com `cd sales-bot && npm install`, commite `sales-bot/package-lock.json`, e a partir daí use `npm ci --omit=dev` na VPS.

### Enviar o .env a partir do PC (opcional)
```bash
scp D:\Bot-UGC\sales-bot\.env <usuario>@<ip-da-vps>:~/Bot-UGC/sales-bot/.env
ssh <usuario>@<ip-da-vps> "chmod 600 ~/Bot-UGC/sales-bot/.env"
```

## Atualizar (deploy de nova versão)

```bash
cd ~/Bot-UGC && git pull
cd sales-bot && npm ci --omit=dev     # ou npm install --omit=dev se ainda não houver lock
npm run check
pm2 restart sales-bot --update-env && pm2 save
pm2 logs sales-bot --lines 50
```

## Renovar o cookie Roblox

```bash
cd ~/Bot-UGC/sales-bot
nano .env                 # troque ROBLOX_COOKIE
npm run check             # precisa mostrar "Cookie válido"
pm2 restart sales-bot --update-env
```
Se o cookie for invalidado logo depois de usado na VPS, gere outro e teste com `npm run check` **na VPS** (veja "Limitações" no README).

## Operação

| Ação | Comando |
|---|---|
| Logs | `pm2 logs sales-bot --lines 100` |
| Parar | `pm2 stop sales-bot` |
| Status | `pm2 describe sales-bot` |
| Coleta manual (com o bot parado) | `npm run sync:once` |
| Backups do banco | `ls ~/Bot-UGC/sales-bot/data/backups/` (diários, últimos 14) |
| Restaurar backup | `pm2 stop sales-bot && cp data/backups/sales-AAAAMMDD-HHMMSS.db data/sales.db && rm -f data/sales.db-wal data/sales.db-shm && pm2 start sales-bot` |

O banco fica em `sales-bot/data/sales.db` (fora do git). O `sync:once` e o bot usam a mesma trava (`data/sales-bot.lock`), então não rodam ao mesmo tempo.
