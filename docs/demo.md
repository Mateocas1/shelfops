# Run the ShelfOps portfolio demo

`pnpm demo` runs a complete incident-to-classification scenario against the real Fastify API and an isolated PostgreSQL container. It finishes in under five minutes on a machine with the PostgreSQL image available.

## Quick path

1. Confirm Node.js >=22.19, pnpm 11.11, and a running Docker daemon.
2. Run `pnpm demo` from the repository root.
3. Look for the final `[success]` and `[cleanup]` lines.

The command applies every current migration, inserts a minimal simulated reviewer fixture, starts the production-composed PostgreSQL adapters, and drives the API over loopback HTTP. The fixture is ephemeral demonstration data, not a production seed.

## Scenario

The labeled output shows:

- Session resolution for the simulated reviewer.
- Incident creation, list, and detail reads.
- Deterministic triage evaluation with one eligible assignee.
- The awaiting-decision projection and its explanation.
- Human confirmation of category, severity, and assignee suggestions.
- Final classified incident state, version, decision history, and correlations.

The expected transition is `open@v1 -> evaluated@v2 -> classified@v3`.

## Cleanup and failures

The script closes the API listener and PostgreSQL pool, stops the isolated container, and removes temporary resources whether the scenario succeeds or fails. A failure reports the failed HTTP operation or prerequisite and exits nonzero.
