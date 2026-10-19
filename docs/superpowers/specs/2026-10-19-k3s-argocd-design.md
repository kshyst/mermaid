# Mermaid K3s deployment

## Approved direction

Deploy `kshyst/mermaid` from `main` to the user's existing K3s cluster with
Argo CD and the hostname `mermaid.kshyst.ir`. The user operates the server;
repository preparation and local verification happen on this workstation.

## Release flow

GitHub Actions runs frontend and Python tests on pull requests and pushes to
`main`. Successful main builds publish separate frontend and API images to
GHCR. A release renderer substitutes the two immutable image digests into
Kustomize manifests. The workflow commits that tested snapshot to the
`deploy/production` branch. Argo CD watches that branch, not untested main
manifests. The workflow uses GITHUB_TOKEN; it needs neither SSH credentials
nor cluster credentials. Generated commits cannot retrigger main builds.

Serialize releases and reject obsolete main revisions before publication of
the deployment snapshot. Never force-push the deployment branch. Record the
source commit in its commit message and release metadata.

## Workloads and storage

Use the `mermaid` namespace and the node hostname `control-1`. Deploy one
frontend and one API pod with explicit CPU/memory requests and limits,
startup/readiness/liveness probes, and no service-account token mounts.
The API uses Recreate deployment strategy and a 5 GiB local-path PVC for
the entire `/data` directory, including the SQLite database, WAL files,
bootstrap identities, and signing key. Run the API as a non-root user with
volume group permissions. Do not run concurrent API replicas against SQLite.

Protect the PVC from Argo CD pruning and application deletion. Local-path
storage survives pod updates, not node/disk loss or arbitrary administrative
deletion. Document live SQLite backup and an offline restore procedure.
No existing installation or database is modified automatically.

## Networking and access

Keep the frontend Service on port 80 and `diagrams-api` on port 8000 to
preserve the existing proxy contract. Traefik terminates public HTTPS and
cert-manager uses the existing `letsencrypt` ClusterIssuer. Add an HTTP
redirect route while leaving ACME solver routing to cert-manager. Permit
frontend traffic only from Traefik; permit API traffic only from frontend
pods. Trust forwarded client IPs only from the default K3s pod CIDR.

Create an Argo AppProject scoped to this repository and namespace, followed
by an Application with automatic sync, self-healing and pruning. Keep those
bootstrap resources outside the rendered application resources.

## Operations

Document initial GitHub Actions permissions, package visibility or a GHCR
read-only pull secret, optional private-Git credentials for Argo, first
build, server bootstrap, health verification, migration before DNS cutover,
backups and durable Git-based rollback. A fresh PVC initializes a fresh
database. Existing data migration is an explicit operator action.

## Verification

Run existing frontend/Python suites and frontend build. Render manifests
with real-format fixture digests; reject invalid image arguments. Validate
workflow syntax, resource references, namespace boundaries and probe/storage
contracts. Build and smoke-test both images using an isolated Docker network
and temporary data volume; verify HTTPS-origin authentication and data
survival across API container replacement. Do not claim live cluster
deployment or GitHub Actions execution based on workstation checks.
