# Legacy migration threat model

Untrusted inputs are the project-root path, config bytes, TOML content,
operation-directory entries, JSON receipt bytes, endpoint text, identifiers,
timestamps, and source-version declaration.

Controls:

- canonical absolute NFC primary-worktree roots only;
- no symlink/junction config, receipt directory, or receipt file;
- fixed receipt path and `.json` enumeration; no caller-provided receipt path;
- exact marker cardinality/order/ownership and fail-closed TOML parsing;
- exact source/version/receipt/schema gates;
- strict receipt top-level and handoff schemas;
- 1 MiB bundle/receipt and 1,000-receipt limits;
- 256-Unicode-scalar identifier bounds and canonical UTC timestamps;
- endpoint credential/query/fragment redaction;
- summary allowlist that excludes plans, observations, errors, commands, args,
  environment values, and credential values;
- canonical NFC/sorted-key JSON plus lowercase SHA-256 validation;
- read-only filesystem calls and no subprocess/network/MCP imports.

Residual boundary: a SHA-256 config digest is intentionally derived from exact
legacy bytes so Alembic can detect replacement. It is not reversible secret
material. Alembic must independently recompute config and marker digests before
adoption and must not write until authenticated Workshop verification and
explicit approval.
