#!/bin/bash

# Wrapper script for forge deploy that ensures build timestamp is always generated
# Usage: ./scripts/forge-deploy.sh [forge deploy arguments]

echo "🔄 Generating build timestamp..."
node scripts/generate-build-timestamp.js

if [ $? -ne 0 ]; then
  echo "❌ Failed to generate build timestamp. Aborting deployment."
  exit 1
fi

echo "🚀 Running forge deploy..."
forge deploy "$@"

