export declare const LEGACY_PACKAGE_NAME = "@gnolith/codex-plugin";
export declare const LEGACY_PACKAGE_VERSION = "0.2.0";
export declare const LEGACY_RECEIPT_FORMAT = "gnolith-setup-operation-v1";
export declare const HANDOFF_FORMAT = "gnolith-setup-to-alembic-v1";
export declare const HANDOFF_SCHEMA_VERSION = 1;
export declare const MANAGED_BEGIN = "# BEGIN ALEMBIC MANAGED GNOLITH MCP";
export declare const MANAGED_END = "# END ALEMBIC MANAGED GNOLITH MCP";
export declare const MAX_BUNDLE_BYTES: number;
export declare const MAX_RECEIPTS = 1000;
export type MarkerState = 'absent' | 'complete' | 'invalid' | 'user-owned';
export type LegacyMode = 'process' | 'docker' | 'remote-http' | 'codex-sites' | 'unknown';
export type OperationState = 'applying' | 'failed' | 'activation-required' | 'complete';
export type LegacyMethod = 'process' | 'docker' | 'remote-http' | 'codex-sites';
export interface LegacyReceiptSummary {
    format: typeof LEGACY_RECEIPT_FORMAT;
    operationId: string;
    planId: string;
    state: OperationState;
    method: LegacyMethod;
    action: 'create' | 'connect';
    startedAt: string;
    updatedAt: string;
    completedSteps: readonly string[];
    expectedInstallationId: string | null;
    expectedBaseIri: string | null;
}
export interface LegacySetupInspection {
    projectRoot: string;
    configPath: string;
    markerState: MarkerState;
    connection: {
        mode: LegacyMode;
        endpoint?: string;
        authenticationSelector?: string;
    } | null;
    receipts: readonly LegacyReceiptSummary[];
    warnings: readonly string[];
}
export type HandoffAuthentication = {
    kind: 'none';
} | {
    kind: 'bearer-environment';
    variable: string;
} | {
    kind: 'oauth';
} | {
    kind: 'chatgpt';
};
export interface LegacyHandoffBundle {
    format: typeof HANDOFF_FORMAT;
    schemaVersion: typeof HANDOFF_SCHEMA_VERSION;
    projectRoot: string;
    configDigest: string | null;
    legacyMarkerDigest: string | null;
    marker: {
        begin: typeof MANAGED_BEGIN;
        end: typeof MANAGED_END;
        state: MarkerState;
    };
    connection: {
        mode: LegacyMode;
        endpoint: string | null;
        authentication: HandoffAuthentication;
    } | null;
    receipts: readonly LegacyReceiptSummary[];
    sha256: string;
}
export interface LegacySource {
    packageName: string;
    packageVersion: string;
    receiptFormat: string;
    handoffSchemaVersion: number;
}
export interface LegacyExport {
    inspection: LegacySetupInspection;
    bundle: LegacyHandoffBundle | null;
    incompatibilities: readonly string[];
}
export declare class LegacyCompatibilityError extends Error {
    readonly incompatibilities: readonly string[];
    constructor(incompatibilities: readonly string[]);
}
/**
 * Read exact Gnolith Setup 0.2.0 state without modifying it or contacting a runtime.
 * The argument is the project root, not an arbitrary descendant.
 */
export declare function inspectLegacySetup(projectRoot: string, source?: LegacySource): Promise<LegacySetupInspection>;
/**
 * Produce a compatibility report. Unknown source/schema/receipt versions return
 * no bundle. This is the preferred fail-closed boundary for Alembic adoption.
 */
export declare function inspectAndExportLegacySetup(projectRoot: string, source?: LegacySource): Promise<LegacyExport>;
/** Export an exact deterministic handoff bundle or throw on incompatibility. */
export declare function exportLegacyHandoff(projectRoot: string, source?: LegacySource): Promise<LegacyHandoffBundle>;
/** Canonical UTF-8 JSON: NFC strings, sorted object keys, preserved array order. */
export declare function canonicalJsonBytes(value: unknown): Buffer;
/** Validate exact schema, canonical constraints, size, ordering, and digest. */
export declare function validateLegacyHandoffBundle(value: unknown): asserts value is LegacyHandoffBundle;
//# sourceMappingURL=index.d.ts.map