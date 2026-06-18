#!/usr/bin/env bash
# Compile-check iOS after cap sync (macOS / Codemagic only).
set -eo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "[compile-check-ios] skip: requires macOS with Xcode"
  exit 0
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROJECT="${XCODE_PROJECT:-ios/App/App.xcodeproj}"
SCHEME="${XCODE_SCHEME:-App}"

cd "$ROOT"
mkdir -p /tmp/xcodebuild_logs

echo "[compile-check-ios] building $SCHEME (iphonesimulator, unsigned)"
xcodebuild build \
  -project "$ROOT/$PROJECT" \
  -scheme "$SCHEME" \
  -configuration Debug \
  -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGN_IDENTITY="" \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGNING_ALLOWED=NO \
  2>&1 | tee /tmp/xcodebuild_logs/compile-check.log

echo "[compile-check-ios] success"
