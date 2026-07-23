# Archival readiness

This repository is not yet authorized for archival.

Required sequence:

1. Produce a self-green immutable candidate commit, packed artifact, SBOM,
   inventory, and lowercase SHA-256 checksums.
2. Run independent full-stack Alembic adoption against that exact checksum.
3. Publish and verify all continuing packages.
4. If needed, publish only the byte-identical migration artifact last.
5. Verify public-artifact checksum and adoption smoke.
6. Deprecate the historical package only after verified Alembic adoption.
7. Archive only after fixture consumption and explicit repository-governance
   authorization.

Archival or uninstall must never remove project config, receipts,
installations, volumes, backups, secrets, remote resources, migration fixtures,
or release evidence.
