# Economy

**A self-hosted personal budget app that tells you how much you'll have left at the end of the month.**

Track your accounts, subscriptions and spending, plan one-off expenses, and see your balance six months ahead, with a warning before a savings account drops below the floor you set. It installs as an app on your phone and computer (PWA), and the data lives on your own server.

<p align="center">
  <img src="docs/screenshot-desktop.png" alt="Dashboard on desktop" width="68%">
  &nbsp;
  <img src="docs/screenshot-mobile.png" alt="Dashboard on a phone, dark mode" width="24%">
</p>

## Features

**Budget**
- Current and savings accounts, each with an optional **minimum balance rule** ("my savings never go below €1,000")
- Expenses, income and transfers between accounts, with categories
- **Monthly subscriptions, salary and recurring transfers**, posted automatically on their day (missed months are caught up)
- **Planned one-off expenses**, ticked off once paid
- **End-of-month forecast** and a **6-month projection**, with an alert when a rule is about to be broken
- A month calendar of scheduled debits (tap a day to see its items) and a spending curve compared with last month

**Everyday use**
- Add a transaction in a few taps from anywhere, with the **+** button
- Installable **PWA** for desktop and mobile, light and dark mode
- **French and English**, per user, with the browser language as the default
- Display currency of your choice: euro by default, also US dollar, pound, Swiss franc, Canadian dollar, yen
- **Import / export**: full JSON backup (restorable), transactions as CSV for Excel or LibreOffice

**Accounts and security**
- Username and password sign-in, with **optional passkeys** (Face ID, Touch ID, Windows Hello)
- **Several users**, each with their own private data, and an **admin panel**
- No secret stored in clear text, brute-force protection, data erased for real when deleted
- One **SQLite** file through Node's built-in `node:sqlite` module, with no native dependency

## Quick start (Docker Compose)

```bash
git clone https://github.com/midnights-ra1n/economy.git && cd economy
ORIGIN=https://budget.example.com docker compose up -d --build
docker compose logs economy        # shows the setup code
```

Open the URL, type the **setup code** from the logs, and choose your username and password. That first account is the **administrator**.

The setup code is regenerated at every start until an account exists, then disappears. Nobody can sign up on their own afterwards: the administrator creates the other accounts.

> To try it locally, run `docker compose up -d --build` without `ORIGIN` and open http://localhost:3000.

## Other ways to run it

### `docker run`

```bash
docker build -t economy .
docker run -d --name economy -p 3000:3000 \
  -e ORIGIN=https://budget.example.com \
  -v economy-data:/data \
  economy
```

Always pass the same named volume (`-v economy-data:/data`). Without it, every new container starts from an empty database.

### Proxmox LXC container (OCI image)

The image is a standard OCI image, and Proxmox VE 9.1 or later can create an LXC container from an OCI archive.

1. Build the archive on a machine with Docker or Podman. `--platform` matters on Apple Silicon Macs, because Proxmox servers are x86-64.

   ```bash
   docker build --platform linux/amd64 -t economy .
   docker save economy -o economy-oci.tar      # Docker 25+ writes an OCI archive
   # or: podman build --platform linux/amd64 -t economy . && podman save --format oci-archive -o economy-oci.tar economy
   ```

2. In Proxmox, upload `economy-oci.tar` to a storage under **CT Templates → Upload**.
3. Create the container (**Create CT**) from that template.
4. Prepare a host folder that belongs to the app's user. The app runs as `node` (uid 1000), which is uid 101000 on the host for an unprivileged container. Then mount it on `/data`:

   ```bash
   mkdir -p /srv/economy && chown 101000:101000 /srv/economy
   pct set <id> -mp0 /srv/economy,mp=/data
   ```

   A bind mount from the host is never deleted with the container. Avoid a Proxmox-managed volume, which is destroyed along with the container.
5. Add the environment variable `ORIGIN=https://budget.example.com` in the container options. `DATA_DIR`, `PORT` and `TZ` are already set by the image.
6. Start the container. The setup code appears in its console.

To update, create a container from the new image with the same mount: it finds all the data.

### Without Docker

Requires Node.js 24 or later and pnpm.

```bash
pnpm install
pnpm build
ORIGIN=http://localhost:3000 pnpm start
```

The database is created in `./data` (change it with `DATA_DIR`).

## Configuration

