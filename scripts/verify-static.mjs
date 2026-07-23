import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('package.json', root), 'utf8'));
const failures = [];

if (manifest.bin) failures.push('package must not expose a CLI');
if (manifest.main?.includes('server')) failures.push('package must not expose a server');
if (manifest.dependencies?.['@modelcontextprotocol/sdk']) failures.push('MCP SDK dependency remains');
if (manifest.scripts && Object.keys(manifest.scripts).some((name) => /install|connect|deploy|marketplace/iu.test(name))) {
  failures.push('active setup/deployment script remains');
}

const files = await walk(root, '');
const forbiddenPaths = [
  '.mcp.json', 'mcp-server', 'hooks.json', '.codex-plugin', '.local-marketplace',
  'src/server', 'src/setup', 'src/diagnostics', 'skills/gnolith',
];
for (const relative of files) {
  if (relative.startsWith('node_modules/') || relative.startsWith('.git/') || relative.startsWith('candidate/')) continue;
  if (forbiddenPaths.some((part) => relative.includes(part))) failures.push(`forbidden active artifact: ${relative}`);
}

const productionGraph = JSON.stringify(manifest.dependencies ?? {});
if (/modelcontextprotocol|stdio|docker|cloudflare|codex-sites/iu.test(productionGraph)) {
  failures.push('forbidden production dependency graph term');
}

if (failures.length) {
  process.stderr.write(`${failures.join('\n')}\n`);
  process.exit(1);
}
process.stdout.write(`static sunset verification passed (${files.length} repository files inspected)\n`);

async function walk(url, prefix) {
  const output = [];
  for (const entry of await readdir(url, { withFileTypes: true })) {
    const relative = `${prefix}${entry.name}${entry.isDirectory() ? '/' : ''}`;
    if (entry.isDirectory()) output.push(...await walk(new URL(`${encodeURIComponent(entry.name)}/`, url), relative));
    else output.push(relative);
  }
  return output;
}
