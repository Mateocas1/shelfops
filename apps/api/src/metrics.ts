import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Readiness } from "./routes/health.js";

export interface PoolDiagnostics { total: number; idle: number; waiting: number; }
export interface MetricsOptions {
  credential: string;
  environment: string;
  release: string;
  readiness: Readiness;
  pool: () => PoolDiagnostics;
}
export interface Metrics { register(app: FastifyInstance): Promise<void>; }

const methods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
const buckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5];
const contentType = "text/plain; version=0.0.4; charset=utf-8";

export function validateMetricsCredential(value: string | undefined): string {
  const credential = value?.trim();
  if (!credential || Buffer.byteLength(credential, "utf8") < 32) throw new Error("METRICS_BEARER_TOKEN must contain at least 32 bytes of secret material");
  return credential;
}

function escapeLabel(value: string): string { return value.replaceAll("\\", "\\\\").replaceAll("\n", "\\n").replaceAll('"', '\\"'); }
function labels(values: Record<string, string>): string { return `{${Object.entries(values).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}="${escapeLabel(value)}"`).join(",")}}`; }
function digest(value: string): Buffer { return createHash("sha256").update(value, "utf8").digest(); }
function authorized(header: string | string[] | undefined, expected: Buffer): boolean {
  const value = typeof header === "string" && header.startsWith("Bearer ") ? header.slice(7) : "";
  return timingSafeEqual(digest(value), expected);
}
function routeLabel(request: FastifyRequest): string {
  const route = request.routeOptions.url;
  return typeof route === "string" && route.startsWith("/") && route.length <= 160 && route !== "/*" ? route : "__unmatched__";
}
function statusClass(status: number): string { return status >= 100 && status < 600 ? `${Math.floor(status / 100)}xx` : "other"; }

export function createMetrics(options: MetricsOptions): Metrics {
  const expected = digest(validateMetricsCredential(options.credential));
  const started = new WeakMap<FastifyRequest, bigint>();
  const observations = new Map<string, { method: string; route: string; status: string; count: number; errors: number; sum: number; buckets: number[] }>();

  function observe(request: FastifyRequest, statusCode: number): void {
    const route = routeLabel(request);
    if (route === "/metrics") return;
    const method = methods.has(request.method) ? request.method : "OTHER";
    const status = statusClass(statusCode); const key = `${method}\0${route}\0${status}`;
    const elapsed = Number(process.hrtime.bigint() - (started.get(request) ?? process.hrtime.bigint())) / 1e9;
    const entry = observations.get(key) ?? { method, route, status, count: 0, errors: 0, sum: 0, buckets: buckets.map(() => 0) };
    entry.count++; entry.sum += elapsed; if (status === "5xx") entry.errors++;
    buckets.forEach((bucket, index) => { if (elapsed <= bucket) entry.buckets[index] = (entry.buckets[index] ?? 0) + 1; });
    observations.set(key, entry);
  }

  async function render(): Promise<string> {
    const draining = options.readiness.isDraining(); let ready = false;
    if (!draining) try { await options.readiness.probe(); ready = true; } catch {}
    const pool = options.pool(); const lines: string[] = [];
    const family = (name: string, type: "counter" | "gauge" | "histogram", samples: string[]) => lines.push(`# TYPE ${name} ${type}`, ...samples);
    const entries = [...observations.values()].sort((a, b) => `${a.method}\0${a.route}\0${a.status}`.localeCompare(`${b.method}\0${b.route}\0${b.status}`));
    family("shelfops_http_requests_total", "counter", entries.map((entry) => `shelfops_http_requests_total${labels({ method: entry.method, route: entry.route, status_class: entry.status })} ${entry.count}`));
    family("shelfops_http_errors_total", "counter", entries.filter((entry) => entry.errors).map((entry) => `shelfops_http_errors_total${labels({ method: entry.method, route: entry.route, status_class: entry.status })} ${entry.errors}`));
    const histogram: string[] = [];
    for (const entry of entries) {
      buckets.forEach((bucket, index) => { histogram.push(`shelfops_http_request_duration_seconds_bucket${labels({ method: entry.method, route: entry.route, le: String(bucket) })} ${entry.buckets[index]}`); });
      histogram.push(`shelfops_http_request_duration_seconds_bucket${labels({ method: entry.method, route: entry.route, le: "+Inf" })} ${entry.count}`);
      histogram.push(`shelfops_http_request_duration_seconds_sum${labels({ method: entry.method, route: entry.route })} ${entry.sum}`);
      histogram.push(`shelfops_http_request_duration_seconds_count${labels({ method: entry.method, route: entry.route })} ${entry.count}`);
    }
    family("shelfops_http_request_duration_seconds", "histogram", histogram);
    family("shelfops_readiness", "gauge", [`shelfops_readiness ${ready ? 1 : 0}`]);
    family("shelfops_draining", "gauge", [`shelfops_draining ${draining ? 1 : 0}`]);
    family("shelfops_postgresql_pool_total", "gauge", [`shelfops_postgresql_pool_total ${pool.total}`]);
    family("shelfops_postgresql_pool_idle", "gauge", [`shelfops_postgresql_pool_idle ${pool.idle}`]);
    family("shelfops_postgresql_pool_waiting", "gauge", [`shelfops_postgresql_pool_waiting ${pool.waiting}`]);
    family("process_uptime_seconds", "gauge", [`process_uptime_seconds ${Math.floor(process.uptime())}`]);
    family("process_resident_memory_bytes", "gauge", [`process_resident_memory_bytes ${process.memoryUsage().rss}`]);
    family("shelfops_build_info", "gauge", [`shelfops_build_info${labels({ environment: options.environment, release: options.release })} 1`]);
    return `${lines.join("\n")}\n`;
  }

  return { register: async (app) => {
    app.addHook("onRequest", async (request) => { started.set(request, process.hrtime.bigint()); });
    app.addHook("onResponse", async (request, reply) => { observe(request, reply.statusCode); });
    app.get("/metrics", { schema: { hide: true } }, async (request, reply) => {
      if (!authorized(request.headers.authorization, expected)) return reply.type("text/plain").code(401).send("Unauthorized\n");
      try { return reply.header("content-type", contentType).send(await render()); }
      catch { return reply.type("text/plain").code(503).send("Metrics unavailable\n"); }
    });
  } };
}