| Variable   | Default                          | Purpose                                                                 |
| ---------- | -------------------------------- | ----------------------------------------------------------------------- |
| `ORIGIN`   | `http://localhost:3000`          | Exact public URL, no trailing slash. Passkeys are bound to this domain. |
| `DATA_DIR` | `./data` (`/data` in Docker)     | Folder of the SQLite database.                                          |
| `TZ`       | `Europe/Paris` in Docker         | Time zone used for monthly due dates.                                   |
| `PORT`     | `3000`                           | HTTP port.                                                              |

## Putting it online

- **HTTPS is required** for passkeys and for installing the PWA (only `localhost` is exempt). Put the app behind a reverse proxy that handles TLS. With Caddy, this is enough:

  ```
  budget.example.com {
      reverse_proxy localhost:3000
  }
  ```

- The proxy must forward the original `Host` header. Next.js server actions reject requests whose `Origin` does not match the host (CSRF protection).
- `ORIGIN` must match the URL typed in the browser exactly. If you change domains, existing passkeys stop working.
- The proxy must forward `X-Forwarded-For` (or `X-Real-IP`): sign-in attempts are rate-limited per IP address. Caddy, Traefik and nginx (with `proxy_set_header`) all do this.

## Data, updates and backups

The database is the app's only state. It lives in `/data`, outside the image, so replacing the image never touches it.

- **Docker Compose**: the named volume `economy-data` survives restarts, `docker compose up -d --build` and `docker compose pull`. Only `docker compose down -v` deletes it, so never add `-v`.
- **Schema updates**: a new version upgrades the existing database in place at startup (the version is tracked in `PRAGMA user_version`), keeping all data. For example, a single-user install became multi-user, and its owner became the administrator.
- **Check**: every start logs `[economy] Database /data/economy.db: N user(s).`, with a warning if `/data` is not a mounted volume. The admin panel also shows **Storage: Persistent** or **Ephemeral**.
- **Backups**: **Settings → Export a backup (JSON)** for your own data, or copy the whole database: `sqlite3 /data/economy.db ".backup economy-backup.db"`. Export before a major update.

## Users and administration

- Each user sees only their own accounts, transactions and plans, and their exports contain only their data.
- The administrator reaches the panel from **Admin** (top bar on desktop, or **Settings → Administration** on mobile). It shows instance statistics, and for each user lets you:
  - change their role
  - set a new password, which signs them out everywhere
  - sign them out of all their devices
  - **erase their banking data** while keeping their login
  - delete them
- An administrator can neither demote nor delete themselves, so there is always at least one administrator.
- **Reset the app**, at the bottom of the admin panel, deletes every user and all data. It asks you to type `RESET` (or `RÉINITIALISER`) and your password, then prints a new setup code in the logs.
- Every user can also erase their own banking data from **Settings**, with their password.

## Languages

The interface is available in **French and English**. Each user picks a language in **Settings → Language and currency**. Before signing in, the app follows the browser language, and the login page has a language switch.

Strings live in [`lib/i18n.ts`](lib/i18n.ts). To add a language, add a dictionary there with the same keys (TypeScript flags any missing one) and register it in `LOCALES`.

## Security

- No secret is readable in the database. Passwords are hashed with salted **scrypt**; the setup code and session tokens with SHA-256.
- The database is never served over the web. Its folder is `700` and its files `600`, so only the app's system user can read them.
- After 5 failed sign-ins, an IP address is locked out for 15 minutes.
- Sessions are random tokens in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` over HTTPS) and expire after 30 days. Changing a password signs out the other devices.
- WebAuthn challenges are stored server-side, single-use, and expire after 5 minutes.
- Every page and server action checks the session again, and admin actions check the role again. Every query on banking data is filtered by user, and account ids sent by forms are verified.
- Deleted data is overwritten (`PRAGMA secure_delete`). A full reset also empties the WAL journal and compacts the database.
- Security headers are set (HSTS, `X-Frame-Options`, `nosniff`, …), and the app asks search engines not to index it.

## Development

```bash
pnpm dev      # http://localhost:3000
pnpm test     # unit tests: forecast, backup format, migrations, translations
pnpm lint
```

Built with Next.js 16 (App Router, server actions), React 19, Tailwind CSS 4, `node:sqlite` and `@simplewebauthn`. Fonts: Geist and Geist Mono.

```
app/(app)/     signed-in pages: dashboard, transactions, planning, accounts, settings, admin
app/login/     setup, sign-in and passkeys
lib/db.ts      SQLite connection, schema migrations, setup code
lib/auth.ts    sessions, passwords, rate limiting
lib/budget.ts  per-user budget queries
lib/forecast.ts  projection logic (pure, tested)
lib/i18n.ts    French and English strings
```
