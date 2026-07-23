import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import { isAbsolute, join, normalize, resolve } from 'node:path';
import { parse as parseToml } from 'smol-toml';
export const LEGACY_PACKAGE_NAME = '@gnolith/codex-plugin';
export const LEGACY_PACKAGE_VERSION = '0.2.0';
export const LEGACY_RECEIPT_FORMAT = 'gnolith-setup-operation-v1';
export const HANDOFF_FORMAT = 'gnolith-setup-to-alembic-v1';
export const HANDOFF_SCHEMA_VERSION = 1;
export const MANAGED_BEGIN = '# BEGIN ALEMBIC MANAGED GNOLITH MCP';
export const MANAGED_END = '# END ALEMBIC MANAGED GNOLITH MCP';
export const MAX_BUNDLE_BYTES = 1024 * 1024;
export const MAX_RECEIPTS = 1000;
const EXACT_SOURCE = {
    packageName: LEGACY_PACKAGE_NAME,
    packageVersion: LEGACY_PACKAGE_VERSION,
    receiptFormat: LEGACY_RECEIPT_FORMAT,
    handoffSchemaVersion: HANDOFF_SCHEMA_VERSION,
};
const RECEIPT_KEYS = new Set([
    'format', 'operationId', 'planId', 'projectRoot', 'method', 'action', 'state',
    'startedAt', 'updatedAt', 'completedSteps', 'currentStep', 'error', 'plan', 'observations',
]);
const CONFIG_KEYS = new Set([
    'url', 'bearer_token_env_var', 'auth', 'command', 'args', 'cwd', 'env_vars',
    'required', 'startup_timeout_sec', 'tool_timeout_sec', 'default_tools_approval_mode',
]);
const STATES = new Set(['applying', 'failed', 'activation-required', 'complete']);
const METHODS = new Set(['process', 'docker', 'remote-http', 'codex-sites']);
export class LegacyCompatibilityError extends Error {
    incompatibilities;
    constructor(incompatibilities) {
        super(`Legacy Setup input is incompatible: ${incompatibilities.join('; ')}`);
        this.name = 'LegacyCompatibilityError';
        this.incompatibilities = Object.freeze([...incompatibilities]);
    }
}
/**
 * Read exact Gnolith Setup 0.2.0 state without modifying it or contacting a runtime.
 * The argument is the project root, not an arbitrary descendant.
 */
export async function inspectLegacySetup(projectRoot, source = EXACT_SOURCE) {
    const result = await inspectForExport(projectRoot, source);
    return result.inspection;
}
/**
 * Produce a compatibility report. Unknown source/schema/receipt versions return
 * no bundle. This is the preferred fail-closed boundary for Alembic adoption.
 */
