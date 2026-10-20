"use strict";

/**
 * Importa o relatório de vendas em CSV que a Roblox manda por e-mail
 * (Configurar grupo → Receita → Vendas → baixar relatório; arquivo "Sales_Group<ID>_<AAAA-MM>.csv").
 *
 * Colunas: Id, Buyer User Id, Date and Time, Location, Location Id, Universe Id, Universe,
 * Asset Id, Asset Name, Asset Type, Hold Status, Revenue, Price.
 *
 * O "Id" do CSV NÃO é o mesmo idHash da API e o horário difere alguns segundos, então:
 *  - vendas mais antigas que a venda mais antiga vinda da API entram como novas (a API não
 *    alcança esse período) — id "<grupo>:csv:<Id>", sem gerar aviso;
 *  - vendas no período que a API já cobre só são conferidas (mesmo comprador, item e valor,
 *    horário a até 60 s) e nunca duplicadas;
 *  - vendas mais novas que a última vinda da API ficam para a coleta normal.
 * Reimportar o mesmo arquivo é seguro (upsert por id) e atualiza Held → Released.
 */

const MATCH_WINDOW_MS = 60 * 1000;
const REQUIRED = ["Id", "Date and Time", "Revenue"];

/** Parser CSV (RFC 4180): aspas, vírgulas e quebras de linha dentro de campos. */
function parseCsv(text) {
  const input = String(text).replace(/^\uFEFF/, "");
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      row.push(field);
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  if (!rows.length) return [];
  const header = rows[0].map(name => name.trim());
  return rows.slice(1).map(values => Object.fromEntries(header.map((name, index) => [name, values[index] ?? ""])));
}

function nullable(value) {
  const text = String(value ?? "").trim();
  return !text || /^null$/i.test(text) ? null : text;
}

/** Linha do CSV → venda no formato do banco. Retorna null se faltar data ou valor. */
function saleFromRow(row, groupId) {
  const created = new Date(row["Date and Time"]);
  const amount = Number(row.Revenue);
  const csvId = nullable(row.Id);
  if (!csvId || Number.isNaN(created.getTime()) || !Number.isFinite(amount)) return null;
  const price = Number(row.Price);
  return {
    id: `${groupId}:csv:${csvId}`,
    hasStableId: true,
    groupId: String(groupId),
    createdAt: created.toISOString(),
    amount: Math.trunc(amount),
    gross: Number.isFinite(price) ? Math.trunc(price) : null,
    currencyType: "Robux",
    isPending: !/^released$/i.test(String(row["Hold Status"] || "").trim()),
    itemId: nullable(row["Asset Id"]),
    itemName: nullable(row["Asset Name"]),
    itemType: nullable(row["Asset Type"]),
    placeId: nullable(row["Location Id"]),
    placeName: nullable(row.Universe) || (nullable(row.Location) === "Website" ? "Site" : nullable(row.Location)),
    buyerId: nullable(row["Buyer User Id"]),
    buyerName: null,
    rawJson: JSON.stringify({ source: "csv", ...row }),
  };
}

/** Tenta achar o ID do grupo no nome do arquivo ("Sales_Group460864337_2026-10.csv"). */
function groupIdFromFilename(name) {
  return String(name || "").match(/Group_?(\d{3,})/i)?.[1] || null;
}

/**
 * @returns {{ rows, invalid, imported, importedNet, importedGross, matched, unmatched, newerSkipped, from, to }}
 */
function importSalesCsv(repo, { groupId, text, now = new Date() }) {
  const parsed = parseCsv(text);
  if (!parsed.length) throw new Error("O arquivo está vazio.");
  const missing = REQUIRED.filter(name => !(name in parsed[0]));
  if (missing.length) throw new Error(`Não parece o relatório de vendas da Roblox (faltam as colunas: ${missing.join(", ")}).`);

  const range = repo.apiSalesRange(groupId); // { oldest, newest } das vendas vindas da API (não do CSV)
  if (!range.newest) throw new Error("O bot ainda não tem vendas deste grupo pela Roblox. Espere a primeira sincronização e tente de novo.");
  if (!repo.getSyncState(groupId).backfill_done) {
    throw new Error("O bot ainda está importando o histórico deste grupo pela Roblox. Tente de novo quando terminar (veja no /status).");
  }
  const oldestApi = range.oldest ? Date.parse(range.oldest) : null;
  const newestApi = range.newest ? Date.parse(range.newest) : null;

  const out = { rows: parsed.length, invalid: 0, imported: 0, importedNet: 0, importedGross: 0, matched: 0, unmatched: 0, newerSkipped: 0, from: null, to: null };
  const toInsert = [];
  const usedMatches = new Set();
  for (const row of parsed) {
    const sale = saleFromRow(row, groupId);
    if (!sale) {
      out.invalid += 1;
      continue;
    }
    const at = Date.parse(sale.createdAt);
    if (!out.from || sale.createdAt < out.from) out.from = sale.createdAt;
    if (!out.to || sale.createdAt > out.to) out.to = sale.createdAt;
    if (newestApi !== null && at > newestApi) {
      out.newerSkipped += 1; // a coleta normal pega
      continue;
    }
    if (oldestApi !== null && at >= oldestApi - MATCH_WINDOW_MS) {
      const match = repo.findMatchingSale({
        groupId,
        buyerId: sale.buyerId,
        itemId: sale.itemId,
        amount: sale.amount,
        from: new Date(at - MATCH_WINDOW_MS).toISOString(),
        to: new Date(at + MATCH_WINDOW_MS).toISOString(),
        around: sale.createdAt,
        exclude: usedMatches,
      });
      if (match) {
        usedMatches.add(match);
        out.matched += 1;
      } else if (at >= oldestApi) {
        out.unmatched += 1; // período coberto pela API, mas sem par: não duplica, só informa
      } else {
        toInsert.push(sale);
      }
      continue;
    }
    toInsert.push(sale);
  }
  for (let i = 0; i < toInsert.length; i += 1000) {
    const chunk = toInsert.slice(i, i + 1000);
    const result = repo.upsertSales(chunk, { markNotified: true, now });
    const inserted = new Set(result.inserted);
    for (const sale of chunk) {
      if (!inserted.has(sale.id)) continue;
      out.imported += 1;
      out.importedNet += sale.amount;
      out.importedGross += sale.gross || 0;
    }
  }
  out.alreadyImported = toInsert.length - out.imported;
  return out;
}

module.exports = { parseCsv, saleFromRow, groupIdFromFilename, importSalesCsv, MATCH_WINDOW_MS };
