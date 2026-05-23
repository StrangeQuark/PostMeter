#!/usr/bin/env bash
set -euo pipefail

if [[ "$(uname -s)" != "Linux" ]]; then
  echo "Linux sandbox backend setup is only required on Linux."
  exit 0
fi

sudo apt-get update
sudo apt-get install -y bubblewrap apparmor apparmor-utils

if [[ -x /usr/bin/bwrap ]]; then
  BWRAP_PATH="/usr/bin/bwrap"
else
  BWRAP_PATH="$(command -v bwrap || true)"
fi

if [[ -z "${BWRAP_PATH}" || ! -x "${BWRAP_PATH}" ]]; then
  echo "bubblewrap was not installed or is not executable." >&2
  exit 1
fi

case "${BWRAP_PATH}" in
  /usr/bin/bwrap|/bin/bwrap) ;;
  *)
    echo "Unexpected bubblewrap path: ${BWRAP_PATH}" >&2
    exit 1
    ;;
esac

if [[ -d /etc/apparmor.d ]] && command -v apparmor_parser >/dev/null 2>&1; then
  sudo tee /etc/apparmor.d/bwrap >/dev/null <<EOF
abi <abi/4.0>,
include <tunables/global>

profile bwrap ${BWRAP_PATH} flags=(unconfined) {
  userns,
  include if exists <local/bwrap>
}
EOF

  if ! sudo apparmor_parser -r /etc/apparmor.d/bwrap; then
    echo "AppArmor bwrap profile could not be loaded; continuing to sandbox preflight." >&2
  fi
fi

if ! "${BWRAP_PATH}" --unshare-all --unshare-user --disable-userns --assert-userns-disabled --cap-drop ALL --die-with-parent --new-session --clearenv --ro-bind / / --tmpfs /tmp --tmpfs /run /bin/true; then
  echo "bubblewrap cannot create the required sandbox namespaces on this runner." >&2
  "${BWRAP_PATH}" --version >&2 || true
  sysctl kernel.apparmor_restrict_unprivileged_userns kernel.apparmor_restrict_unprivileged_unconfined kernel.unprivileged_userns_clone user.max_user_namespaces >&2 || true
  exit 1
fi

echo "Linux bubblewrap sandbox backend is installed and namespace preflight passed."