export async function inspectAndExportLegacySetup(projectRoot, source = EXACT_SOURCE) {
    return inspectForExport(projectRoot, source);
}
/** Export an exact deterministic handoff bundle or throw on incompatibility. */
export async function exportLegacyHandoff(projectRoot, source = EXACT_SOURCE) {
    const result = await inspectForExport(projectRoot, source);
    if (!result.bundle)
        throw new LegacyCompatibilityError(result.incompatibilities);
    return result.bundle;
}
/** Canonical UTF-8 JSON: NFC strings, sorted object keys, preserved array order. */
export function canonicalJsonBytes(value) {
    return Buffer.from(JSON.stringify(canonicalValue(value)), 'utf8');
}
/** Validate exact schema, canonical constraints, size, ordering, and digest. */
export function validateLegacyHandoffBundle(value) {
    const bundle = requireRecord(value, 'bundle');
    exactKeys(bundle, [
        'format', 'schemaVersion', 'projectRoot', 'configDigest', 'legacyMarkerDigest',
        'marker', 'connection', 'receipts', 'sha256',
    ], 'bundle');
    if (bundle.format !== HANDOFF_FORMAT || bundle.schemaVersion !== HANDOFF_SCHEMA_VERSION) {
        throw new Error('Unsupported handoff format or schema version');
    }
    requireCanonicalAbsolute(bundle.projectRoot, 'bundle.projectRoot');
    nullableDigest(bundle.configDigest, 'bundle.configDigest');
    nullableDigest(bundle.legacyMarkerDigest, 'bundle.legacyMarkerDigest');
    const marker = requireRecord(bundle.marker, 'bundle.marker');
    exactKeys(marker, ['begin', 'end', 'state'], 'bundle.marker');
    if (marker.begin !== MANAGED_BEGIN || marker.end !== MANAGED_END || !isMarkerState(marker.state)) {
        throw new Error('Invalid legacy marker descriptor');
    }
    if ((marker.state === 'complete') !== (bundle.legacyMarkerDigest !== null)) {
        throw new Error('Legacy marker state and digest are inconsistent');
    }
    if (marker.state !== 'complete' && bundle.connection !== null) {
        throw new Error('Only a complete legacy marker may carry a connection');
    }
    if (bundle.connection !== null)
        validateBundleConnection(bundle.connection);
    if (!Array.isArray(bundle.receipts) || bundle.receipts.length > MAX_RECEIPTS) {
        throw new Error('Bundle receipts must be an array of at most 1000 entries');
    }
    let previous = '';
    for (const [index, receipt] of bundle.receipts.entries()) {
        validateSummary(receipt, `bundle.receipts[${index}]`);
        if (index > 0 && receipt.operationId <= previous)
            throw new Error('Bundle receipts are not sorted by operationId');
        previous = receipt.operationId;
    }
    requireDigest(bundle.sha256, 'bundle.sha256');
    const unsigned = { ...bundle };
    delete unsigned.sha256;
    const expected = sha256(canonicalJsonBytes(unsigned));
    if (bundle.sha256 !== expected)
        throw new Error('Bundle SHA-256 mismatch');
    if (canonicalJsonBytes(bundle).byteLength > MAX_BUNDLE_BYTES)
        throw new Error('Bundle exceeds 1 MiB');
}
async function inspectForExport(projectRootInput, source) {
    const incompatibilities = sourceIncompatibilities(source);
    const projectRoot = await canonicalProjectRoot(projectRootInput);
    const configPath = join(projectRoot, '.codex', 'config.toml').normalize('NFC');
    const warnings = [];
    await assertUnlinkedPath(projectRoot, ['.codex', 'config.toml']);
    const config = await readOptionalRegularFile(configPath, 'project config');
    if (config && config.byteLength > MAX_BUNDLE_BYTES)
        throw new Error('project config exceeds the 1 MiB inspection limit');
    const configDigest = config ? sha256(config) : null;
    let markerState = 'absent';
    let legacyMarkerDigest = null;
    let connection = null;
    let bundleConnection = null;
    if (config) {
        const sourceText = decodeUtf8(config, 'project config');
        const marker = inspectMarker(sourceText);
        markerState = marker.state;
        legacyMarkerDigest = marker.digest;
        let parsed;
        try {
            parsed = parseToml(sourceText.replace(/\r\n?|\n/gu, '\n'));
        }
        catch {
            warnings.push('security/config: project config is invalid TOML; no connection was claimed');
            markerState = 'invalid';
            legacyMarkerDigest = null;
        }
        const server = readServer(parsed);
        if (markerState === 'complete' && server) {
            const interpreted = interpretConnection(server, marker.block ?? '', warnings);
            connection = interpreted.inspection;
            bundleConnection = interpreted.bundle;
            scanSecretEvidence(server, warnings);
            const unknownKeys = Object.keys(server).filter((key) => !CONFIG_KEYS.has(key));
            if (unknownKeys.length) {
                warnings.push(`compatibility/config: unrecognized legacy Gnolith keys were ignored: ${unknownKeys.sort().join(', ')}`);
            }
        }
        else if (markerState === 'user-owned') {
            warnings.push('ownership/config: user-owned [mcp_servers.gnolith] was not claimed or exported');
        }
        else if (markerState === 'invalid') {
            warnings.push('ownership/config: incomplete, reversed, duplicate, or ambiguous markers failed closed');
        }
        else if (markerState === 'complete') {
            markerState = 'invalid';
            legacyMarkerDigest = null;
            warnings.push('ownership/config: managed markers did not contain a readable Gnolith table');
        }
    }
    const receiptResult = await readReceipts(projectRoot, LEGACY_RECEIPT_FORMAT, warnings);
    incompatibilities.push(...receiptResult.incompatibilities);
    const inspection = deepFreeze({
        projectRoot,
        configPath,
        markerState,
        connection,
        receipts: receiptResult.receipts,
        warnings: uniqueSorted(warnings),
    });
    if (incompatibilities.length) {
        return deepFreeze({ inspection, bundle: null, incompatibilities: uniqueSorted(incompatibilities) });
    }
    const unsigned = {
        format: HANDOFF_FORMAT,
        schemaVersion: HANDOFF_SCHEMA_VERSION,
        projectRoot,
        configDigest,
        legacyMarkerDigest,
        marker: { begin: MANAGED_BEGIN, end: MANAGED_END, state: markerState },
        connection: markerState === 'complete' ? bundleConnection : null,
        receipts: receiptResult.receipts,
    };
    const bundle = deepFreeze({
        ...unsigned,
        sha256: sha256(canonicalJsonBytes(unsigned)),
    });
    if (canonicalJsonBytes(bundle).byteLength > MAX_BUNDLE_BYTES) {
        return deepFreeze({
            inspection,
            bundle: null,
            incompatibilities: ['canonical handoff bundle exceeds 1 MiB'],
        });
    }
    validateLegacyHandoffBundle(bundle);
    return deepFreeze({ inspection, bundle, incompatibilities: [] });
}
async function canonicalProjectRoot(input) {
    if (typeof input !== 'string' || !isAbsolute(input))
        throw new Error('projectRoot must be an absolute path');
    if (input !== input.normalize('NFC'))
        throw new Error('projectRoot must be NFC-normalized');
    const lexical = normalize(resolve(input));
    const rootInfo = await lstat(lexical);
    if (!rootInfo.isDirectory() || rootInfo.isSymbolicLink())
        throw new Error('projectRoot must be a real directory, not a symlink or junction');
    const canonical = (await realpath(lexical)).normalize('NFC');
    if (normalizeCase(canonical) !== normalizeCase(lexical))
        throw new Error('projectRoot must already be canonical');
    const gitPath = join(canonical, '.git');
    const git = await lstat(gitPath).catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error));
    if (!git?.isDirectory() || git.isSymbolicLink()) {
        throw new Error('projectRoot must be a primary Git worktree with a real .git directory');
    }
    return canonical;
}
async function readOptionalRegularFile(path, label) {
    const info = await lstat(path).catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error));
    if (!info)
        return null;
    if (!info.isFile() || info.isSymbolicLink())
        throw new Error(`${label} must be a regular non-symlink file`);
    return readFile(path);
}
function inspectMarker(source) {
    const normalized = source.replace(/\r\n?|\n/gu, '\n');
    const lines = normalized.split('\n');
    const begins = indexes(lines, MANAGED_BEGIN);
    const ends = indexes(lines, MANAGED_END);
    const tables = lines.flatMap((line, index) => /^\s*\[\s*mcp_servers\.gnolith\s*\]\s*(?:#.*)?$/u.test(line) ? [index] : []);
    if (begins.length === 0 && ends.length === 0) {
        return { state: tables.length ? 'user-owned' : 'absent', digest: null };
    }
    if (begins.length !== 1 || ends.length !== 1 || begins[0] >= ends[0])
        return { state: 'invalid', digest: null };
    const begin = begins[0];
    const end = ends[0];
    if (tables.length !== 1 || tables[0] <= begin || tables[0] >= end)
        return { state: 'invalid', digest: null };
    const block = `${lines.slice(begin, end + 1).join('\n')}\n`;
    return { state: 'complete', digest: sha256(Buffer.from(block, 'utf8')), block };
}
function interpretConnection(server, markerBlock, warnings) {
    let mode = 'unknown';
    let endpoint;
    if (typeof server.url === 'string') {
        mode = /^(?:#\s*connection_kind\s*=\s*codex-sites)\s*$/mu.test(markerBlock) ? 'codex-sites' : 'remote-http';
        endpoint = sanitizeEndpoint(server.url, warnings);
    }
    else if (typeof server.command === 'string') {
        mode = /(?:^|[\\/])docker(?:\.exe)?$/iu.test(server.command) ? 'docker' : 'process';
    }
    if (mode === 'process' || mode === 'docker' || mode === 'codex-sites') {
        warnings.push(`migration/mode: legacy ${mode} requires a new Alembic plan and was not converted`);
    }
    const authentication = parseAuthentication(server, warnings);
    const authenticationSelector = authentication.kind === 'bearer-environment'
        ? authentication.variable
        : authentication.kind === 'none' ? undefined : authentication.kind;
    return {
        inspection: { mode, ...(endpoint ? { endpoint } : {}), ...(authenticationSelector ? { authenticationSelector } : {}) },
        bundle: { mode, endpoint: endpoint ?? null, authentication },
    };
}
function parseAuthentication(server, warnings) {
    if (typeof server.bearer_token_env_var === 'string') {
        if (/^[A-Za-z_][A-Za-z0-9_]*$/u.test(server.bearer_token_env_var)) {
            boundedIdentifier(server.bearer_token_env_var, 'bearer environment variable');
            return { kind: 'bearer-environment', variable: server.bearer_token_env_var.normalize('NFC') };
        }
        warnings.push('security/authentication: invalid bearer environment selector was redacted');
        return { kind: 'none' };
    }
    if (server.auth === 'oauth' || server.auth === 'chatgpt')
        return { kind: server.auth };
    if (server.auth !== undefined && server.auth !== 'none')
        warnings.push('compatibility/authentication: unsupported authentication selector was ignored');
    return { kind: 'none' };
}
function sanitizeEndpoint(value, warnings) {
    try {
        const url = new URL(value);
        if (url.protocol !== 'http:' && url.protocol !== 'https:')
            throw new Error();
        if (url.username || url.password)
            warnings.push('security/endpoint: URL userinfo was redacted');
        if (url.search)
            warnings.push('security/endpoint: URL query was redacted');
        if (url.hash)
            warnings.push('security/endpoint: URL fragment was redacted');
        url.username = '';
        url.password = '';
        url.search = '';
        url.hash = '';
        return url.toString().normalize('NFC');
    }
    catch {
        warnings.push('security/endpoint: invalid endpoint was omitted');
        return undefined;
    }
}
async function readReceipts(projectRoot, expectedFormat, warnings) {
    const directory = join(projectRoot, '.codex', 'gnolith', 'setup', 'operations');
    await assertUnlinkedPath(projectRoot, ['.codex', 'gnolith', 'setup', 'operations']);
    const info = await lstat(directory).catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error));
    if (!info)
        return { receipts: [], incompatibilities: [] };
    if (!info.isDirectory() || info.isSymbolicLink())
        throw new Error('legacy receipt directory must be a real directory');
    const entries = await readdir(directory, { withFileTypes: true });
    const files = entries.filter((entry) => entry.name.endsWith('.json'));
    if (files.length > MAX_RECEIPTS)
        return { receipts: [], incompatibilities: ['receipt count exceeds 1000'] };
    const receipts = [];
    const incompatibilities = [];
    for (const entry of files.sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
        if (!entry.isFile() || entry.isSymbolicLink())
            throw new Error(`legacy receipt ${entry.name} is not a regular file`);
        const path = join(directory, entry.name);
        const bytes = await readFile(path);
        if (bytes.byteLength > MAX_BUNDLE_BYTES) {
            incompatibilities.push(`receipt ${entry.name} exceeds 1 MiB`);
            continue;
        }
        let value;
        try {
            value = JSON.parse(decodeUtf8(bytes, `receipt ${entry.name}`));
            receipts.push(parseReceipt(value, projectRoot, expectedFormat, warnings));
        }
        catch (error) {
            incompatibilities.push(`receipt ${entry.name}: ${safeError(error)}`);
        }
    }
    receipts.sort((a, b) => a.operationId < b.operationId ? -1 : a.operationId > b.operationId ? 1 : 0);
    for (let index = 1; index < receipts.length; index += 1) {
        if (receipts[index - 1].operationId === receipts[index].operationId) {
            incompatibilities.push(`duplicate receipt operationId ${receipts[index].operationId}`);
        }
    }
    return { receipts, incompatibilities };
}
function parseReceipt(value, projectRoot, expectedFormat, warnings) {
    const receipt = requireRecord(value, 'receipt');
    for (const key of Object.keys(receipt))
        if (!RECEIPT_KEYS.has(key))
            throw new Error(`unknown receipt key ${key}`);
    for (const key of ['format', 'operationId', 'planId', 'projectRoot', 'method', 'action', 'state', 'startedAt', 'updatedAt', 'completedSteps', 'plan', 'observations']) {
        if (!(key in receipt))
            throw new Error(`missing receipt key ${key}`);
    }
    if (receipt.format !== expectedFormat || receipt.format !== LEGACY_RECEIPT_FORMAT)
        throw new Error('unsupported receipt format');
    const operationId = boundedIdentifier(receipt.operationId, 'operationId');
    const planId = boundedIdentifier(receipt.planId, 'planId');
    if (receipt.projectRoot !== projectRoot)
        throw new Error('receipt belongs to another project root');
    if (!METHODS.has(receipt.method))
        throw new Error('unsupported receipt method');
    if (receipt.action !== 'create' && receipt.action !== 'connect')
        throw new Error('unsupported receipt action');
    if (!STATES.has(receipt.state))
        throw new Error('unsupported receipt state');
    const startedAt = canonicalTimestamp(receipt.startedAt, 'startedAt');
    const updatedAt = canonicalTimestamp(receipt.updatedAt, 'updatedAt');
    if (!Array.isArray(receipt.completedSteps))
        throw new Error('completedSteps must be an array');
    const completedSteps = receipt.completedSteps.map((step, index) => boundedIdentifier(step, `completedSteps[${index}]`));
    const plan = requireRecord(receipt.plan, 'receipt.plan');
    const expected = plan.expectedIdentity === undefined ? {} : requireRecord(plan.expectedIdentity, 'receipt.plan.expectedIdentity');
    let expectedInstallationId = null;
    if (expected.installationId !== undefined)
        expectedInstallationId = boundedIdentifier(expected.installationId, 'expectedInstallationId');
    let expectedBaseIri = null;
    if (expected.baseIri !== undefined) {
        if (typeof expected.baseIri !== 'string')
            throw new Error('expectedBaseIri must be a string');
        expectedBaseIri = sanitizeEndpoint(expected.baseIri, warnings) ?? null;
    }
    return {
        format: LEGACY_RECEIPT_FORMAT,
        operationId,
        planId,
        state: receipt.state,
        method: receipt.method,
        action: receipt.action,
        startedAt,
        updatedAt,
        completedSteps,
        expectedInstallationId,
        expectedBaseIri,
    };
}
function sourceIncompatibilities(source) {
    const issues = [];
    if (!isRecord(source))
        return ['legacy source declaration must be an object'];
    if (JSON.stringify(Object.keys(source).sort()) !== JSON.stringify([
        'handoffSchemaVersion', 'packageName', 'packageVersion', 'receiptFormat',
    ])) {
        issues.push('legacy source declaration has unknown or missing keys');
    }
    if (source.packageName !== LEGACY_PACKAGE_NAME)
        issues.push(`unsupported package ${String(source.packageName)}`);
    if (source.packageVersion !== LEGACY_PACKAGE_VERSION)
        issues.push(`unsupported package version ${String(source.packageVersion)}`);
    if (source.receiptFormat !== LEGACY_RECEIPT_FORMAT)
        issues.push(`unsupported receipt format ${String(source.receiptFormat)}`);
    if (source.handoffSchemaVersion !== HANDOFF_SCHEMA_VERSION)
        issues.push(`unsupported handoff schema version ${String(source.handoffSchemaVersion)}`);
    return issues;
}
function validateBundleConnection(value) {
    const connection = requireRecord(value, 'bundle.connection');
    exactKeys(connection, ['mode', 'endpoint', 'authentication'], 'bundle.connection');
    if (!['process', 'docker', 'remote-http', 'codex-sites', 'unknown'].includes(String(connection.mode)))
        throw new Error('Invalid connection mode');
    if (connection.endpoint !== null && typeof connection.endpoint !== 'string')
        throw new Error('Invalid connection endpoint');
    if (typeof connection.endpoint === 'string') {
        const clean = sanitizeEndpointForValidation(connection.endpoint);
        if (clean !== connection.endpoint)
            throw new Error('Connection endpoint is not canonical and credential-free');
    }
    const auth = requireRecord(connection.authentication, 'bundle.connection.authentication');
    if (auth.kind === 'bearer-environment') {
        exactKeys(auth, ['kind', 'variable'], 'bundle.connection.authentication');
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(String(auth.variable)))
            throw new Error('Invalid bearer selector');
        boundedIdentifier(auth.variable, 'bearer selector');
    }
    else {
        exactKeys(auth, ['kind'], 'bundle.connection.authentication');
        if (!['none', 'oauth', 'chatgpt'].includes(String(auth.kind)))
            throw new Error('Invalid authentication kind');
    }
}
function validateSummary(value, label) {
    const receipt = requireRecord(value, label);
    exactKeys(receipt, [
        'format', 'operationId', 'planId', 'state', 'method', 'action', 'startedAt',
        'updatedAt', 'completedSteps', 'expectedInstallationId', 'expectedBaseIri',
    ], label);
    if (receipt.format !== LEGACY_RECEIPT_FORMAT)
        throw new Error(`${label}.format is invalid`);
    boundedIdentifier(receipt.operationId, `${label}.operationId`);
    boundedIdentifier(receipt.planId, `${label}.planId`);
    if (!STATES.has(receipt.state) || !METHODS.has(receipt.method))
        throw new Error(`${label} state or method is invalid`);
    if (receipt.action !== 'create' && receipt.action !== 'connect')
        throw new Error(`${label}.action is invalid`);
    canonicalTimestamp(receipt.startedAt, `${label}.startedAt`);
    canonicalTimestamp(receipt.updatedAt, `${label}.updatedAt`);
    if (!Array.isArray(receipt.completedSteps))
        throw new Error(`${label}.completedSteps is invalid`);
    receipt.completedSteps.forEach((step, index) => boundedIdentifier(step, `${label}.completedSteps[${index}]`));
    if (receipt.expectedInstallationId !== null)
        boundedIdentifier(receipt.expectedInstallationId, `${label}.expectedInstallationId`);
    if (receipt.expectedBaseIri !== null) {
        if (typeof receipt.expectedBaseIri !== 'string' || sanitizeEndpointForValidation(receipt.expectedBaseIri) !== receipt.expectedBaseIri) {
            throw new Error(`${label}.expectedBaseIri is invalid`);
        }
    }
}
function scanSecretEvidence(value, warnings, path = 'mcp_servers.gnolith') {
    if (!isRecord(value))
        return;
    for (const [key, child] of Object.entries(value)) {
        const childPath = `${path}.${key}`;
        if (/(?:secret|password|credential|token)(?!_env_var)/iu.test(key)) {
            warnings.push(`security/plaintext-secret: value at ${childPath} was redacted and not exported`);
        }
        else if (isRecord(child))
            scanSecretEvidence(child, warnings, childPath);
    }
}
function canonicalValue(value) {
    if (typeof value === 'string')
        return value.normalize('NFC');
    if (typeof value === 'number') {
        if (!Number.isFinite(value))
            throw new Error('Canonical JSON cannot encode non-finite numbers');
        return value;
    }
    if (value === null || typeof value === 'boolean')
        return value;
    if (Array.isArray(value))
        return value.map(canonicalValue);
    if (!isRecord(value))
        throw new Error('Canonical JSON supports only JSON values');
    const output = {};
    const seen = new Set();
    for (const key of Object.keys(value).map((key) => key.normalize('NFC')).sort()) {
        if (seen.has(key))
            throw new Error('NFC object-key collision');
        seen.add(key);
        const original = Object.keys(value).find((candidate) => candidate.normalize('NFC') === key);
        output[key] = canonicalValue(value[original]);
    }
    return output;
}
function exactKeys(value, expected, label) {
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    if (JSON.stringify(actual) !== JSON.stringify(wanted))
        throw new Error(`${label} has unknown or missing keys`);
}
function requireRecord(value, label) {
    if (!isRecord(value))
        throw new Error(`${label} must be an object`);
    return value;
}
function boundedIdentifier(value, label) {
    if (typeof value !== 'string' || value.length === 0 || Array.from(value).length > 256)
        throw new Error(`${label} must contain 1..256 Unicode scalar values`);
    if (value !== value.normalize('NFC'))
        throw new Error(`${label} must be NFC-normalized`);
    return value;
}
function canonicalTimestamp(value, label) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value))
        throw new Error(`${label} must be a canonical UTC instant`);
    const parsed = new Date(value);
    if (!Number.isFinite(parsed.valueOf()) || parsed.toISOString() !== value)
        throw new Error(`${label} must be a canonical UTC instant`);
    return value;
}
function requireCanonicalAbsolute(value, label) {
    if (typeof value !== 'string' || !isAbsolute(value) || value !== value.normalize('NFC') || normalize(resolve(value)) !== value)
        throw new Error(`${label} must be canonical absolute NFC text`);
}
function nullableDigest(value, label) {
    if (value !== null)
        requireDigest(value, label);
}
function requireDigest(value, label) {
    if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value))
        throw new Error(`${label} must be lowercase SHA-256`);
}
function sanitizeEndpointForValidation(value) {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash)
        throw new Error('Unsafe endpoint');
    return url.toString().normalize('NFC');
}
function decodeUtf8(value, label) {
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(value);
    if (decoded.charCodeAt(0) === 0xfeff)
        throw new Error(`${label} must not contain a UTF-8 BOM`);
    return decoded;
}
async function assertUnlinkedPath(projectRoot, segments) {
    let cursor = projectRoot;
    for (const segment of segments) {
        cursor = join(cursor, segment);
        const info = await lstat(cursor).catch((error) => error.code === 'ENOENT' ? null : Promise.reject(error));
        if (!info)
            return;
        if (info.isSymbolicLink())
            throw new Error(`legacy read path contains a symlink or junction at ${segment}`);
    }
}
function readServer(value) {
    if (!isRecord(value) || !isRecord(value.mcp_servers) || !isRecord(value.mcp_servers.gnolith))
        return undefined;
    return value.mcp_servers.gnolith;
}
function indexes(lines, value) {
    return lines.flatMap((line, index) => line === value ? [index] : []);
}
function isMarkerState(value) {
    return ['absent', 'complete', 'invalid', 'user-owned'].includes(String(value));
}
function sha256(value) {
    return createHash('sha256').update(value).digest('hex');
}
function normalizeCase(value) {
    return process.platform === 'win32' ? value.toLowerCase() : value;
}
function uniqueSorted(values) {
    return [...new Set(values)].sort();
}
function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function safeError(error) {
    return (error instanceof Error ? error.message : 'invalid receipt').replace(/[\r\n]+/gu, ' ').slice(0, 256);
}
function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
        Object.freeze(value);
        for (const child of Object.values(value))
            deepFreeze(child);
    }
    return value;
}
//# sourceMappingURL=index.js.map