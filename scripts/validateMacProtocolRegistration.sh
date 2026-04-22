#!/usr/bin/env bash
set -euo pipefail

release_dir="${1:-release}"
validated=0
tmp_root="$(mktemp -d "${TMPDIR:-/tmp}/postmeter-mac-protocol.XXXXXX")"

cleanup() {
  for mount_dir in "$tmp_root"/mount-*; do
    if [[ -d "$mount_dir" ]]; then
      hdiutil detach "$mount_dir" -quiet >/dev/null 2>&1 || true
    fi
  done
  rm -rf "$tmp_root"
}
trap cleanup EXIT

validate_app() {
  local app_path="$1"
  local plist_path="$app_path/Contents/Info.plist"
  if [[ ! -f "$plist_path" ]]; then
    echo "Missing Info.plist in $app_path" >&2
    return 1
  fi
  if ! plutil -convert xml1 -o - "$plist_path" | grep -A40 "CFBundleURLSchemes" | grep -q "<string>postmeter</string>"; then
    echo "$plist_path does not register the postmeter URL scheme" >&2
    return 1
  fi
  if [[ -x "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister" ]]; then
    "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister" -f "$app_path"
  fi
  echo "Validated macOS postmeter:// registration metadata in $app_path"
  validated=$((validated + 1))
}

while IFS= read -r -d '' app_path; do
  validate_app "$app_path"
done < <(find "$release_dir" -maxdepth 3 -name "PostMeter.app" -type d -print0 2>/dev/null || true)

while IFS= read -r -d '' zip_path; do
  unzip_dir="$tmp_root/zip-$(basename "$zip_path" .zip)"
  mkdir -p "$unzip_dir"
  unzip -q "$zip_path" -d "$unzip_dir"
  while IFS= read -r -d '' app_path; do
    validate_app "$app_path"
  done < <(find "$unzip_dir" -name "PostMeter.app" -type d -print0)
done < <(find "$release_dir" -maxdepth 1 -name "*.zip" -type f -print0 2>/dev/null || true)

while IFS= read -r -d '' dmg_path; do
  mount_dir="$tmp_root/mount-$(basename "$dmg_path" .dmg)"
  mkdir -p "$mount_dir"
  hdiutil attach "$dmg_path" -nobrowse -readonly -mountpoint "$mount_dir" -quiet
  while IFS= read -r -d '' app_path; do
    validate_app "$app_path"
  done < <(find "$mount_dir" -maxdepth 2 -name "PostMeter.app" -type d -print0)
  hdiutil detach "$mount_dir" -quiet
done < <(find "$release_dir" -maxdepth 1 -name "*.dmg" -type f -print0 2>/dev/null || true)

if [[ "$validated" -eq 0 ]]; then
  echo "No macOS PostMeter.app bundle found in $release_dir." >&2
  exit 1
fi

echo "Validated $validated macOS app bundle(s) for postmeter:// protocol registration."
