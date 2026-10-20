# sales-bot — vendas dos grupos Roblox no Discord

Bot de Discord **privado** (só os dois sócios usam) que acompanha as vendas dos nossos grupos Roblox:

- **aviso a cada venda** no canal de vendas (agrupado quando chegam mais de 10 de uma vez);
- **resumos automáticos** diário, semanal e mensal;
- `/resumo`, `/vendas` (lista completa paginada), `/exportar` (CSV para Excel), `/grafico`, `/saldo`, `/item`, `/status`, `/sincronizar`;
- **alertas técnicos** (cookie expirado, sem permissão, falhas seguidas, histórico importado).

Roda como processo separado no pm2 (`sales-bot`), com sua **própria aplicação Discord**, sem tocar no `velvet-bot` nem no `group-tenure-bot`.

> Todos os valores são **líquidos** (o que entra no grupo depois da taxa da Roblox). O bruto só aparece como estimativa se você cadastrar o preço dos itens em `config/item_prices.json`.

---

## 1. Conta alternativa e cargo no grupo

1. Crie uma **conta Roblox alternativa** só para o bot (não use a sua conta principal).
2. Em cada grupo: **Configurar grupo → Cargos → Criar cargo** (ex.: `Financeiro (bot)`), com **apenas** a permissão de **ver a receita/finanças do grupo** (em "Receita": *Ver receita do grupo* / *View group payouts and revenue*). Nada de postar, expulsar, gerenciar itens ou pagar.
3. Faça a conta alternativa entrar no grupo e dê a ela esse cargo.
4. Pegue o cookie `.ROBLOSECURITY` da conta alternativa: entre com ela no navegador (de preferência numa janela anônima), abra as ferramentas do desenvolvedor (F12) → **Aplicativo/Application → Cookies → https://www.roblox.com** → copie o valor de `.ROBLOSECURITY` (começa com `_|WARNING:-DO-NOT-SHARE-THIS`). Feche a janela **sem clicar em "Sair"** (sair invalida o cookie).

⚠️ Esse cookie dá acesso total à conta alternativa. Ele fica só no `.env` (fora do git, `chmod 600`) e o bot nunca o imprime em logs.

## 2. Aplicação Discord (própria deste bot)

1. https://discord.com/developers/applications → **New Application** (ex.: "Vendas").
2. **Bot → Reset Token** → copie para `DISCORD_TOKEN`. Não precisa de nenhum *Privileged Gateway Intent*.
3. **General Information → Application ID** → `DISCORD_CLIENT_ID`.
4. **OAuth2 → URL Generator**: escopos `bot` e `applications.commands`; permissões: *Ver canais*, *Enviar mensagens*, *Inserir links*, *Anexar arquivos*, *Ler histórico*. Abra a URL e convide o bot para o servidor.

### Como pegar os IDs
Discord → Configurações → Avançado → **Modo desenvolvedor** ligado. Depois clique com o botão direito:
- no servidor → *Copiar ID do servidor* → `GUILD_ID`;
- no canal → *Copiar ID do canal* → `SALES_CHANNEL_ID`, `SUMMARY_CHANNEL_ID`, `ALERT_CHANNEL_ID`;
- num usuário → *Copiar ID do usuário* → `OWNER_IDS` e a divisão em `groups.json`.

ID do grupo Roblox: é o número na URL `roblox.com/communities/<ID>/...`.

## 3. Configuração

```bash
cd sales-bot
npm install
cp .env.example .env                       # preencha
cp config/groups.example.json config/groups.json   # seus grupos
# opcional: cp config/item_prices.example.json config/item_prices.json
npm run check                               # diagnóstico completo
```

`config/groups.json`:
```json
[
  { "id": 123456, "name": "Grupo A", "split": { "1108166595374751828": 50, "433699177705504768": 50 } },
  { "id": 654321, "name": "Grupo B", "split": { "1108166595374751828": 100, "433699177705504768": 0 } }
]
```
- `split` é a porcentagem de cada sócio **naquele grupo** (precisa somar 100). Sem `split`, divide igualmente entre os `OWNER_IDS`.

Variáveis principais do `.env` (veja `.env.example` para todas):

