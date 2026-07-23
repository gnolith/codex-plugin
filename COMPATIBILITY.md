# Compatibility boundary

Only this source is accepted:

- package: `@gnolith/codex-plugin`
- version: `0.2.0`
- receipt: `gnolith-setup-operation-v1`
- marker begin: `# BEGIN ALEMBIC MANAGED GNOLITH MCP`
- marker end: `# END ALEMBIC MANAGED GNOLITH MCP`
- handoff: `gnolith-setup-to-alembic-v1`, schema version `1`

Unknown package, package version, receipt format, or handoff schema version
returns a bounded incompatibility report and no bundle.

Supported legacy reading includes process, Docker-command, remote HTTP, and
Codex Sites connection shapes. Process, Docker-command, and Sites are obsolete
legacy modes: they are reported as requiring a new Alembic plan and are never
translated. User-owned or malformed config is never claimed.

Node.js 22 and later is supported for the unpublished migration candidate.
