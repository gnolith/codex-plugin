# Gnolith Setup legacy migration compatibility

This repository is sunset. Alembic is the continuing Gnolith control-plane
owner; Workshop remains the only Gnolith data-plane MCP.

The unpublished `0.3.0` candidate is a library-only, read-only compatibility
artifact for adopting exact `@gnolith/codex-plugin` `0.2.0` state. It can inspect
the historical marked TOML block and operation receipts and produce a
deterministic, secret-free `gnolith-setup-to-alembic-v1` handoff. It has no CLI,
MCP server, stdio transport, hooks, setup tools, config writer, installation
adapter, network probe, deployment behavior, or data-plane behavior.

```ts
import {
  inspectAndExportLegacySetup,
  validateLegacyHandoffBundle,
} from '@gnolith/codex-plugin';

const result = await inspectAndExportLegacySetup('/canonical/project/root');
if (result.bundle) validateLegacyHandoffBundle(result.bundle);
```

The library reads only:

- `<project>/.codex/config.toml`;
- `<project>/.codex/gnolith/setup/operations/*.json`.

It never changes or removes those files or any installation, volume, backup,
secret, or remote resource. See [MIGRATION.md](MIGRATION.md) for the exact
compatibility contract.

## Candidate gates

```sh
npm ci --ignore-scripts
npm run check
npm pack --ignore-scripts
```

No tag, publication, package deprecation, or repository archival is authorized
by this candidate.
