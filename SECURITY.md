# Security

Report vulnerabilities privately through the repository security advisory
channel. Do not include credentials, config contents, receipts, or secret
canaries in a public issue.

The migration library accepts no secret values. It exports only authentication
selector names. Endpoint userinfo, query, and fragment components and
plaintext-secret evidence are redacted and reported before hashing. Config
digests cover exact bytes but reveal no config content.

Inspection rejects noncanonical roots, linked/junction roots and receipt paths,
Git linked worktrees, malformed markers, invalid UTF-8/TOML/JSON, unsupported
formats, oversized inputs, and schema/digest mismatches. It performs no writes,
subprocesses, network requests, Docker actions, MCP calls, or runtime probes.
