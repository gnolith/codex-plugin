import { mkdir, mkdtemp, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MANAGED_BEGIN, MANAGED_END } from '../src/index.js';

export async function project(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'gnolith-legacy-'));
  await mkdir(join(root, '.git'));
  return (await realpath(root)).normalize('NFC');
}

export async function writeConfig(root: string, body: string): Promise<void> {
  await mkdir(join(root, '.codex'), { recursive: true });
  await writeFile(join(root, '.codex', 'config.toml'), body);
}

export function managedBlock(lines: readonly string[]): string {
  return [MANAGED_BEGIN, '[mcp_servers.gnolith]', ...lines, MANAGED_END, ''].join('\n');
}

export async function writeReceipt(
  root: string,
  overrides: Record<string, unknown> = {},
  filename = 'operation-1.json',
): Promise<void> {
  const directory = join(root, '.codex', 'gnolith', 'setup', 'operations');
  await mkdir(directory, { recursive: true });
  const receipt = {
    format: 'gnolith-setup-operation-v1',
    operationId: 'operation-1',
    planId: 'plan-1',
    projectRoot: root,
    method: 'remote-http',
    action: 'connect',
    state: 'activation-required',
    startedAt: '2026-07-22T12:34:56.000Z',
    updatedAt: '2026-07-22T12:35:56.000Z',
    completedSteps: ['probe-remote', 'write-codex-config', 'write-acceptance-receipt'],
    plan: {
      expectedIdentity: {
        installationId: 'installation-1',
        baseIri: 'https://example.test/installation/',
      },
    },
    observations: { arbitrary: 'must-not-export' },
    ...overrides,
  };
  await writeFile(join(directory, filename), `${JSON.stringify(receipt, null, 2)}\n`);
}
