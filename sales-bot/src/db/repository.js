"use strict";

/**
 * Todas as consultas SQL ficam aqui. As camadas acima (sync, relatórios, Discord)
 * nunca escrevem SQL diretamente.
 */

function buildWhere(filter = {}) {
  const clauses = [];
  const params = [];
  if (filter.start) {
    clauses.push("s.created_at >= ?");
    params.push(toIso(filter.start));
  }
  if (filter.end) {
    clauses.push("s.created_at < ?");
    params.push(toIso(filter.end));
  }
  if (filter.groupId) {
    clauses.push("s.group_id = ?");
    params.push(String(filter.groupId));
  }
  if (filter.itemId) {
    clauses.push("s.item_id = ?");
    params.push(String(filter.itemId));
  } else if (filter.itemQuery) {
    clauses.push("s.item_name LIKE ? ESCAPE '\\'");
    params.push(`%${escapeLike(filter.itemQuery)}%`);
  }
  if (filter.buyer) {
    const buyer = String(filter.buyer).trim();
    if (/^\d+$/.test(buyer)) {
      clauses.push("(s.buyer_id = ? OR s.buyer_name LIKE ? ESCAPE '\\')");
      params.push(buyer, `%${escapeLike(buyer)}%`);
    } else {
      clauses.push("s.buyer_name LIKE ? ESCAPE '\\'");
      params.push(`%${escapeLike(buyer)}%`);
    }
  }
  if (filter.pending === true) clauses.push("s.is_pending = 1");
  if (filter.pending === false) clauses.push("s.is_pending = 0");
  return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}

function escapeLike(text) {
  return String(text).replace(/[\\%_]/g, char => `\\${char}`);
}

function toIso(value) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function rowToSale(row) {
  if (!row) return null;
  return {
    id: row.id,
    groupId: row.group_id,
    createdAt: row.created_at,
    amount: Number(row.amount),
    currencyType: row.currency_type,
    isPending: Boolean(row.is_pending),
    itemId: row.item_id,
    itemName: row.item_name,
    itemType: row.item_type,
    placeId: row.place_id,
    placeName: row.place_name,
    buyerId: row.buyer_id,
    buyerName: row.buyer_name,
    firstSeenAt: row.first_seen_at,
    updatedAt: row.updated_at,
    notifiedAt: row.notified_at,
  };
}

const SALE_COLUMNS = `s.id, s.group_id, s.created_at, s.amount, s.currency_type, s.is_pending, s.item_id, s.item_name,
  s.item_type, s.place_id, s.place_name, s.buyer_id, s.buyer_name, s.first_seen_at, s.updated_at, s.notified_at`;

