# Roblox Group Tenure Bot

Separate Discord bot for checking how long a Roblox user has been in configured groups.

## Setup

1. Create a separate Discord application and enable its bot.
2. Copy `.env.example` to `.env` and fill every required value.
3. Create a Roblox Open Cloud API key with group read access for each monitored group.
4. Run `npm install` and then `npm start`.

## Commands

- `/group_add group_id` - admin only; adds a group to this Discord server.
- `/group_remove group_id` - admin only; stops checking a group.
- `/group_list` - lists configured groups.
- `/group_time username` - checks the current membership date in every configured group.
- `/link_roblox username` - links your Discord account to a Roblox account.
- `/my_group_time` - checks the linked Roblox account.

The Roblox membership `createTime` is the current membership's join timestamp. If somebody leaves a group and joins it again, Roblox reports the new membership timestamp.

## VPS

```bash
cd ~/Bot-UGC/group-tenure-bot
npm install --omit=dev
pm2 start index.js --name group-tenure-bot
pm2 save
```
