"use strict";

/**
 * Definição dos slash commands em JSON da API (registrados por servidor = GUILD_ID,
 * para atualizar na hora). Sem dependência do discord.js aqui.
 */

const { PERIOD_CHOICES } = require("../reports/periods");

const STRING = 3;
const BOOLEAN = 5;
const NUMBER = 10;

function periodOption({ required = false, description = "Período" } = {}) {
  return { type: STRING, name: "periodo", description, required, choices: PERIOD_CHOICES };
}

const dateOptions = [
  { type: STRING, name: "inicio", description: "Início (dd/mm/aaaa) — para período personalizado", required: false, min_length: 8, max_length: 10 },
  { type: STRING, name: "fim", description: "Fim (dd/mm/aaaa, inclusivo) — para período personalizado", required: false, min_length: 8, max_length: 10 },
];

const groupOption = { type: STRING, name: "grupo", description: "Filtrar por grupo", required: false, autocomplete: true };
const publicOption = { type: BOOLEAN, name: "publico", description: "Mostrar a resposta para todos no canal", required: false };

const COMMANDS = [
  {
    name: "resumo",
    description: "Resumo de vendas de um período (total, comparação, tops, divisão)",
    options: [periodOption({ required: true }), groupOption, ...dateOptions, publicOption],
  },
  {
    name: "vendas",
    description: "Lista todas as vendas filtradas, 10 por página",
    options: [
      periodOption({ description: "Período (padrão: últimos 30 dias)" }),
      groupOption,
      { type: STRING, name: "item", description: "Filtrar por item", required: false, autocomplete: true },
      { type: STRING, name: "comprador", description: "Nome ou ID do comprador", required: false, max_length: 50 },
      ...dateOptions,
      publicOption,
    ],
  },
  {
    name: "exportar",
    description: "Exporta as vendas em CSV (abre certo no Excel em português)",
    options: [periodOption({ description: "Período (padrão: mês atual)" }), groupOption, ...dateOptions, publicOption],
  },
  {
    name: "grafico",
    description: "Gráfico de barras das vendas por dia (cor, tema e textos personalizáveis)",
    options: [
      periodOption({ description: "Período (padrão: últimos 30 dias)" }),
      groupOption,
      ...dateOptions,
      { type: STRING, name: "cor", description: "Cor das barras: azul, verde, roxo, rosa, vermelho, laranja, amarelo, ciano, preto, cinza ou #hex", required: false, max_length: 20 },
      { type: STRING, name: "tema", description: "Fundo do gráfico", required: false, choices: [{ name: "Claro", value: "claro" }, { name: "Escuro", value: "escuro" }] },
      { type: STRING, name: "titulo", description: "Título personalizado", required: false, max_length: 80 },
      { type: STRING, name: "subtitulo", description: "Subtítulo personalizado", required: false, max_length: 120 },
      { type: STRING, name: "rodape", description: "Rodapé personalizado", required: false, max_length: 120 },
      { type: BOOLEAN, name: "media", description: "Mostrar a linha de média (padrão: sim)", required: false },
      { type: NUMBER, name: "multiplicador", description: "Multiplica os valores do gráfico (ex.: 2, 10, 2.5); aparece um ×N ao lado do título", required: false, min_value: 0.1, max_value: 1000 },
      publicOption,
    ],
  },
  {
    name: "saldo",
    description: "Robux atuais de cada grupo + pendentes",
    options: [publicOption],
  },
  {
    name: "item",
    description: "Desempenho de um item ao longo do tempo",
    options: [
      { type: STRING, name: "nome", description: "Item (comece a digitar)", required: true, autocomplete: true },
      publicOption,
    ],
  },
  {
    name: "status",
    description: "Saúde do bot: sincronização, cookie, backfill, erros",
    options: [publicOption],
  },
  {
    name: "sincronizar",
    description: "Força uma sincronização com a Roblox agora",
    options: [],
  },
].map(command => ({ ...command, type: 1, dm_permission: false, contexts: [0] }));

module.exports = { COMMANDS };
