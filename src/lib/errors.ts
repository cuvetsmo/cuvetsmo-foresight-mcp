/**
 * Tagged error types so handlers can throw something semantic and the MCP
 * dispatcher can map to a structured error response with code + source.
 */

export class FSError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly source: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "FSError";
  }
}

export class NotFoundError extends FSError {
  constructor(source: string, resource: string) {
    super(`${resource} not found in ${source}`, "NOT_FOUND", source);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends FSError {
  constructor(detail: string) {
    super(`Validation failed — ${detail}`, "VALIDATION", "input");
    this.name = "ValidationError";
  }
}

export class ConfigError extends FSError {
  constructor(detail: string) {
    super(`Configuration error — ${detail}`, "CONFIG", "config");
    this.name = "ConfigError";
  }
}

export class ResolverError extends FSError {
  constructor(detail: string) {
    super(`Resolver error — ${detail}`, "RESOLVER", "resolver");
    this.name = "ResolverError";
  }
}

/**
 * An external/upstream dependency (the Foresight API, or a third-party
 * venue API it proxies) failed or was unreachable. Distinct from
 * ValidationError (bad input) and ConfigError (bad local setup) — this
 * is "the network/remote let us down." Reused by every tool that calls
 * a live endpoint (cross-venue, future WAHIS/BoT/ArXiv source tools).
 */
export class UpstreamError extends FSError {
  constructor(detail: string) {
    super(`Upstream error — ${detail}`, "UPSTREAM", "upstream");
    this.name = "UpstreamError";
  }
}
