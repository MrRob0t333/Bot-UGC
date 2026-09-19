# Bot de Tempo em Grupo Roblox

Bot Discord separado para consultar há quanto tempo uma pessoa está nos grupos Roblox configurados.

## Setup

1. Create a separate Discord application and enable its bot.
2. Copy `.env.example` to `.env` and fill every required value.
3. Create a Roblox Open Cloud API key with group read access for each monitored group.
4. Run `npm install` and then `npm start`.

## Comando

- `/consultar usuario grupo` - consulta publicamente o tempo de um usuário em um grupo escolhido pelo nome.
- `/adicionar_grupo id nome` - somente admin; salva um grupo e o nome que aparecerá no seletor.

O grupo é selecionado por autocomplete no Discord. Os grupos existentes continuam salvos em `data/group-tenure.json`. Defina `ADMIN_USER_IDS` com IDs Discord separados por vírgula para controlar quem usa `/adicionar_grupo`. Administradores do servidor também podem usá-lo. Defina `COMMAND_CHANNEL_ID` para manter os comandos em um canal específico.

A data vem do `createTime` da associação atual no Roblox. Caso alguém saia e entre novamente, o Roblox passa a informar a nova data.

## VPS

```bash
cd ~/Bot-UGC/group-tenure-bot
npm install --omit=dev
pm2 start index.js --name group-tenure-bot
pm2 save
```
