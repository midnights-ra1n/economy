#!/bin/sh
# Installs the latest release of @REPOSITORY@, as root, when the admin panel asks for it (economy-update.path).
# Only ever this repository's package, and only a newer version: the request file carries no input.
set -eu
DIR=/var/lib/economy
STATUS=$DIR/update-status
DEB=$(mktemp --suffix=.deb)
ok=
status() {
  printf '%s\n' "$1" > "$STATUS.tmp" && chown economy:economy "$STATUS.tmp" && mv "$STATUS.tmp" "$STATUS"
}
trap 'rm -f "$DEB"; [ "$ok" ] || status error' EXIT
# First, or the path unit would start this again once it ends.
rm -f "$DIR/update-request"
status running

curl -fsSL --retry 3 -o "$DEB" "https://github.com/@REPOSITORY@/releases/latest/download/economy_$(dpkg --print-architecture).deb"
[ "$(dpkg-deb -f "$DEB" Package)" = economy ]
NEW=$(dpkg-deb -f "$DEB" Version)
if dpkg --compare-versions "$NEW" gt "$(dpkg-query -W -f '${Version}' economy)"; then
  echo "Installing economy $NEW"
  # confold: a locally edited /etc/economy/economy.env is kept without asking.
  DEBIAN_FRONTEND=noninteractive apt-get install -y -o Dpkg::Options::=--force-confold "$DEB"
fi
ok=1
rm -f "$STATUS"
