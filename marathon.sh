#!/bin/bash
# Marathon direct-deploy runner.
# Restarts the server automatically when an in-app update triggers exit code 42.
# Usage: ./marathon.sh

set -e

cd "$(dirname "$0")"

while true; do
  node backend/src/index.js
  EXIT_CODE=$?
  if [ $EXIT_CODE -ne 42 ]; then
    echo "Marathon exited with code $EXIT_CODE. Stopping."
    exit $EXIT_CODE
  fi
  echo "Update complete — restarting Marathon..."
done
