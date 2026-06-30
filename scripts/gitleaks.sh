#!/usr/bin/env sh
# Block commits that contain secrets. Scans only staged changes.
# Prefers a local gitleaks binary; falls back to the gitleaks Docker image.
set -e

if command -v gitleaks >/dev/null 2>&1; then
  gitleaks git --staged --redact -v .
elif command -v docker >/dev/null 2>&1; then
  docker run --rm -v "$(pwd):/repo" -w /repo zricethezav/gitleaks:latest \
    git --staged --redact -v .
else
  echo "ERROR: install gitleaks (https://gitleaks.io) or Docker to scan for secrets." >&2
  exit 1
fi
