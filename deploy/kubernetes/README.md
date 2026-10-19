# Deploy Mermaid with K3s and Argo CD

Production host: **https://mermaid.kshyst.ir**. Source branch: `main`.
Argo CD watches a separate generated branch, `deploy/production`.

```text
main push -> tests -> two images in GHCR -> deployment snapshot in Git
          -> Argo CD auto-sync -> K3s updates frontend and API
```

GitHub never connects to the VPS. No SSH key or cluster kubeconfig is put in
GitHub Actions. The only workflow credential is its built-in `GITHUB_TOKEN`.
Images use immutable SHA-256 digests; publishing an image alone does not
roll out the application.

## 1. Publish the first release

Push the deployment files to `main`. In the repository's **Actions** tab,
wait for **Test and deploy Mermaid** to finish both `test` and `publish`.
The workflow can also be started manually with **Run workflow**, selecting
`main`.

The first successful run creates:

- `ghcr.io/kshyst/mermaid-web:sha-<source-commit>`
- `ghcr.io/kshyst/mermaid-api:sha-<source-commit>`
- The `deploy/production` branch, containing `manifests.yaml` and
  `release.json` with source revision and both image digests.

The workflow explicitly requests `contents: write` and `packages: write`.
Repository/organization policies must permit those permissions and creation
or updating of `deploy/production`. If an identically named package already
exists, grant this repository Actions access in that package's settings.
Do not protect the generated branch against its publishing workflow without
providing an equivalent permitted automation identity. The workflow never
force-pushes. Both tests and image builds must succeed before it advances
the deployment branch. A failed build leaves the running release unchanged.

## 2. Check the K3s server

Run on the 4 GB VPS as root:

```sh
k3s kubectl get nodes -L kubernetes.io/hostname
k3s kubectl get storageclass local-path
k3s kubectl get clusterissuer letsencrypt
k3s kubectl -n kube-system get pods -l app.kubernetes.io/name=traefik
k3s kubectl create namespace mermaid --dry-run=client -o yaml | k3s kubectl apply -f -
```

The node must have hostname label `control-1`. The manifests pin both
workloads there; the 1 GB worker is not required. `letsencrypt` must be Ready,
and Traefik and cert-manager must already be installed. Keep ports 80/443
reachable. The proxy trusts the default K3s pod CIDR `10.42.0.0/16`; adjust
`nginx.conf` before release if your cluster uses a different pod CIDR.

## 3. Allow K3s to pull the images

GHCR packages can initially be private even when the source repository is
public. Choose one approach for **both** image packages:

1. Make the packages public in GitHub package settings, if you want anyone
   to be able to download these application images. No pull secret is needed.
2. Keep them private and create a token for the image-reading account with
   `read:packages` access (and organization SSO authorization if required).
   Enter the token interactively on the server, never in Git or chat:

```bash
read -r -p "GitHub username: " GHCR_USER
read -r -s -p "GitHub token with read:packages: " GHCR_TOKEN
echo
k3s kubectl -n mermaid create secret docker-registry ghcr-pull \
  --docker-server=ghcr.io \
  --docker-username="$GHCR_USER" \
  --docker-password="$GHCR_TOKEN" \
  --dry-run=client -o yaml | k3s kubectl apply -f -
unset GHCR_TOKEN GHCR_USER
k3s kubectl -n mermaid patch serviceaccount default \
  --type=merge -p '{"imagePullSecrets":[{"name":"ghcr-pull"}]}'
```

Service account pull secrets are inherited when Kubernetes creates the pods,
even though the pods do not mount a service-account API token.

## 4. Decide whether to migrate existing data

**An empty volume starts a fresh installation.** No Compose database is
automatically copied. If keeping existing accounts, diagrams and sessions,
perform the migration section below **before** creating the Argo Application.
Do not change the domain's DNS to the new server until the data is restored.
This repository change does not stop or alter the old Compose deployment.

## 5. Bootstrap the Argo application

Download these two files from the `main` branch, or transfer them from your
workstation using SFTP. Run each apply only after its download succeeds:

