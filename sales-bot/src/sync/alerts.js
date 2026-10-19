"use strict";

/**
 * Alertas técnicos com deduplicação: cada problema (chave) é avisado UMA vez
 * enquanto estiver ativo, e a recuperação é avisada uma vez também.
 * O estado fica no banco (app_state) para sobreviver a reinícios.
 * O transporte (Discord) é injetado depois com setSender(); até lá, enfileira.
 */

const STATE_KEY = "alerts:active";

function createAlerts({ repo, logger }) {
  let sender = null;
  const queue = [];

  function active() {
    return repo.getState(STATE_KEY) || {};
  }

  async function deliver(alert) {
    logger?.[alert.level === "error" ? "error" : alert.level === "warn" ? "warn" : "info"](`Alerta: ${alert.title} — ${alert.message}`);
    if (!sender) {
      queue.push(alert);
      if (queue.length > 50) queue.shift();
      return true;
    }
    try {
      await sender(alert);
      return true;
    } catch (error) {
      logger?.warn("Não foi possível enviar alerta ao Discord:", error?.message || error);
      return false;
    }
  }

  return {
    async setSender(fn) {
      sender = fn;
      while (sender && queue.length) await deliver(queue.shift());
    },

    isActive(key) {
      return Boolean(active()[key]);
    },

    activeKeys() {
      return Object.keys(active());
    },

    /** Avisa se a chave ainda não estiver ativa. Retorna true se enviou. */
    async raise(key, { title, message, level = "error" }) {
      const current = active();
      if (current[key]) return false;
      current[key] = { since: new Date().toISOString(), title };
      repo.setState(STATE_KEY, current);
      const delivered = await deliver({ key, title, message, level });
      if (!delivered) {
        // Envio falhou (ex.: bot sem acesso ao canal): libera para tentar de novo depois.
        const latest = active();
        delete latest[key];
        repo.setState(STATE_KEY, latest);
        return false;
      }
      return true;
    },

    /** Encerra um alerta ativo e avisa a recuperação (se houver mensagem). */
    async resolve(key, { title, message } = {}) {
      const current = active();
      if (!current[key]) return false;
      delete current[key];
      repo.setState(STATE_KEY, current);
      if (title) await deliver({ key, title, message: message || "", level: "ok" });
      return true;
    },

    /** Aviso informativo sem deduplicação (ex.: backfill concluído). */
    async notify({ title, message, level = "info" }) {
      await deliver({ key: null, title, message, level });
    },
  };
}

module.exports = { createAlerts };
