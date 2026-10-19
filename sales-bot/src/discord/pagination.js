"use strict";

/**
 * Sessões de paginação em memória. Cada lista pertence a quem abriu e expira
 * após 10 minutos (o token da interação do Discord vale 15).
 * customId: "vendas:<sessionId>:<ação>"
 */

const crypto = require("crypto");

const PAGE_SIZE = 10;
const SESSION_TTL_MS = 10 * 60 * 1000;
const PREFIX = "vendas";

function createPaginationStore({ now = () => Date.now(), ttlMs = SESSION_TTL_MS } = {}) {
  const sessions = new Map();

  function sweep() {
    const current = now();
    for (const [id, session] of sessions) if (session.expiresAt <= current) sessions.delete(id);
  }

  return {
    create({ ownerId, filter, title, filtersText, totalCount }) {
      sweep();
      const id = crypto.randomBytes(6).toString("hex");
      const session = {
        id,
        ownerId,
        filter,
        title,
        filtersText,
        totalCount,
        page: 1,
        createdAt: now(),
        expiresAt: now() + ttlMs,
      };
      sessions.set(id, session);
      return session;
    },

    get(id) {
      const session = sessions.get(id);
      if (!session) return null;
      if (session.expiresAt <= now()) {
        sessions.delete(id);
        return null;
      }
      return session;
    },

    delete(id) {
      sessions.delete(id);
    },

    size() {
      sweep();
      return sessions.size;
    },
  };
}

function totalPagesFor(count) {
  return Math.max(1, Math.ceil(count / PAGE_SIZE));
}

/** Calcula a próxima página a partir da ação do botão. */
function nextPage(action, page, totalPages) {
  switch (action) {
    case "first":
      return 1;
    case "prev":
      return Math.max(1, page - 1);
    case "next":
      return Math.min(totalPages, page + 1);
    case "last":
      return totalPages;
    default:
      return page;
  }
}

function parseCustomId(customId) {
  const [prefix, sessionId, action] = String(customId || "").split(":");
  if (prefix !== PREFIX || !sessionId || !action) return null;
  return { sessionId, action };
}

/** Linha de botões ⏮ ◀ [X/Y] ▶ ⏭ em JSON da API. */
function buttonsRow(sessionId, page, totalPages, { disabled = false } = {}) {
  const button = (action, label, isDisabled) => ({
    type: 2,
    style: 2,
    custom_id: `${PREFIX}:${sessionId}:${action}`,
    label,
    disabled: disabled || isDisabled,
  });
  return {
    type: 1,
    components: [
      button("first", "⏮", page <= 1),
      button("prev", "◀", page <= 1),
      { type: 2, style: 2, custom_id: `${PREFIX}:${sessionId}:noop`, label: `${page}/${totalPages}`, disabled: true },
      button("next", "▶", page >= totalPages),
      button("last", "⏭", page >= totalPages),
    ],
  };
}

module.exports = { createPaginationStore, totalPagesFor, nextPage, parseCustomId, buttonsRow, PAGE_SIZE, SESSION_TTL_MS, PREFIX };
