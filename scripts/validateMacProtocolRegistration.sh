#!/usr/bin/env bash
set -euo pipefail

release_dir="${1:-release}"
validated=0
launches=0
tmp_root="$(mktemp -d "${TMPDIR:-/tmp}/postmeter-mac-protocol.XXXXXX")"

if [[ -n "${POSTMETER_VALIDATION_ARTIFACT_DIR:-}" ]]; then
  mkdir -p "$POSTMETER_VALIDATION_ARTIFACT_DIR"
  exec > >(tee -a "$POSTMETER_VALIDATION_ARTIFACT_DIR/mac-protocol-validation.log") 2>&1
  echo "macOS protocol validation log for release_dir=$release_dir"
fi

cleanup() {
  stop_postmeter_processes
  for mount_dir in "$tmp_root"/mount-*; do
    if [[ -d "$mount_dir" ]]; then
      hdiutil detach "$mount_dir" -quiet >/dev/null 2>&1 || true
    fi
  done
  rm -rf "$tmp_root"
}
trap cleanup EXIT

stop_postmeter_processes() {
  osascript -e 'tell application id "com.strangequark.postmeter" to quit' >/dev/null 2>&1 || true
  pkill -x PostMeter >/dev/null 2>&1 || true
}

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
  validate_protocol_launch "$app_path"
  echo "Validated macOS postmeter:// registration metadata in $app_path"
  validated=$((validated + 1))
}

validate_protocol_launch() {
  local app_path="$1"
  local expected_executable="$app_path/Contents/MacOS/PostMeter"
  local url="postmeter://oauth/callback?code=release-validation&state=release-validation"
  local launch_seen=0
  stop_postmeter_processes
  if ! open -g -b "com.strangequark.postmeter" "$url"; then
    echo "Launch Services did not accept a postmeter:// launch for PostMeter." >&2
    return 1
  fi
  local deadline=$((SECONDS + 20))
  while [[ "$SECONDS" -lt "$deadline" ]]; do
    local pid=""
    pid="$(pgrep -x PostMeter | head -n 1 || true)"
    if [[ -n "$pid" ]]; then
      local launched_command=""
      launched_command="$(ps -p "$pid" -o command= 2>/dev/null | sed 's/^[[:space:]]*//' || true)"
      if [[ -z "$launched_command" ]]; then
        launched_command="$(ps -p "$pid" -o comm= 2>/dev/null | sed 's/^[[:space:]]*//' || true)"
      fi
      if [[ "$launched_command" != "$expected_executable"* ]]; then
        echo "Launch Services started $launched_command instead of $expected_executable." >&2
        stop_postmeter_processes
        return 1
      fi
      launch_seen=1
      break
    fi
    sleep 1
  done
  if [[ "$launch_seen" -ne 1 ]]; then
    echo "Launch Services accepted postmeter:// but PostMeter did not launch." >&2
    return 1
  fi
  stop_postmeter_processes
  launches=$((launches + 1))
  echo "Validated macOS postmeter:// protocol launch through Launch Services for $app_path."
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

echo "Validated $validated macOS app bundle(s) and $launches Launch Services protocol launch(es)."
