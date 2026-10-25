#!/bin/sh
# Packages the standalone build as a .deb, with its own Node.js (Debian and Ubuntu ship older ones).
# Usage: STANDALONE=1 pnpm build && scripts/build-deb.sh <version> <owner/repo>   (used by .github/workflows/release.yml)
# Writes economy_<version>_<arch>.deb for the machine's architecture (amd64 or arm64).
set -eu
VERSION=$1
REPOSITORY=$2
ARCH=$(dpkg --print-architecture)
ROOT=$(mktemp -d)
APP=$ROOT/usr/lib/economy

mkdir -p "$APP/bin" "$APP/.next" "$ROOT/etc/economy" "$ROOT/lib/systemd/system" "$ROOT/DEBIAN"
cp -a .next/standalone/. "$APP/"
cp -a .next/static "$APP/.next/static"
cp -a public assets "$APP/"
cp "$(command -v node)" "$APP/bin/node"
install -m 644 packaging/deb/economy.env "$ROOT/etc/economy/economy.env"
sed -e "s|@VERSION@|$VERSION|g" -e "s|@REPOSITORY@|$REPOSITORY|g" packaging/deb/economy.service > "$ROOT/lib/systemd/system/economy.service"
install -m 644 packaging/deb/economy-update.path packaging/deb/economy-update.service "$ROOT/lib/systemd/system/"
sed "s|@REPOSITORY@|$REPOSITORY|g" packaging/deb/update.sh > "$APP/update.sh" && chmod 755 "$APP/update.sh"
install -m 755 packaging/deb/postinst packaging/deb/prerm packaging/deb/postrm "$ROOT/DEBIAN/"
# A conffile is never overwritten by an upgrade: ORIGIN and the other settings survive it.
echo /etc/economy/economy.env > "$ROOT/DEBIAN/conffiles"
cat > "$ROOT/DEBIAN/control" <<CONTROL
Package: economy
Version: $VERSION
Architecture: $ARCH
Maintainer: $REPOSITORY <https://github.com/$REPOSITORY>
Homepage: https://github.com/$REPOSITORY
Depends: systemd, passwd, curl, ca-certificates
Section: web
Priority: optional
Installed-Size: $(du -sk "$ROOT" | cut -f1)
Description: Personal budget web app (PWA)
 Accounts, subscriptions, planned spending and balance forecasts, with passkeys.
 Data is kept in /var/lib/economy across upgrades.
CONTROL

dpkg-deb --build --root-owner-group "$ROOT" "economy_${VERSION}_${ARCH}.deb"
rm -rf "$ROOT"
