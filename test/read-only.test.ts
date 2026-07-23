import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { exportLegacyHandoff, inspectLegacySetup } from '../src/index.js';
import { managedBlock, project, writeConfig, writeReceipt } from './helpers.js';

describe('read-only proof', () => {
  it('leaves every project file byte- and metadata-identical', async () => {
    const root = await project();
    await writeConfig(root, managedBlock(['url = "https://example.test/mcp"', 'auth = "chatgpt"']));
    await writeReceipt(root);
    const before = await snapshot(root);
    await inspectLegacySetup(root);
    await exportLegacyHandoff(root);
    const after = await snapshot(root);
    expect(after).toEqual(before);
  });

  it('source imports no write, process, network, Docker, MCP, installation, repair, or data-plane module', async () => {
    const source = await readFile(new URL('../src/index.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/node:child_process|@modelcontextprotocol|fetch\s*\(|node:http|node:https|node:net/u);
    expect(source).not.toMatch(/\b(?:writeFile|appendFile|mkdir|rename|rm|spawn|execFile)\b/u);
  });
});

async function snapshot(root: string): Promise<Record<string, unknown>> {
  const output: Record<string, unknown> = {};
  await visit(root, '');
  return output;

  async function visit(directory: string, prefix: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      const relative = `${prefix}${entry.name}`;
      const info = await stat(path);
      if (entry.isDirectory()) {
        output[`${relative}/`] = { mtimeMs: info.mtimeMs, mode: info.mode, size: info.size };
        await visit(path, `${relative}/`);
      } else {
        output[relative] = {
          mtimeMs: info.mtimeMs,
          mode: info.mode,
          size: info.size,
          sha256: createHash('sha256').update(await readFile(path)).digest('hex'),
        };
      }
    }
  }
}
