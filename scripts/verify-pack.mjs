import { spawn } from 'node:child_process';

const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error('npm_execpath is unavailable');
const result = await run(process.execPath, [npmCli, 'pack', '--dry-run', '--json', '--ignore-scripts']);
if (result.code !== 0) {
  process.stderr.write(result.stderr);
  process.exit(result.code ?? 1);
}
const report = JSON.parse(result.stdout);
const files = report[0]?.files?.map((entry) => entry.path) ?? [];
const forbidden = files.filter((path) =>
  /(?:^|\/)(?:\.mcp\.json|mcp-server|hooks\.json|skills|scripts|src|test|\.github)(?:\/|$)/iu.test(path),
);
if (forbidden.length) {
  process.stderr.write(`forbidden packed files:\n${forbidden.join('\n')}\n`);
  process.exit(1);
}
if (!files.includes('dist/index.js') || !files.includes('dist/index.d.ts')) {
  process.stderr.write('packed compatibility library is incomplete\n');
  process.exit(1);
}
process.stdout.write(`packed graph verification passed (${files.length} files)\n`);

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stdout, stderr }));
  });
}
