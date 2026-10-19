# Decisões técnicas — sales-bot

Registro curto das escolhas feitas durante a construção, com o motivo de cada uma.

## Convenções herdadas do repositório
- **CommonJS + `dotenv` + `discord.js` ^14.26.4**, igual ao `group-tenure-bot`. Comandos registrados por servidor (`applicationGuildCommands`) no boot, como lá, e também via `npm run register`.
- Mensagens e logs em português do Brasil.
- Processo separado (`sales-bot/`, pm2 `sales-bot`), com `package.json` próprio e aplicação Discord própria.

## Banco de dados
- **SQLite com adaptador duplo:** tenta `better-sqlite3` (preferido, declarado em `optionalDependencies`) e cai para o `node:sqlite` embutido do Node quando o módulo nativo não instala. Motivo: no ambiente de construção o registro npm estava bloqueado, então os testes rodaram com `node:sqlite`; na VPS/PC o `npm install` traz o `better-sqlite3` normalmente. Como é *opcional*, uma falha de compilação nativa não quebra o `npm install`.
  - `node:sqlite` exige Node ≥ 22.13 (sem flag). O `npm run check` mostra qual driver está em uso.
  - O código usa só parâmetros posicionais (`?`) e uma transação própria (`BEGIN IMMEDIATE`/savepoints) para funcionar igual nos dois drivers.
- **WAL**, `busy_timeout=5000`, `synchronous=NORMAL`.
- **Tudo em UTC (ISO 8601)** no banco; dia/semana/mês calculados no fuso `TIMEZONE` com `Intl` (sem dependências). Semana começa na **segunda-feira**.
- **Migrações versionadas** em `src/db/migrations.js` + tabela `schema_version`. Nunca editar uma migração publicada; criar uma nova.
- Tabelas extras além das pedidas: `app_state` (chave/valor: estado do cookie, alertas ativos, últimas execuções de resumo/backup) e `sync_errors` (últimos 100 erros, para o `/status`).
- **Backup diário** com a API de backup do SQLite (`db.backup` / `node:sqlite.backup`), com `VACUUM INTO` como alternativa. Só apaga arquivos com o padrão `sales-AAAAMMDD-HHMMSS.db` (nunca arquivos alheios). Guarda os últimos `BACKUP_KEEP` (14).

## Identidade das vendas e idempotência
- **Chave primária = `<groupId>:<idTransação>`**, preferindo `idHash`, depois `id` (ignorando `0`), `transactionId` e `purchaseToken`. O prefixo do grupo evita qualquer colisão entre grupos.
- Sem ID estável, usa **hash SHA-256 determinístico** de (grupo, data, comprador, item, valor, lugar, tipo) com prefixo `h:`. Limitação: duas compras idênticas no mesmo segundo pelo mesmo comprador virariam uma só — o `npm run check` avisa se a API não estiver devolvendo ID.
- **`INSERT ... ON CONFLICT(id) DO UPDATE`** que só altera `is_pending` e `updated_at` (este só muda quando o status muda). Uma leitura prévia por linha serve apenas para classificar o resultado (nova / liberada / igual); a escrita é um único upsert.
- `raw_json` guarda sempre a transação bruta, para reprocessar se a Roblox mudar o formato.

## Coleta
- **Outbox de avisos:** vendas novas entram com `notified_at = NULL`; o aviso só marca `notified_at` depois que o Discord confirma o envio. Se o Discord falhar, nada se perde: reenvia no próximo ciclo (e alerta uma vez).
- **Backfill** em blocos de 50 páginas por ciclo (com `BACKFILL_PAGE_DELAY_MS` entre páginas), salvando o cursor a cada página → retomável após reinício. Vendas do backfill já entram com `notified_at` preenchido. Se o cursor salvo expirar (HTTP 400), recomeça do topo (seguro por ser idempotente). O incremental roda logo após o primeiro bloco, então vendas que chegarem durante um backfill longo são avisadas normalmente.
- **Regra de parada do incremental (refinada):** para quando uma página inteira já é conhecida **e** todas as vendas dela são mais antigas (ou iguais) que o *corte*. O corte é a **venda pendente mais antiga do grupo, limitada a `PENDING_RECHECK_DAYS`**; sem pendentes no banco, o corte é "agora" (basta uma página inteira conhecida). Motivo: aplicar literalmente "páginas mais antigas que 10 dias" faria um grupo com muitas vendas ler dezenas de páginas a cada 3 minutos; assim só se relê até onde existe pendente. Limite de segurança: `MAX_INCREMENTAL_PAGES` (100) por ciclo.
- Ciclos são **single-flight** (o `/sincronizar` reaproveita um ciclo em andamento) e há **trava de instância única** por arquivo com PID (`data/sales-bot.lock`); travas de processos mortos são recuperadas sozinhas. O `sync:once` respeita a mesma trava (não roda com o bot ligado).

