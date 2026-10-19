"use strict";

/**
 * Envia os avisos de vendas novas (outbox: vendas com notified_at NULL).
 * Só marca como avisada depois que o Discord confirma o envio; se falhar,
 * tenta de novo no próximo ciclo.
 *  - até 10 vendas: uma mensagem com um embed por venda;
 *  - mais de 10: um único embed agrupado (evita spam).
 */

const { saleEmbed, groupedSalesEmbed } = require("./embeds");

const GROUP_THRESHOLD = 10;
const MAX_BATCH = 5000;

function createNotifier({ repo, send, ctx, logger, alerts, channelId }) {
  let running = null;

  async function flushOnce() {
    const sales = repo.unnotifiedSales(MAX_BATCH);
    if (!sales.length) return { sent: 0, mode: "none" };
    try {
      if (sales.length > GROUP_THRESHOLD) {
        await send(channelId, { embeds: [groupedSalesEmbed(sales, ctx)] });
        repo.markNotified(sales.map(sale => sale.id));
        logger?.info(`Aviso agrupado enviado: ${sales.length} vendas.`);
        await alerts?.resolve("discord_send");
        return { sent: sales.length, mode: "grouped" };
      }
      await send(channelId, { embeds: sales.map(sale => saleEmbed(sale, ctx)) });
      repo.markNotified(sales.map(sale => sale.id));
      logger?.info(`${sales.length} aviso(s) de venda enviado(s).`);
      await alerts?.resolve("discord_send");
      return { sent: sales.length, mode: "single" };
    } catch (error) {
      logger?.warn("Falha ao enviar aviso de venda (tento de novo no próximo ciclo):", error?.message || error);
      await alerts?.raise("discord_send", {
        title: "Não consegui avisar vendas no Discord",
        message: `Erro ao enviar no canal <#${channelId}>: ${String(error?.message || error).slice(0, 300)}\nConfira se o bot vê o canal e pode enviar mensagens/embeds. As vendas ficam guardadas e serão avisadas quando funcionar.`,
        level: "warn",
      });
      return { sent: 0, mode: "error", error };
    }
  }

  return {
    flush() {
      if (!running) running = flushOnce().finally(() => { running = null; });
      return running;
    },
  };
}

module.exports = { createNotifier, GROUP_THRESHOLD };
