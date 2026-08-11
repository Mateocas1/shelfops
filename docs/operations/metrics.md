# Scrape production API metrics

ShelfOps exposes dependency-free Prometheus text metrics at `GET /metrics`. The endpoint is outside the public OpenAPI contract, remains available while PostgreSQL is down, and never changes business state.

## Quick scrape

Set a dedicated secret containing at least 32 UTF-8 bytes:

```sh
export METRICS_BEARER_TOKEN='replace-with-secret-material-at-least-32-bytes'
curl --fail --header "Authorization: Bearer $METRICS_BEARER_TOKEN" http://127.0.0.1:3000/metrics
```

Missing or invalid credentials return a stable `401 Unauthorized`. If internal metric rendering fails, the endpoint returns a detail-free `503 Metrics unavailable`.

## Credential handling

- Store `METRICS_BEARER_TOKEN` in the runtime secret manager, separate from user sessions and `CURSOR_SECRET`.
- Grant it only to the metrics collector. Never place it in URLs, source control, command history, dashboards, or logs.
- Rotate it by updating the secret and rolling API instances, then update collectors. Requests using the previous token fail immediately after each instance restarts.
- Production startup rejects missing or shorter credentials. Local production smoke must use a synthetic value that is clearly non-production and at least 32 bytes.

## Metric catalog

| Metric | Type | Labels | Meaning |
| --- | --- | --- | --- |
| `shelfops_http_requests_total` | counter | `method`, `route`, `status_class` | Completed API requests, excluding `/metrics`. |
| `shelfops_http_request_duration_seconds` | histogram | `method`, `route`, `le` | Request duration with fixed buckets from 5 ms through 5 s. |
| `shelfops_http_errors_total` | counter | `method`, `route`, `status_class` | Completed `5xx` responses. |
| `shelfops_readiness` | gauge | none | `1` when the dependency probe succeeds and draining has not begun. |
| `shelfops_draining` | gauge | none | `1` after graceful shutdown begins. |
| `shelfops_postgresql_pool_total` | gauge | none | Owned pool clients. |
| `shelfops_postgresql_pool_idle` | gauge | none | Idle owned pool clients. |
| `shelfops_postgresql_pool_waiting` | gauge | none | Requests waiting for an owned pool client. |
| `process_uptime_seconds` | gauge | none | Process uptime. |
| `process_resident_memory_bytes` | gauge | none | Resident memory size. |
| `shelfops_build_info` | gauge | `environment`, `release` | Runtime build identity. |

Externally composed production adapters must inject a bounded pool diagnostics function. A scrape performs the same read-only PostgreSQL readiness probe as `/ready`; probe errors are reduced to `shelfops_readiness 0` and are never rendered.

## Cardinality rules

Methods and status classes use fixed finite sets. Routes use Fastify's registered template; unmatched or unsafe templates collapse to `__unmatched__`. Never add raw paths, queries, IDs, error text, SQL, stores, categories, or request headers as labels. `/metrics` self-scrapes are intentionally excluded; `/ready` is counted once as an ordinary HTTP request.

## Alert starting points

Start with sustained readiness loss, draining instances that remain registered, waiting pool clients, `5xx` rate, latency histogram movement, restart-indicated uptime resets, and unexpected release/environment identities. Set thresholds from measured traffic and capacity; this catalog does not define an SLO or paging threshold.