## Cliente Roblox (Release It!)
- Camada isolada em `src/roblox/` com contrato documentado em `src/roblox/index.js` (`getSalesPage`, `getFunds`, `getRevenueSummary`, `getAuthenticatedUser`, `getGroupInfo`). Trocar cookie por Open Cloud = novo arquivo implementando o mesmo contrato.
- Timeout por requisição (15 s), retry com **backoff exponencial + jitter** para rede/5xx/429/408 (até 4 tentativas), **respeita `Retry-After`**, limitador de **60 req/min** (janela deslizante, configurável).
- **401** → cookie marcado inválido, alerta **uma vez**, o ciclo para de insistir nos outros grupos e novas tentativas só a cada **15 min**; quando volta a funcionar, avisa a recuperação. **403** → alerta por grupo, tenta de novo a cada **30 min**, os demais grupos seguem. **5 falhas seguidas** de outro tipo → alerta. O processo nunca cai por erro da Roblox.
- Valor exibido é sempre o **líquido** (`currency.amount`). Bruto só via `config/item_prices.json` (tabela `item_prices`), mostrado como "bruto estimado" com a cobertura (quantas vendas têm preço).

## Segurança
- Logger com **redação de segredos**: valores registrados (cookie, token Discord) + padrões (`.ROBLOSECURITY=`, `_|WARNING:-DO-NOT-SHARE-THIS…`, tokens de bot, cabeçalhos `Cookie`/`Authorization`). Aplicado em logs, mensagens de erro do HTTP, respostas de erro no Discord e no `npm run check`.
- Erros HTTP guardam a URL **sem query string**.
- CSV protegido contra **injeção de fórmula** (células que começam com `= + - @` recebem `'`).
- `allowedMentions: { parse: [] }` em tudo que o bot envia (menções a sócios aparecem, mas ninguém é notificado por engano).
- `.env`, `data/`, `config/groups.json` e `config/item_prices.json` ficam fora do git.

## Discord
- Só os `OWNER_IDS` usam qualquer coisa (comandos, autocomplete e botões). Estranhos recebem "Sem permissão." efêmero; autocomplete devolve lista vazia.
- Respostas efêmeras por padrão; `publico:true` mostra no canal. `/sincronizar` é sempre efêmero. Todo comando usa `deferReply`.
- **Paginação** em memória: sessão por lista com dono e validade de 10 min; botões ⏮ ◀ X/Y ▶ ⏭; ao expirar, os botões são desabilitados. Cada clique reconsulta o banco (dados sempre atuais).
- **Avisos de venda:** até 10 vendas no ciclo → uma mensagem com um embed por venda (até 10 embeds por mensagem, limite do Discord); mais de 10 → **um embed agrupado** (lista as 20 mais recentes + totais por grupo).
- **Resumos automáticos** registram cada ocorrência no banco (não repetem após reinício) e recuperam até 6 h de atraso. Conteúdo:
  - diário (23:00) = dia de hoje de 00:00 até o horário do envio, comparado com ontem no mesmo trecho;
  - semanal (domingo 23:05) = semana de segunda 00:00 até o envio, comparada com a semana anterior no mesmo trecho;
  - mensal (dia 1, 09:00) = mês anterior completo, comparado com o mês antes dele.
  - Vendas entre 23:00 e 23:59 não aparecem no resumo diário daquele dia, mas entram no semanal/mensal e em `/resumo`.
- **Período anterior equivalente:** períodos "até agora" (hoje, mês atual, ano) comparam com o mesmo trecho decorrido do período anterior; janelas móveis (24h/7d/30d) e personalizado comparam com a janela imediatamente anterior de mesma duração; "tudo" não compara.
- Datas personalizadas `dd/mm/aaaa` com **fim inclusivo**.
- Embeds montados como JSON da API (sem `EmbedBuilder`), o que permite testá-los sem o Discord. Uma cor principal (azul), cinza para neutro, vermelho/amarelo/verde só em alertas.

## Gráficos
- SVG gerado no código e convertido com `@resvg/resvg-js` (sem `canvas`). Barras de uma cor só, grade leve, linha de média, valores só onde não poluem. Mais de 62 dias → barras por semana; mais de 400 dias → por mês.
- Se o `@resvg/resvg-js` faltar, o bot envia o SVG e avisa. Em VPS mínima sem fontes, instale `fonts-dejavu-core` (ver DEPLOY.md).

## Testes
- `node:test` (sem dependências), Roblox sempre mockada. Cobrem parser, HTTP (retry/429/401/403/timeout/rate limit), paginação e regra de parada, idempotência, pendente→liberado, backfill retomável, alertas únicos, períodos no fuso de SP (virada de dia/mês, horário de verão histórico), divisão entre sócios, comparação, CSV, redação de segredos, migrações, backup, trava, notificador, agenda e os handlers do Discord com interações falsas.

## Ambiente de construção (limitações encontradas)
- O registro npm e os domínios da Roblox estavam bloqueados no ambiente onde o código foi escrito, então: não há `package-lock.json` (o primeiro `npm install` no PC/VPS gera — commite-o depois), o parser foi validado só com respostas mockadas no formato documentado, e o `npm run check`/`sync:once` com dados reais fica para quando houver `.env`.
- O `push` para o GitHub não foi possível daqui (sem acesso de rede ao GitHub); os commits ficaram locais.
