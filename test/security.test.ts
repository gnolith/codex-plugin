import { mkdir, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exportLegacyHandoff, inspectAndExportLegacySetup, inspectLegacySetup } from '../src/index.js';
import { managedBlock, project, writeConfig, writeReceipt } from './helpers.js';

describe('adversarial compatibility boundaries', () => {
  it('redacts endpoint credentials, query, fragment, plaintext keys, values, commands, and observations', async () => {
    const root = await project();
    const canary = 'SECRET_CANARY_DO_NOT_COPY';
    await writeConfig(root, managedBlock([
      'url = "https://user:password@example.test/mcp?token=SECRET_CANARY_DO_NOT_COPY#fragment"',
      `access_token = "${canary}"`,
    ]));
    await writeReceipt(root, { observations: { password: canary }, error: canary });
    const result = await inspectAndExportLegacySetup(root);
    const encoded = JSON.stringify(result.bundle);
    expect(encoded).not.toContain(canary);
    expect(encoded).not.toContain('password');
    expect(result.bundle?.connection?.endpoint).toBe('https://example.test/mcp');
    expect(result.inspection.warnings.some((warning) => warning.includes('plaintext-secret'))).toBe(true);
  });

  it('rejects malformed TOML, unknown receipt keys, noncanonical timestamps, and oversized identifiers', async () => {
    const malformed = await project();
    await writeConfig(malformed, `${managedBlock(['url = "https://one.example"'])}\n[mcp_servers.gnolith]\nurl = "https://two.example"\n`);
    expect((await inspectLegacySetup(malformed)).markerState).toBe('invalid');

    const unknown = await project();
    await writeReceipt(unknown, { injected: true });
    expect((await inspectAndExportLegacySetup(unknown)).bundle).toBeNull();

    const time = await project();
    await writeReceipt(time, { startedAt: '2026-07-22T12:34:56Z' });
    expect((await inspectAndExportLegacySetup(time)).incompatibilities[0]).toContain('canonical UTC');

    const identifier = await project();
    await writeReceipt(identifier, { operationId: 'x'.repeat(257) });
    expect((await inspectAndExportLegacySetup(identifier)).bundle).toBeNull();
  });

  it('rejects symlinked receipt files and Git worktree roots', async () => {
    const worktree = await mkdtemp(join(tmpdir(), 'gnolith-worktree-'));
    await writeFile(join(worktree, '.git'), 'gitdir: elsewhere\n');
    await expect(inspectLegacySetup(worktree)).rejects.toThrow('primary Git worktree');

    const root = await project();
    const operations = join(root, '.codex', 'gnolith', 'setup', 'operations');
    await mkdir(operations, { recursive: true });
    const target = join(root, 'outside.json');
    await writeFile(target, '{}');
    try {
      await symlink(target, join(operations, 'linked.json'));
      await expect(exportLegacyHandoff(root)).rejects.toThrow(/regular file|symlink|junction/u);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EPERM') throw error;
    }
  });

  it('handles spaces, Unicode, CR-only markers, and sorts receipts by operationId', async () => {
    const parent = await mkdtemp(join(tmpdir(), 'gnolith parent '));
    const root = join(parent, 'Unicode é project');
    await mkdir(join(root, '.git'), { recursive: true });
    await writeConfig(root, managedBlock(['url = "https://example.test/mcp"']).replace(/\n/gu, '\r'));
    await writeReceipt(root, { operationId: 'z-operation', planId: 'plan-z' }, 'z.json');
    await writeReceipt(root, { operationId: 'a-operation', planId: 'plan-a' }, 'a.json');
    const bundle = await exportLegacyHandoff(root);
    expect(bundle.receipts.map((receipt) => receipt.operationId)).toEqual(['a-operation', 'z-operation']);
    expect(bundle.legacyMarkerDigest).toMatch(/^[0-9a-f]{64}$/u);
  });

  it('fails closed on oversized receipt bytes', async () => {
    const root = await project();
    const operations = join(root, '.codex', 'gnolith', 'setup', 'operations');
    await mkdir(operations, { recursive: true });
    await writeFile(join(operations, 'oversized.json'), 'x'.repeat(1024 * 1024 + 1));
    const result = await inspectAndExportLegacySetup(root);
    expect(result.bundle).toBeNull();
    expect(result.incompatibilities).toContain('receipt oversized.json exceeds 1 MiB');
  });
});