```sh
curl -fL https://raw.githubusercontent.com/kshyst/mermaid/main/deploy/argocd/project.yaml \
  -o /root/mermaid-project.yaml
k3s kubectl apply -f /root/mermaid-project.yaml

curl -fL https://raw.githubusercontent.com/kshyst/mermaid/main/deploy/argocd/application.yaml \
  -o /root/mermaid-application.yaml
k3s kubectl apply -f /root/mermaid-application.yaml
```

For a private source repository, add it in Argo CD under
**Settings -> Repositories** using a read-only deploy key or credential with
repository read access; transfer the bootstrap YAML files with SFTP if raw
downloads are unauthenticated. Git repository authentication and image
registry authentication are separate.

The Argo dashboard at `https://argo.kshyst.ir` now shows **mermaid**.
It synchronizes automatically. Do not point it at `main` or at
`deploy/kubernetes`; that directory contains image templates. The
Application deliberately reads only `manifests.yaml` from `deploy/production`.

## 6. Verify the application and switch DNS

```sh
k3s kubectl -n argocd get application mermaid
k3s kubectl -n mermaid get pods,pvc,service,ingress
k3s kubectl -n mermaid rollout status deployment/diagrams-api --timeout=300s
k3s kubectl -n mermaid rollout status deployment/mermaid-studio --timeout=300s
```

Once the database is ready, point `mermaid.kshyst.ir` to the new server.
Remove a stale AAAA record if this server does not serve that IPv6 address.
Certificate issuance needs public DNS and port 80 to reach this cluster.

```sh
k3s kubectl -n mermaid wait --for=condition=Ready \
  certificate/mermaid-tls --timeout=300s
curl -I http://mermaid.kshyst.ir
curl -I https://mermaid.kshyst.ir
```

Expect an HTTP-to-HTTPS redirect and HTTPS 200. Log in, create a diagram,
reload and confirm it persists. Authentication cookies must be Secure.
Argo should report `Synced` and `Healthy`.

After the claim is bound, also retain its backing PV on accidental claim
deletion (Argo pruning/deletion of the claim is already disabled):

```sh
PV=$(k3s kubectl -n mermaid get pvc mermaid-data -o jsonpath='{.spec.volumeName}')
test -n "$PV" && k3s kubectl patch pv "$PV" \
  --type=merge -p '{"spec":{"persistentVolumeReclaimPolicy":"Retain"}}'
```

If pulling images fails, check package visibility/token and registry
connectivity. If pods stay Pending, check node selector, available resources
and storage. Start troubleshooting with:

```sh
k3s kubectl -n mermaid get events --sort-by=.metadata.creationTimestamp
k3s kubectl -n mermaid logs deployment/diagrams-api --tail=80
k3s kubectl -n mermaid logs deployment/mermaid-studio --tail=80
k3s kubectl -n mermaid get certificate,order,challenge
```

## Existing-data migration

On the **old Compose host**, from the Mermaid checkout, stop the old API
before archiving the entire data directory. This prevents missing writes or
an inconsistent database/WAL copy:

```sh
docker compose stop diagrams-api
tar -C data -czf mermaid-data.tar.gz .
chmod 600 mermaid-data.tar.gz
```

Transfer the archive to the new server with SFTP. It contains credentials;
keep it private. Keep the old API stopped during migration/cutover, or repeat
the final export after stopping it if you previously took a trial copy.

On the **new server**, after creating the namespace and registry pull secret,
download the PVC manifest and create a temporary restore pod on `control-1`:

```sh
curl -fL https://raw.githubusercontent.com/kshyst/mermaid/main/deploy/kubernetes/storage.yaml \
  -o /root/mermaid-storage.yaml
k3s kubectl -n mermaid apply -f /root/mermaid-storage.yaml
curl -fL https://raw.githubusercontent.com/kshyst/mermaid/deploy/production/release.json \
  -o /root/mermaid-release.json
API_IMAGE=$(sed -n 's/.*"api_image": "\([^"]*\)".*/\1/p' /root/mermaid-release.json)
```