| Variável | O que é |
|---|---|
| `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `GUILD_ID` | aplicação Discord deste bot e o servidor |
| `SALES_CHANNEL_ID` | canal dos avisos de venda |
| `SUMMARY_CHANNEL_ID` | canal dos resumos (vazio = mesmo dos avisos) |
| `ALERT_CHANNEL_ID` | canal dos alertas técnicos (vazio = DM para os donos) |
| `OWNER_IDS` | quem pode usar o bot |
| `ROBLOX_COOKIE` | valor do `.ROBLOSECURITY` da conta alternativa |
| `POLL_INTERVAL_MINUTES` | de quanto em quanto tempo busca vendas (3) |
| `PENDING_RECHECK_DAYS` | até quantos dias atrás revisita vendas pendentes (10) |
| `TIMEZONE` | fuso dos resumos e datas (America/Sao_Paulo) |
| `DAILY_SUMMARY_TIME`, `WEEKLY_SUMMARY_DAY/TIME`, `MONTHLY_SUMMARY_DAY/TIME` | horários dos resumos (vazio desliga) |

## 4. Rodando

```bash
npm run check       # valida .env, cookie, permissão em cada grupo, token e canais
npm run sync:once   # coleta uma vez sem Discord (importa o histórico; útil para testar)
npm start           # bot completo
npm test            # testes automatizados (Roblox mockada)
npm run register    # re-registra os slash commands (o bot já faz isso ao iniciar)
```

Na **primeira execução** o bot importa o histórico de vendas dos últimos **60 dias** (`BACKFILL_MAX_DAYS`; `0` = tudo o que a API devolver), devagar e retomável; essas vendas antigas **não** geram aviso. Atenção: a API da Roblox só deixa ler as ~10 mil vendas mais recentes de cada grupo, então em grupos grandes o histórico começa só alguns dias antes da instalação. Quando termina, ele avisa no canal de alertas. Dica de diagnóstico: `npm run sync:once -- --dump` salva a primeira página bruta da API em `data/debug/`.

## 5. Comandos

Todas as respostas são **efêmeras** (só você vê), a menos que use `publico:true`.

| Comando | O que mostra |
|---|---|
| `/resumo periodo [grupo] [inicio] [fim]` | total líquido, nº de vendas, ticket médio, variação vs período anterior equivalente, top 5 itens e compradores, total por grupo, **parte de cada sócio**, liberado × pendente, bruto estimado |
| `/vendas [periodo] [grupo] [item] [comprador]` | lista **todas** as vendas, 10 por página, com ⏮ ◀ ▶ ⏭ (só quem abriu navega; expira em 10 min) |
| `/exportar [periodo] [grupo]` | CSV (UTF-8 com BOM, `;`) que abre certo no Excel em português |
| `/grafico [periodo] [grupo] [cor] [tema] [titulo] [subtitulo] [rodape] [media] [multiplicador]` | imagem com barras de vendas por dia (por semana/mês em períodos longos). Cor (nome ou #hex), tema claro/escuro, textos e linha de média personalizáveis. `multiplicador` multiplica só o que aparece no gráfico e mostra um "×N" discreto ao lado do título |
| `/saldo` | Robux atuais de cada grupo + pendentes |
| `/item nome` | desempenho de um item ao longo do tempo (com gráfico) |
| `/status` | última sincronização por grupo, cookie OK?, backfill, erros recentes, uptime |
| `/sincronizar` | força uma coleta agora |

Períodos: `hoje`, `24h`, `7d`, `30d`, `mes_atual`, `mes_passado`, `ano`, `tudo`, `personalizado` (com `inicio` e `fim` em `dd/mm/aaaa`, fim inclusivo).

## 6. Limitações conhecidas

- **Valores líquidos.** A API entrega o valor após a taxa; o bruto não é recalculado (dividir por 0,7 dá erro de arredondamento). Use `config/item_prices.json` se quiser a estimativa de bruto.
- **O cookie expira** ou é invalidado (troca de senha, "sair de todas as sessões", detecção de login suspeito). O bot avisa **uma vez** no canal de alertas e continua tentando a cada 15 min. Para renovar: gere um novo cookie, atualize o `.env`, `npm run check`, `pm2 restart sales-bot --update-env`.
- **Cookie invalidado logo ao usar na VPS:** a Roblox às vezes invalida o cookie quando ele aparece de outro IP/país. Gere um novo e teste com `npm run check` **na própria VPS**; se continuar acontecendo, gere o cookie acessando a conta alternativa por um navegador que use a mesma rede da VPS.
- A API de transações é interna (não oficial) e pode mudar; o parser é defensivo, guarda sempre o JSON bruto e o `npm run check` mostra os campos recebidos.
- Pendentes viram liberados depois de alguns dias; o bot revisita as vendas pendentes até `PENDING_RECHECK_DAYS`.
- O histórico importado é o que a API devolver (a Roblox pode limitar quão longe ela vai).

Detalhes das escolhas técnicas: [`DECISIONS.md`](DECISIONS.md). Deploy na VPS: [`DEPLOY.md`](DEPLOY.md).
