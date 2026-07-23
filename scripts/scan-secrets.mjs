import { readFile, readdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u,
  /\bAKIA[0-9A-Z]{16}\b/u,
  /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/u,
  /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/u,
];
const findings = [];
for (const relative of await walk(root, '')) {
  if (/^(?:\.git|node_modules|dist|candidate)\//u.test(relative) || /\.(?:png|jpg|tgz)$/iu.test(relative)) continue;
  if (relative === 'scripts/scan-secrets.mjs') continue;
  const text = await readFile(new URL(relative.replaceAll('\\', '/'), root), 'utf8').catch(() => '');
  if (patterns.some((pattern) => pattern.test(text))) findings.push(relative);
}
if (findings.length) {
  process.stderr.write(`potential credential material detected in:\n${findings.join('\n')}\n`);
  process.exit(1);
}
process.stdout.write('repository secret scan passed\n');

async function walk(url, prefix) {
  const output = [];
  for (const entry of await readdir(url, { withFileTypes: true })) {
    const relative = `${prefix}${entry.name}`;
    if (entry.isDirectory()) output.push(...await walk(new URL(`${encodeURIComponent(entry.name)}/`, url), `${relative}/`));
    else output.push(relative);
  }
  return output;
}
