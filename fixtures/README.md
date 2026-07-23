# Exact 0.2.0 compatibility fixtures

These inert files contain no real endpoints or credentials. Consumers should
copy the fixture tree into a canonical temporary primary Git worktree and
replace `/fixture/project` with that root before invoking the reader.

- `managed-remote.toml`: complete exact historical marker block.
- `user-owned.toml`: unclaimed table without markers.
- `invalid-reversed.toml`: fail-closed reversed markers.
- `operation-v1.json`: exact receipt envelope with arbitrary data that must not
  appear in the exported summary.
- `expected-summary.json`: exact allowlisted receipt output.
- `digest-vectors.json`: exact config/marker digest vectors for the LF fixture.
