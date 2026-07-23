# Migration to Alembic

Alembic is the sole continuing Gnolith control plane. This library does not
convert or activate installations. Alembic must independently recompute every
digest, verify Workshop with authentication, obtain explicit approval, and only
then write its own marked block.

## Ownership and paths

The historical project config is `<project>/.codex/config.toml`. Receipts are
`<project>/.codex/gnolith/setup/operations/<operationId>.json` with format
`gnolith-setup-operation-v1` and states `applying`, `failed`,
`activation-required`, or `complete`.

Exact marker lines:

```text
# BEGIN ALEMBIC MANAGED GNOLITH MCP
# END ALEMBIC MANAGED GNOLITH MCP
```

Exactly one ordered pair containing exactly one
`[mcp_servers.gnolith]` table is legacy-managed. A table without markers is
user-owned. Missing, reversed, duplicate, or ambiguous markers are invalid.
User-owned and invalid states are reported but never claimed or mutated.

## Digests and canonical encoding

`configDigest` is lowercase SHA-256 over exact config bytes.
`legacyMarkerDigest` is lowercase SHA-256 over the complete inclusive marker
block after CRLF and CR are normalized to LF and exactly one terminal LF is
present.

Bundle JSON is UTF-8, has recursively lexicographically sorted object keys,
preserves array order, has no insignificant whitespace, and normalizes every
string and key to NFC. `sha256` is lowercase SHA-256 over those canonical bytes
with the `sha256` member omitted.

The schema has no extension keys. Bundles are at most 1 MiB, contain at most
1,000 receipts sorted by `operationId`, bound identifiers to 256 Unicode scalar
values, require canonical UTC instants, and carry canonical absolute NFC project
root text.

## Redaction

Receipt summaries contain only the schema fields. Plans, observations, errors,
commands, arguments, environment values, credential values, deployment
receipts, and arbitrary extensions are not copied. Only bearer environment
variable names may be retained. Endpoint userinfo, query, and fragment are
removed and reported as security findings.

Process, Docker-command, and Codex Sites modes require a fresh Alembic plan.
They must not be silently mapped to Docker-local or Workshop HTTP.

Original config, receipts, installations, volumes, backups, secrets, and remote
resources remain untouched through inspection, adoption preparation, uninstall,
and repository sunset.
