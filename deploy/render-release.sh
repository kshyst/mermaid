#!/bin/sh
# Render only immutable, fully qualified image references into a release.
set -eu

if [ "$#" -ne 2 ]; then
    echo "Usage: $0 ghcr.io/owner/web@sha256:HASH ghcr.io/owner/api@sha256:HASH" >&2
    exit 2
fi

for image in "$@"; do
    case "$image" in
        *[!a-z0-9./:@_-]*)
            echo "Invalid characters in image reference" >&2
            exit 2
            ;;
    esac
    if ! printf '%s\n' "$image" | LC_ALL=C grep -Eq '^ghcr\.io/[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}$'; then
        echo "Expected an immutable GHCR image digest, got: $image" >&2
        exit 2
    fi
done

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
release_dir=$(mktemp -d)
trap 'rm -rf "$release_dir"' EXIT HUP INT TERM
cp -R "$script_dir/kubernetes/." "$release_dir/"

cat >> "$release_dir/kustomization.yaml" <<EOF
images:
  - name: mermaid-web
    newName: ${1%@*}
    digest: ${1#*@}
  - name: mermaid-api
    newName: ${2%@*}
    digest: ${2#*@}
EOF

kubectl kustomize "$release_dir"
