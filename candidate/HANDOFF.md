# Gnolith Setup sunset candidate handoff

## Candidate identity

- candidate version: `0.3.0`
- governed package source commit: `8f2786484732c2c8733c8ce8b05b187ffabc8ca5`
- public repository: `https://github.com/gnolith/codex-plugin`
- artifact: `gnolith-codex-plugin-0.3.0.tgz`
- artifact SHA-256:
  `25ec8458130527bbf71662e0dc2c9bea79c0311d6419370b7cfa246fd25ba89c`
- npm SHA-1: `8bff79e512090f105beb3523b72b9e38f896ffe0`
- publication/tag/deprecation: not performed
- archival: not authorized

The final evidence commit adds only `candidate/`, which is excluded from the
package allowlist. Repacking its source therefore yields the same migration
payload.

## Removed active surfaces

Removed: `.mcp.json`, plugin metadata, local marketplace copy, hooks, active
Gnolith skill, Setup MCP server, stdio transport, `gnolith_setup_*` tools,
plan/apply/resume/diagnose/config writers, process/Docker adapters, Sites claims,
secret creation, session context, and `dist/mcp-server.mjs`.

Removed production/dev graph: `@modelcontextprotocol/sdk`, `zod`, and `esbuild`.
The sole production dependency is `smol-toml@1.7.0`.

## Retained compatibility surface

The library exports read-only inspection, fail-closed inspection/export,
deterministic handoff export, canonical encoding, and exact bundle validation.
The packed fixture corpus includes managed, user-owned, reversed-marker,
receipt-v1, exact summary, and digest-vector cases with no real credentials.

Exact legacy constants:

- package/version: `@gnolith/codex-plugin@0.2.0`
- marker begin: `# BEGIN ALEMBIC MANAGED GNOLITH MCP`
- marker end: `# END ALEMBIC MANAGED GNOLITH MCP`
- receipt: `gnolith-setup-operation-v1`
- handoff: `gnolith-setup-to-alembic-v1`, schema `1`

## Self-green evidence

- TypeScript typecheck and clean declaration/JavaScript build: PASS
- full Vitest suite: 13/13 PASS
- focused security/read-only suite: 7/7 PASS
- byte-and-metadata no-write proof: PASS
- hostile TOML/markers/receipts/path/secret/endpoint/digest gates: PASS
- repository secret scan: PASS
- static active-surface/dependency scan: PASS
- packed allowlist graph: 18/18 allowed files
- packed import/install smoke: PASS
- production audit: 0 vulnerabilities
- CycloneDX 1.5 SBOM: generated
- provenance publish dry-run: PASS; no publication occurred
- hosted Ubuntu/macOS/Windows clean gates on protected `main`: PASS
- hosted CodeQL, dependency review, secret-canary, and provenance gates: PASS
- secret scanning, push protection, Dependabot security updates: ENABLED
- zero-approval/no-bypass protected `main` ruleset: ACTIVE

Exact logs, inventory, audit, production tree, SBOM, live governance snapshot,
and checksums are adjacent to this file.

## Acceptance ledger

GNO-AR-001 through GNO-AR-012, GNO-AR-014, and repository-local portions of
GNO-AR-015 are self-green. GNO-AR-013 and the cross-repository portion of
GNO-AR-015 remain intentionally gated on independent checksum-bound full-stack
testing and Alembic adoption.

## Alembic compatibility mismatches and external gates

No mismatch was observed against the exact local fixture contract. Deliberate
compatibility results are:

- process, Docker-command, and Codex Sites connections require a new Alembic
  plan and are never converted;
- user-owned and malformed/ambiguous marker state is reported and never claimed;
- any package version other than `0.2.0`, receipt format other than v1, or
  handoff schema other than v1 returns no bundle.

Independent Alembic consumption was not run from this repository and remains
the authoritative mismatch-discovery gate. Candidate full-stack PASS,
publication of continuing packages, verified Alembic adoption, byte-identical
public confirmation (if published), package deprecation, and explicit archival
authorization are all pending. No project data or external resource was
modified or removed.
