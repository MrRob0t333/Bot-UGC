"use strict";

/** npm run register — (re)registra os slash commands no servidor GUILD_ID. */

const { loadConfig, loadDotenv } = require("../config");
const { createLogger, registerSecret } = require("../logger");

loadDotenv();

async function main() {
  const { config, errors } = loadConfig({ requireDiscord: true, requireRoblox: false });
  const logger = createLogger({ scope: "register" });
  const discordErrors = errors.filter(message => /DISCORD|GUILD/.test(message));
  if (discordErrors.length) {
    logger.error(`Configuração inválida:\n - ${discordErrors.join("\n - ")}`);
    process.exit(1);
  }
  registerSecret(config.discord.token);
  const { registerCommands } = require("../discord/bot");
  await registerCommands({ ...config.discord, logger });
}

main().catch(error => {
  createLogger().error("Falha ao registrar comandos:", error);
  process.exit(1);
});