Confirm `API_IMAGE` is nonempty and includes `@sha256:`. Then:

```sh
cat > /root/mermaid-restore.yaml <<EOF
apiVersion: v1
kind: Pod
metadata:
  name: mermaid-restore
  namespace: mermaid
spec:
  restartPolicy: Never
  automountServiceAccountToken: false
  nodeSelector:
    kubernetes.io/hostname: control-1
  securityContext:
    runAsUser: 10001
    runAsGroup: 10001
    fsGroup: 10001
  containers:
    - name: restore
      image: ${API_IMAGE}
      command: ["sleep", "3600"]
      volumeMounts:
        - name: data
          mountPath: /data
  volumes:
    - name: data
      persistentVolumeClaim:
        claimName: mermaid-data
EOF
k3s kubectl apply -f /root/mermaid-restore.yaml
k3s kubectl -n mermaid wait --for=condition=Ready pod/mermaid-restore --timeout=300s
```

Restore the archive into this new, empty PVC:

```sh
k3s kubectl -n mermaid exec -i mermaid-restore -- \
  tar -xz --no-same-owner -f - -C /data < /root/mermaid-data.tar.gz
k3s kubectl -n mermaid exec mermaid-restore -- python -c \
  "import sqlite3; db=sqlite3.connect('/data/diagrams.sqlite3'); print(db.execute('PRAGMA integrity_check').fetchone()); db.close()"
k3s kubectl -n mermaid exec mermaid-restore -- test -s /data/jwt-secret
k3s kubectl -n mermaid delete pod mermaid-restore
```

The integrity result must be `('ok',)`. Restored files are owned by the API's
UID 10001. Now bootstrap the Argo Application and complete verification/DNS
cutover. Do not run both installations as writers for the same public app.
If abandoning migration, leave DNS on the old host and restart its old API.

## Backups and storage limits

`/data` persists across pod updates, including JWT signing material. The
single API uses Recreate updates, so a brief API outage is expected during
deployment. Local-path storage is tied to the node and **not replicated**.
The 5 GiB PVC request is not a disk quota for local-path storage; monitor the
actual VPS disk. Never scale this SQLite API to multiple replicas.

For a live consistent SQLite snapshot:

```sh
k3s kubectl -n mermaid exec deployment/diagrams-api -- python -c \
  "import sqlite3; source=sqlite3.connect('/data/diagrams.sqlite3'); dest=sqlite3.connect('/data/diagrams-backup.sqlite3'); source.backup(dest); dest.close(); source.close()"
umask 077
mkdir -p /root/mermaid-backup
POD=$(k3s kubectl -n mermaid get pods -l app=diagrams-api -o jsonpath='{.items[0].metadata.name}')
k3s kubectl -n mermaid cp "$POD:/data/diagrams-backup.sqlite3" /root/mermaid-backup/diagrams.sqlite3
k3s kubectl -n mermaid cp "$POD:/data/jwt-secret" /root/mermaid-backup/jwt-secret
```

Keep copies off this VPS. Preserve `bootstrap-users.json` if present as well.
Do not copy only a live primary database file while WAL writes are active.
Restore only with the API stopped and automatic reconciliation disabled;
the restore-pod procedure above can then be adapted to a recovered volume.

## Updating and rollback

Push code to `main`. Follow the Actions run, then Argo's synchronization.
Argo polls Git; a small delay is normal, or click **Refresh** to check now.

For normal rollback, revert the bad source change on `main` and push. CI
tests/builds that revision and releases it using the same flow.

For emergency rollback to already-published images, use a separate local
checkout of the generated branch, revert the bad deployment commit and push
without force. Argo applies the previous digest references. Pause new
workflow releases while investigating so a subsequent main build does not
overwrite the emergency rollback. `kubectl rollout undo` alone is temporary:
Argo self-healing restores whatever is in Git. Database backups are separate
from image rollback; an old image may not support a newer database schema.
