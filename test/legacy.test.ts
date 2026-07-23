import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canonicalJsonBytes,
  exportLegacyHandoff,
  inspectAndExportLegacySetup,
  inspectLegacySetup,
  MANAGED_BEGIN,
  MANAGED_END,
  validateLegacyHandoffBundle,
} from '../src/index.js';
import { managedBlock, project, writeConfig, writeReceipt } from './helpers.js';

describe('exact legacy inspection and handoff', () => {
  it('exports a deterministic digest-bound remote handoff and exact receipt summary', async () => {
    const root = await project();
    const config = managedBlock([
      '# Managed by Gnolith Setup.',
      '# connection_kind = remote-http',
      'url = "https://example.test/mcp"',
      'bearer_token_env_var = "GNOLITH_TOKEN"',
      'required = false',
      'startup_timeout_sec = 20',
      'tool_timeout_sec = 60',
      'default_tools_approval_mode = "writes"',
    ]).replace(/\n/gu, '\r\n');
    await writeConfig(root, config);
    await writeReceipt(root);

    const first = await exportLegacyHandoff(root);
    const second = await exportLegacyHandoff(root);
    expect(canonicalJsonBytes(first)).toEqual(canonicalJsonBytes(second));
    expect(first.configDigest).toBe(createHash('sha256').update(await readFile(join(root, '.codex', 'config.toml'))).digest('hex'));
    const normalizedBlock = config.replace(/\r\n/gu, '\n');
    expect(first.legacyMarkerDigest).toBe(createHash('sha256').update(normalizedBlock).digest('hex'));
    expect(first.connection).toEqual({
      mode: 'remote-http',
      endpoint: 'https://example.test/mcp',
      authentication: { kind: 'bearer-environment', variable: 'GNOLITH_TOKEN' },
    });
    expect(first.receipts).toEqual([{
      format: 'gnolith-setup-operation-v1',
      operationId: 'operation-1',
      planId: 'plan-1',
      state: 'activation-required',
      method: 'remote-http',
      action: 'connect',
      startedAt: '2026-07-22T12:34:56.000Z',
      updatedAt: '2026-07-22T12:35:56.000Z',
      completedSteps: ['probe-remote', 'write-codex-config', 'write-acceptance-receipt'],
      expectedInstallationId: 'installation-1',
      expectedBaseIri: 'https://example.test/installation/',
    }]);
    expect(JSON.stringify(first)).not.toContain('arbitrary');
    expect(first.sha256).toMatch(/^[0-9a-f]{64}$/u);
    expect(() => validateLegacyHandoffBundle(first)).not.toThrow();
  });

  it('classifies absent, user-owned, and invalid ownership without claiming connection', async () => {
    const absent = await project();
    await expect(inspectLegacySetup(absent)).resolves.toMatchObject({ markerState: 'absent', connection: null });

    const userOwned = await project();
    await writeConfig(userOwned, '[mcp_servers.gnolith]\nurl = "https://user.example/mcp"\n');
    const userBundle = await exportLegacyHandoff(userOwned);
    expect(userBundle.marker.state).toBe('user-owned');
    expect(userBundle.connection).toBeNull();

    const invalid = await project();
    await writeConfig(invalid, `${MANAGED_END}\n[mcp_servers.gnolith]\nurl = "https://bad.example"\n${MANAGED_BEGIN}\n`);
    const invalidBundle = await exportLegacyHandoff(invalid);
    expect(invalidBundle.marker.state).toBe('invalid');
    expect(invalidBundle.connection).toBeNull();
    expect(invalidBundle.legacyMarkerDigest).toBeNull();
  });

  it('reports process, Docker-command, and Sites modes for replanning without conversion', async () => {
    const processRoot = await project();
    await writeConfig(processRoot, managedBlock(['# connection_kind = process', 'command = "seedbed"', 'args = ["mcp", "--stdio"]']));
    expect((await inspectLegacySetup(processRoot)).warnings).toContain('migration/mode: legacy process requires a new Alembic plan and was not converted');

    const dockerRoot = await project();
    await writeConfig(dockerRoot, managedBlock(['# connection_kind = docker', 'command = "docker.exe"', 'args = ["run", "-i", "image"]']));
    expect((await exportLegacyHandoff(dockerRoot)).connection?.mode).toBe('docker');

    const sitesRoot = await project();
    await writeConfig(sitesRoot, managedBlock(['# connection_kind = codex-sites', 'url = "https://sites.example/mcp"', 'auth = "oauth"']));
    const sites = await inspectLegacySetup(sitesRoot);
    expect(sites.connection?.mode).toBe('codex-sites');
    expect(sites.warnings).toContain('migration/mode: legacy codex-sites requires a new Alembic plan and was not converted');
  });

  it('returns no bundle for non-exact package, schema, or receipt formats', async () => {
    const root = await project();
    const packageMismatch = await inspectAndExportLegacySetup(root, {
      packageName: '@gnolith/codex-plugin',
      packageVersion: '0.2.1',
      receiptFormat: 'gnolith-setup-operation-v1',
      handoffSchemaVersion: 1,
    });
    expect(packageMismatch.bundle).toBeNull();
    expect(packageMismatch.incompatibilities).toContain('unsupported package version 0.2.1');

    await writeReceipt(root, { format: 'gnolith-setup-operation-v2' });
    const receiptMismatch = await inspectAndExportLegacySetup(root);
    expect(receiptMismatch.bundle).toBeNull();
    expect(receiptMismatch.incompatibilities[0]).toContain('unsupported receipt format');
  });

  it('canonicalizes recursively, preserves arrays, normalizes NFC, and rejects tampering', async () => {
    expect(canonicalJsonBytes({ z: 'e\u0301', a: [{ y: 2, x: 1 }] }).toString()).toBe('{"a":[{"x":1,"y":2}],"z":"é"}');
    const root = await project();
    const bundle = await exportLegacyHandoff(root);
    const tampered = { ...bundle, sha256: '0'.repeat(64) };
    expect(() => validateLegacyHandoffBundle(tampered)).toThrow('mismatch');
    const unknown = { ...bundle, extra: true };
    expect(() => validateLegacyHandoffBundle(unknown)).toThrow('unknown or missing');
  });

  it('consumes the published exact fixture corpus and digest vectors', async () => {
    const root = await project();
    const fixtureRoot = new URL('../fixtures/', import.meta.url);
    const config = await readFile(new URL('managed-remote.toml', fixtureRoot));
    await mkdir(join(root, '.codex'), { recursive: true });
    await writeFile(join(root, '.codex', 'config.toml'), config);
    const receipt = JSON.parse(await readFile(new URL('operation-v1.json', fixtureRoot), 'utf8'));
    receipt.projectRoot = root;
    const operations = join(root, '.codex', 'gnolith', 'setup', 'operations');
    await mkdir(operations, { recursive: true });
    await writeFile(join(operations, 'fixture-operation.json'), JSON.stringify(receipt));
    const expected = JSON.parse(await readFile(new URL('expected-summary.json', fixtureRoot), 'utf8'));
    const vectors = JSON.parse(await readFile(new URL('digest-vectors.json', fixtureRoot), 'utf8'));
    const bundle = await exportLegacyHandoff(root);
    expect(bundle.receipts).toEqual([expected]);
    expect(bundle.configDigest).toBe(vectors.configDigest);
    expect(bundle.legacyMarkerDigest).toBe(vectors.legacyMarkerDigest);
  });
});
