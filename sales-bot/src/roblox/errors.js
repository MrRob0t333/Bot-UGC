"use strict";

class RobloxError extends Error {
  constructor(message, { status = null, kind = "http", retryable = false, url = null } = {}) {
    super(message);
    this.name = "RobloxError";
    this.status = status;
    this.kind = kind;
    this.retryable = retryable;
    // URL sem query string (cursor pode ser longo; segredos nunca estão na URL).
    this.url = url;
  }
}

/** 401 — cookie ausente, expirado ou invalidado. */
class RobloxAuthError extends RobloxError {
  constructor(message, options = {}) {
    super(message, { ...options, kind: "auth" });
    this.name = "RobloxAuthError";
  }
}

/** 403 — cookie válido, mas sem permissão para ver as finanças do grupo. */
class RobloxPermissionError extends RobloxError {
  constructor(message, options = {}) {
    super(message, { ...options, kind: "permission" });
    this.name = "RobloxPermissionError";
  }
}

/** Resposta em formato inesperado (mudança de API). */
class RobloxParseError extends RobloxError {
  constructor(message, options = {}) {
    super(message, { ...options, kind: "parse" });
    this.name = "RobloxParseError";
  }
}

module.exports = { RobloxError, RobloxAuthError, RobloxPermissionError, RobloxParseError };