function createRepository(db) {
  const upsertStatement = `
    INSERT INTO sales (id, group_id, created_at, amount, currency_type, is_pending, item_id, item_name, item_type,
                       place_id, place_name, buyer_id, buyer_name, raw_json, first_seen_at, updated_at, notified_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      is_pending = excluded.is_pending,
      updated_at = CASE WHEN sales.is_pending <> excluded.is_pending THEN excluded.updated_at ELSE sales.updated_at END`;

  const repo = {
    db,

    /**
     * Ingestão idempotente. Retorna { inserted: [ids], released: [ids], unchanged }.
     * `markNotified` (backfill) grava notified_at já no insert para não gerar avisos.
     */
    upsertSales(sales, { markNotified = false, now = new Date() } = {}) {
      const nowIso = toIso(now);
      const unique = new Map();
      for (const sale of sales) unique.set(sale.id, sale);
      const result = { inserted: [], released: [], becamePending: [], unchanged: 0 };
      if (!unique.size) return result;
      db.transaction(() => {
        const statement = db.prepare(upsertStatement);
        const existing = db.prepare("SELECT is_pending FROM sales WHERE id = ?");
        for (const sale of unique.values()) {
          // Leitura prévia só para classificar o resultado (nova / liberada / igual);
          // a escrita em si é um único upsert idempotente.
          const before = existing.get(sale.id);
          const pendingNow = sale.isPending ? 1 : 0;
          statement.run(
            sale.id,
            String(sale.groupId),
            toIso(sale.createdAt),
            Math.trunc(Number(sale.amount) || 0),
            sale.currencyType ?? null,
            pendingNow,
            sale.itemId ?? null,
            sale.itemName ?? null,
            sale.itemType ?? null,
            sale.placeId ?? null,
            sale.placeName ?? null,
            sale.buyerId ?? null,
            sale.buyerName ?? null,
            sale.rawJson ?? JSON.stringify(sale.raw ?? null),
            nowIso,
            nowIso,
            markNotified ? nowIso : null,
          );
          if (!before) result.inserted.push(sale.id);
          else if (Number(before.is_pending) !== pendingNow) (pendingNow ? result.becamePending : result.released).push(sale.id);
          else result.unchanged += 1;
        }
      });
      return result;
    },

    oldestPendingCreatedAt(groupId) {
      const row = db.prepare("SELECT MIN(created_at) AS v FROM sales WHERE group_id = ? AND is_pending = 1").get(String(groupId));
      return row?.v ? new Date(row.v) : null;
    },

    /** Primeira e última venda do grupo vindas da API (exclui as importadas de CSV). */
    apiSalesRange(groupId) {
      const row = db.prepare("SELECT MIN(created_at) AS oldest, MAX(created_at) AS newest FROM sales WHERE group_id = ? AND id NOT LIKE ?").get(String(groupId), `${groupId}:csv:%`);
      return { oldest: row?.oldest || null, newest: row?.newest || null };
    },

    /** Venda já existente equivalente a uma linha do CSV (mesmo comprador, item e valor; horário mais próximo). */
    findMatchingSale({ groupId, buyerId, itemId, amount, from, to, around, exclude = new Set() }) {
      const rows = db.prepare(`SELECT id, created_at FROM sales
        WHERE group_id = ? AND buyer_id IS ? AND item_id IS ? AND amount = ? AND created_at >= ? AND created_at <= ? AND id NOT LIKE ?`)
        .all(String(groupId), buyerId ?? null, itemId ?? null, Math.trunc(amount), from, to, `${groupId}:csv:%`);
      const target = Date.parse(around);
      let best = null;
      for (const row of rows) {
        if (exclude.has(row.id)) continue;
        const distance = Math.abs(Date.parse(row.created_at) - target);
        if (!best || distance < best.distance) best = { id: row.id, distance };
      }
      return best ? best.id : null;
    },

    oldestSaleCreatedAt(groupId) {
      const row = db.prepare("SELECT MIN(created_at) AS v FROM sales WHERE group_id = ?").get(String(groupId));
      return row?.v ? new Date(row.v) : null;
    },

    countSales(filter) {
      const { where, params } = buildWhere(filter);
      return Number(db.prepare(`SELECT COUNT(*) AS c FROM sales s ${where}`).get(...params).c);
    },

    listSales(filter, { limit = 10, offset = 0, order = "DESC" } = {}) {
      const { where, params } = buildWhere(filter);
      const direction = order === "ASC" ? "ASC" : "DESC";
      return db.prepare(`SELECT ${SALE_COLUMNS} FROM sales s ${where}
        ORDER BY s.created_at ${direction}, s.id ${direction} LIMIT ? OFFSET ?`)
        .all(...params, limit, offset)
        .map(rowToSale);
    },

    /** Linhas leves para séries temporais (gráfico, agrupamento por dia local). */
    salesTimeline(filter) {
      const { where, params } = buildWhere(filter);
      return db.prepare(`SELECT s.created_at, s.amount FROM sales s ${where} ORDER BY s.created_at ASC`)
        .all(...params)
        .map(row => ({ createdAt: row.created_at, amount: Number(row.amount) }));
    },

    totals(filter) {
      const { where, params } = buildWhere(filter);
      const row = db.prepare(`SELECT
          COUNT(*) AS count,
          COALESCE(SUM(s.amount), 0) AS net,
          COALESCE(SUM(CASE WHEN s.is_pending = 1 THEN s.amount ELSE 0 END), 0) AS pending_net,
          COALESCE(SUM(CASE WHEN s.is_pending = 1 THEN 1 ELSE 0 END), 0) AS pending_count,
          MIN(s.created_at) AS first_at,
          MAX(s.created_at) AS last_at
        FROM sales s ${where}`).get(...params);
      const count = Number(row.count);
      const net = Number(row.net);
      const pendingNet = Number(row.pending_net);
      const pendingCount = Number(row.pending_count);
      return {
        count,
        net,
        pendingNet,
        pendingCount,
        releasedNet: net - pendingNet,
        releasedCount: count - pendingCount,
        firstAt: row.first_at,
        lastAt: row.last_at,
      };
    },

    topItems(filter, limit = 5) {
      const { where, params } = buildWhere(filter);
      return db.prepare(`SELECT s.item_id, MAX(s.item_name) AS item_name, MAX(s.item_type) AS item_type, COUNT(*) AS count, SUM(s.amount) AS net
        FROM sales s ${where} GROUP BY s.item_id ORDER BY net DESC, count DESC LIMIT ?`)
        .all(...params, limit)
        .map(row => ({ itemId: row.item_id, itemName: row.item_name, itemType: row.item_type, count: Number(row.count), net: Number(row.net) }));
    },

    topBuyers(filter, limit = 5) {
      const { where, params } = buildWhere(filter);
      return db.prepare(`SELECT s.buyer_id, MAX(s.buyer_name) AS buyer_name, COUNT(*) AS count, SUM(s.amount) AS net
        FROM sales s ${where} GROUP BY s.buyer_id ORDER BY net DESC, count DESC LIMIT ?`)
        .all(...params, limit)
        .map(row => ({ buyerId: row.buyer_id, buyerName: row.buyer_name, count: Number(row.count), net: Number(row.net) }));
    },

    totalsByGroup(filter) {
      const { where, params } = buildWhere(filter);
      return db.prepare(`SELECT s.group_id, COUNT(*) AS count, SUM(s.amount) AS net
        FROM sales s ${where} GROUP BY s.group_id ORDER BY net DESC`)
        .all(...params)
        .map(row => ({ groupId: row.group_id, count: Number(row.count), net: Number(row.net) }));
    },

    /** Bruto estimado: soma do preço cadastrado para as vendas cujo item tem preço. */
    grossEstimate(filter) {
      const { where, params } = buildWhere(filter);
      const row = db.prepare(`SELECT COUNT(*) AS covered, COALESCE(SUM(p.gross_price), 0) AS gross, COALESCE(SUM(s.amount), 0) AS net
        FROM sales s JOIN item_prices p ON p.item_id = s.item_id ${where}`).get(...params);
      return { coveredCount: Number(row.covered), gross: Number(row.gross), coveredNet: Number(row.net) };
    },

    itemSuggestions(query = "", limit = 25, groupId = null) {
      const params = [];
      const clauses = ["s.item_id IS NOT NULL"];
      if (query) {
        clauses.push("(s.item_name LIKE ? ESCAPE '\\' OR s.item_id = ?)");
        params.push(`%${escapeLike(query)}%`, String(query).trim());
      }
      if (groupId) {
        clauses.push("s.group_id = ?");
        params.push(String(groupId));
      }
      return db.prepare(`SELECT s.item_id, MAX(s.item_name) AS item_name, COUNT(*) AS count
        FROM sales s WHERE ${clauses.join(" AND ")} GROUP BY s.item_id ORDER BY count DESC LIMIT ?`)
        .all(...params, limit)
        .map(row => ({ itemId: row.item_id, itemName: row.item_name, count: Number(row.count) }));
    },

    findItems(query, limit = 5) {
      return repo.itemSuggestions(query, limit);
    },

    itemInfo(itemId) {
      const row = db.prepare(`SELECT s.item_id, MAX(s.item_name) AS item_name, MAX(s.item_type) AS item_type,
          GROUP_CONCAT(DISTINCT s.group_id) AS groups
        FROM sales s WHERE s.item_id = ? GROUP BY s.item_id`).get(String(itemId));
      if (!row) return null;
      return {
        itemId: row.item_id,
        itemName: row.item_name,
        itemType: row.item_type,
        groupIds: String(row.groups || "").split(",").filter(Boolean),
      };
    },

    unnotifiedSales(limit = 500) {
      return db.prepare(`SELECT ${SALE_COLUMNS} FROM sales s WHERE s.notified_at IS NULL
        ORDER BY s.created_at ASC, s.id ASC LIMIT ?`).all(limit).map(rowToSale);
    },

    countUnnotified() {
      return Number(db.prepare("SELECT COUNT(*) AS c FROM sales WHERE notified_at IS NULL").get().c);
    },

    markNotified(ids, at = new Date()) {
      if (!ids.length) return 0;
      const iso = toIso(at);
      let changes = 0;
      db.transaction(() => {
        const statement = db.prepare("UPDATE sales SET notified_at = ? WHERE id = ? AND notified_at IS NULL");
        for (const id of ids) changes += statement.run(iso, id).changes;
      });
      return changes;
    },

    // ---------- sync_state ----------
    getSyncState(groupId) {
      const row = db.prepare("SELECT * FROM sync_state WHERE group_id = ?").get(String(groupId));
      return row || {
        group_id: String(groupId),
        last_success_at: null,
        last_attempt_at: null,
        last_error_at: null,
        last_error: null,
        consecutive_failures: 0,
        backfill_done: 0,
        backfill_cursor: null,
        backfill_pages: 0,
        backfill_started_at: null,
        backfill_completed_at: null,
        last_new_sales: 0,
        last_pages: 0,
      };
    },

    updateSyncState(groupId, patch) {
      const current = repo.getSyncState(groupId);
      const next = { ...current, ...patch, group_id: String(groupId) };
      db.prepare(`INSERT INTO sync_state (group_id, last_success_at, last_attempt_at, last_error_at, last_error,
          consecutive_failures, backfill_done, backfill_cursor, backfill_pages, backfill_started_at,
          backfill_completed_at, last_new_sales, last_pages)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(group_id) DO UPDATE SET
          last_success_at = excluded.last_success_at, last_attempt_at = excluded.last_attempt_at,
          last_error_at = excluded.last_error_at, last_error = excluded.last_error,
          consecutive_failures = excluded.consecutive_failures, backfill_done = excluded.backfill_done,
          backfill_cursor = excluded.backfill_cursor, backfill_pages = excluded.backfill_pages,
          backfill_started_at = excluded.backfill_started_at, backfill_completed_at = excluded.backfill_completed_at,
          last_new_sales = excluded.last_new_sales, last_pages = excluded.last_pages`)
        .run(next.group_id, next.last_success_at, next.last_attempt_at, next.last_error_at, next.last_error,
          Number(next.consecutive_failures) || 0, next.backfill_done ? 1 : 0, next.backfill_cursor,
          Number(next.backfill_pages) || 0, next.backfill_started_at, next.backfill_completed_at,
          Number(next.last_new_sales) || 0, Number(next.last_pages) || 0);
      return next;
    },

    recordSyncError(groupId, kind, message, at = new Date()) {
      db.prepare("INSERT INTO sync_errors (group_id, occurred_at, kind, message) VALUES (?, ?, ?, ?)")
        .run(groupId ? String(groupId) : null, toIso(at), kind, String(message).slice(0, 500));
      db.prepare("DELETE FROM sync_errors WHERE id NOT IN (SELECT id FROM sync_errors ORDER BY id DESC LIMIT 100)").run();
    },

    recentErrors(limit = 5) {
      return db.prepare("SELECT group_id, occurred_at, kind, message FROM sync_errors ORDER BY id DESC LIMIT ?").all(limit);
    },

    // ---------- saldo ----------
    insertFundsSnapshot({ groupId, robux, pendingRobux, raw, takenAt = new Date() }) {
      db.prepare("INSERT INTO funds_snapshots (group_id, taken_at, robux, pending_robux, raw_json) VALUES (?, ?, ?, ?, ?)")
        .run(String(groupId), toIso(takenAt), robux ?? null, pendingRobux ?? null, raw ? JSON.stringify(raw) : null);
    },

    latestFunds(groupId) {
      const row = db.prepare(`SELECT group_id, taken_at, robux, pending_robux FROM funds_snapshots
        WHERE group_id = ? ORDER BY taken_at DESC LIMIT 1`).get(String(groupId));
      if (!row) return null;
      return {
        groupId: row.group_id,
        takenAt: row.taken_at,
        robux: row.robux === null ? null : Number(row.robux),
        pendingRobux: row.pending_robux === null ? null : Number(row.pending_robux),
      };
    },

    // ---------- preços ----------
    replaceItemPrices(prices, at = new Date()) {
      db.transaction(() => {
        db.prepare("DELETE FROM item_prices").run();
        const statement = db.prepare("INSERT INTO item_prices (item_id, gross_price, name, updated_at) VALUES (?, ?, ?, ?)");
        for (const price of prices) statement.run(String(price.itemId), Math.round(price.price), price.name ?? null, toIso(at));
      });
    },

    // ---------- app_state (chave/valor) ----------
    getState(key) {
      const row = db.prepare("SELECT value FROM app_state WHERE key = ?").get(key);
      if (!row || row.value === null) return null;
      try {
        return JSON.parse(row.value);
      } catch {
        return row.value;
      }
    },

    setState(key, value, at = new Date()) {
      db.prepare(`INSERT INTO app_state (key, value, updated_at) VALUES (?, ?, ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`)
        .run(key, JSON.stringify(value ?? null), toIso(at));
    },

    totalSalesCount() {
      return Number(db.prepare("SELECT COUNT(*) AS c FROM sales").get().c);
    },
  };

  return repo;
}

module.exports = { createRepository, buildWhere, rowToSale };
