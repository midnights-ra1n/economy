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
- Current and savings accounts across **several banks**, each with an optional **minimum balance rule** ("my savings never go below €1,000")
- French savings products: **Livret A** and **Livret Jeune** with their legal ceilings, **PEA** (ceiling on deposits, not on value), other savings with a ceiling of your own. Every ceiling can be changed, and the forecast warns before a scheduled transfer goes over it
- **Meal vouchers** (Swile and others) as their own account type. Swile has no public API: add the monthly top-up as a recurring income and your meals as expenses
- Expenses, income and transfers between accounts, with categories
- **Monthly subscriptions, salary and recurring transfers**, posted automatically on their day (missed months are caught up)
- **Planned one-off expenses**, ticked off once paid
- **End-of-month forecast** and a **6-month projection**, with an alert when a rule is about to be broken
- **Nextcloud calendar** (or any CalDAV server): subscriptions and bills become repeating events with their reminders, kept up to date
- A month calendar of scheduled debits (tap a day to see its items) and a spending curve compared with last month

**Statements**
- **Account statements as PDFs**: opening and closing balances, money in and out, every transaction with its running balance, spending by category
- Made on demand for a month, a week or any range, or **automatically every week or month**
- **Sent by e-mail** with the PDF attached, through a mail server set up in the admin panel
- All statements in one place, ready to download, with optional **automatic cleanup** (after 3, 6, 12 or 24 months)

**Everyday use**
- Add a transaction in a few taps from anywhere, with the **+** button
- Installable **PWA** for desktop and mobile, light and dark mode
- **MCP server** so AI assistants (Claude, ChatGPT, Cursor…) can read your budget and, if you allow it, add transactions ([details](#mcp-server-ai-assistants))
- **French and English**, per user, with the browser language as the default
- Display currency of your choice: euro by default, also US dollar, pound, Swiss franc, Canadian dollar, yen
- **Import / export**: full JSON backup (restorable), transactions as CSV for Excel or LibreOffice

**Accounts and security**
- Username and password sign-in, with **optional passkeys** (Face ID, Touch ID, Windows Hello)
- **Several users**, each with their own private data, and an **admin panel**
- No secret stored in clear text, brute-force protection, data erased for real when deleted
- One **SQLite** file through Node's built-in `node:sqlite` module, with no native dependency

## Quick start (Docker Compose)

A ready-made image is published on `ghcr.io/midnights-ra1n/economy` for **x86-64** (PCs, servers, Proxmox) and **arm64** (Raspberry Pi, Apple Silicon Macs). Docker picks the right one on its own. You only need the compose file:

```bash
mkdir economy && cd economy
curl -O https://raw.githubusercontent.com/midnights-ra1n/economy/stable/docker-compose.yml
ORIGIN=https://budget.example.com docker compose up -d
```

Open the URL and create your account: the first one is the **administrator**.

For safety, the account creation screen only stays open for **10 minutes after the container starts**. If no account is created by then, it locks, so a stranger who finds a fresh install cannot claim it. Restart the container to reopen it. Once the first account exists, nobody can sign up on their own: the administrator creates the other accounts.

> To try it locally, run `docker compose up -d` without `ORIGIN` and open http://localhost:3000.

## Other ways to run it

### `docker run`

```bash
docker run -d --name economy -p 3000:3000 \
  -e ORIGIN=https://budget.example.com \
  -v economy-data:/data \
  ghcr.io/midnights-ra1n/economy:latest
```

Always pass the same named volume (`-v economy-data:/data`). Without it, every new container starts from an empty database.

### Raspberry Pi

The same commands work on a Raspberry Pi 3, 4 or 5 running a **64-bit** system: Raspberry Pi OS 64-bit, the default on recent images, or Ubuntu. Check with `uname -m`, which must print `aarch64`. 32-bit systems are not supported, because Node.js 24 no longer ships for 32-bit ARM.

Install Docker with `curl -fsSL https://get.docker.com | sh`, then follow the quick start. Prefer an SSD to the SD card for `/data` if you can: SQLite writes often, and SD cards wear out.

### Proxmox LXC container (OCI image)

The image is a standard OCI image, and Proxmox VE 9.1 or later can create an LXC container from it.

1. Get the image into a storage's **CT Templates**, either way:
   - **Pull from OCI Registry** with the reference `ghcr.io/midnights-ra1n/economy:latest` (or a version such as `:0.1.3`);
   - or build an archive yourself and **Upload** it. `--platform` matters on Apple Silicon Macs, because Proxmox servers are x86-64:

     ```bash
     docker build --platform linux/amd64 -t economy .
     docker save economy -o economy-oci.tar      # Docker 25+ writes an OCI archive
     ```

2. Create the container (**Create CT**) from that template.
3. Prepare a host folder that belongs to the app's user. The app runs as `node` (uid 1000), which is uid 101000 on the host for an unprivileged container. Then mount it on `/data`:

   ```bash
   mkdir -p /srv/economy && chown 101000:101000 /srv/economy
   pct set <id> -mp0 /srv/economy,mp=/data
   ```

   A bind mount from the host is never deleted with the container. Avoid a Proxmox-managed volume, which is destroyed along with the container.
4. Add the environment variable `ORIGIN=https://budget.example.com` in the container options. `DATA_DIR`, `PORT` and `TZ` are already set by the image.
5. Start the container and create your account in the browser within 10 minutes (restart the container if you miss it).

   Proxmox keeps no container logs, and the **Console** tab only shows what the app prints after you open it, in **console** mode (`pct set <id> --cmode console`, then restart). The app's messages are also written to `/data/economy.log`, which you can read from the host: `cat /srv/economy/economy.log`.

To update, create a container from the new image with the same mount: it finds all the data.

### Debian / Ubuntu package (.deb, no Docker)

Every release also ships a `.deb` for **amd64** and **arm64** (Raspberry Pi OS 64-bit included). It bundles its own Node.js, so nothing else is needed: Debian 11+, Ubuntu 22.04+, with systemd.

```bash
curl -fLo /tmp/economy.deb https://github.com/midnights-ra1n/economy/releases/latest/download/economy_$(dpkg --print-architecture).deb
sudo apt install /tmp/economy.deb
```

The package installs a `economy` systemd service (enabled and started, port 3000) running as its own `economy` system user. Then:

1. set your public URL in `/etc/economy/economy.env` (`ORIGIN=https://budget.example.com`, plus any [variable](#configuration));
2. `sudo systemctl restart economy`, which also reopens the 10-minute account creation window.

| What        | Where                                                        |
| ----------- | ------------------------------------------------------------ |
| App         | `/usr/lib/economy`                                           |
| Settings    | `/etc/economy/economy.env`, kept across upgrades             |
| Data        | `/var/lib/economy` (database, `economy.log`)                 |
| Logs        | `journalctl -u economy`                                      |

**Updating**: when a new release is out, the admin panel shows an **Install version …** button. It downloads that release's package from GitHub, installs it and restarts the app; the page reloads on its own once it is back. The database is upgraded in place and `/etc/economy/economy.env` is left untouched. Installing by hand with the two commands above does the same.

The app itself runs unprivileged and cannot install anything: the button only drops a request file in `/var/lib/economy`, which a root systemd unit (`economy-update.path` → `economy-update.service`) watches. That unit only ever installs this repository's latest `economy` package, and only if it is newer. Its log: `journalctl -u economy-update`. `apt remove economy` stops the service; even `apt purge economy` keeps `/var/lib/economy`, which you delete yourself.

### From source

To build the image yourself, add `build: .` under the `economy` service of `docker-compose.yml` and run `docker compose up -d --build` from a clone of the repository.

Without Docker, you need Node.js 24 or later and pnpm:

```bash
pnpm install
pnpm build
ORIGIN=http://localhost:3000 pnpm start
```

The database is created in `./data` (change it with `DATA_DIR`).

## Configuration

| Variable   | Default                          | Purpose                                                                 |
| ---------- | -------------------------------- | ----------------------------------------------------------------------- |
| `ORIGIN`   | `http://localhost:3000`          | Exact public URL, no trailing slash, `https://` outside localhost. Passkeys are bound to its domain; the MCP server only works over https. |
| `DATA_DIR` | `./data` (`/data` in Docker, `/var/lib/economy` with the .deb) | Folder of the SQLite database.                                          |
| `TZ`       | `Europe/Paris` in Docker         | Time zone used for monthly due dates.                                   |
| `PORT`     | `3000`                           | HTTP port.                                                              |
| `HOSTNAME` | all interfaces                   | Set `127.0.0.1` when a reverse proxy runs on the same machine (not Docker). |
| `UPDATE_CHECK` | `true`                       | Set to `false` to stop checking GitHub for new releases.                |
| `SETUP_WINDOW_MINUTES` | `10`                 | How long the first-account screen stays open after a start or a reset.  |

## Putting it online (HTTPS)

**HTTPS is required** as soon as the app is reachable by anything but the machine it runs on:

| Feature | Without HTTPS |
| ------- | ------------- |
| **Passkeys** (WebAuthn) | refused by the browser |
| **Installing the PWA**, push notifications | refused by the browser |
| **MCP server** | refused by the app itself (HTTP 403): a bearer token in clear text is a password in clear text |
| Session cookie | not marked `Secure` |

`http://localhost` is the only exception, so you can try everything on the machine itself. For a phone or another computer on your network, use a real domain with a certificate (Let's Encrypt, a [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/), `tailscale serve`…): a bare `http://192.168.x.x:3000` will not work.

The app itself speaks plain HTTP on port 3000 and **does not handle certificates**. A reverse proxy in front of it does, whichever way you run it. Three rules for that proxy:

1. **`ORIGIN`** is the exact public URL, `https://budget.example.com`, no trailing slash. It sets the passkey domain and the MCP address, and the app checks it against the `Host` header.
2. It forwards the original **`Host`** header (Next.js server actions reject a mismatched `Origin`, and `/mcp` rejects a wrong `Host`).
3. It forwards **`X-Forwarded-For`** (sign-in and token attempts are rate-limited per IP) and **`X-Forwarded-Proto`**. Caddy, Traefik and nginx with `proxy_set_header` do.

Changing the domain later breaks existing passkeys: they are bound to it.

### With Docker

The simplest setup is [Caddy](https://caddyserver.com), which gets and renews the certificate on its own. You need a domain pointing at your server and ports 80 and 443 open. Edit `docker-compose.yml`: remove the `ports:` of `economy` (the proxy reaches it on the Docker network, nothing else can) and add a `caddy` service:

```yaml
services:
  economy:
    image: ghcr.io/midnights-ra1n/economy:latest
    restart: unless-stopped
    environment:
      ORIGIN: https://budget.example.com
      TZ: Europe/Paris
    volumes:
      - economy-data:/data

  caddy:
    image: caddy:2
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddy-data:/data   # certificates: keep them across restarts

volumes:
  economy-data:
    name: economy-data
  caddy-data:
```

and next to it a `Caddyfile`:

```
budget.example.com {
    reverse_proxy economy:3000
}
```

Caddy sends `Host`, `X-Forwarded-For` and `X-Forwarded-Proto` by itself. Then `docker compose up -d`; the first request to the domain may take a few seconds while the certificate is issued.

Already have a proxy (Traefik, Nginx Proxy Manager, Synology, a Cloudflare Tunnel…)? Keep the app's `ports:` as `"127.0.0.1:3000:3000"` (or none, on a shared Docker network) and point the proxy at `economy:3000`. Do not publish port 3000 to the Internet: it would also serve the app without HTTPS.

With plain `docker run`, use `-p 127.0.0.1:3000:3000` and a proxy on the host (see below).

### Without Docker (.deb, or from source)

The `.deb` listens on all interfaces by default. Put the proxy on the same machine and make the app listen on localhost only:

1. in `/etc/economy/economy.env`, set `ORIGIN=https://budget.example.com` and uncomment `HOSTNAME=127.0.0.1`;
2. install a proxy. With Caddy ([install](https://caddyserver.com/docs/install#debian-ubuntu-raspbian)), `/etc/caddy/Caddyfile`:

   ```
   budget.example.com {
       reverse_proxy 127.0.0.1:3000
   }
   ```

3. `sudo systemctl restart economy caddy`, and open ports 80 and 443 on your firewall or router (80 is needed to obtain the certificate).

With nginx and certbot instead (`sudo certbot --nginx -d budget.example.com` adds the certificate and the redirect), the site's `location /` block needs:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

From source (`pnpm start`), run it the same way: `HOSTNAME=127.0.0.1 ORIGIN=https://budget.example.com pnpm start`, behind the same proxy.

**Check it**: open `https://budget.example.com`, sign in, add a passkey in **Settings → Passkeys**. If the browser refuses, `ORIGIN` does not match the address bar. Check MCP with `curl -i -X POST https://budget.example.com/mcp`: `401` means it is reachable and wants a token; `403` says why it refuses (HTTPS, Host or Origin).

## MCP server (AI assistants)

The app speaks the [Model Context Protocol](https://modelcontextprotocol.io) (Streamable HTTP transport, stateless, protocol versions 2024-11 to 2025-11) at **`https://budget.example.com/mcp`**. Any compliant client can use it: Claude, ChatGPT, Cursor, VS Code, Gemini CLI, Zed…

1. Over HTTPS (see above), go to **Settings → AI assistants (MCP)**.
2. Name a token (for example "Claude"), choose **Read only** or **Read and add**, and create it. It is shown **once**: copy it.
3. Give your client the address and the header `Authorization: Bearer <token>`:

   ```bash
   # Claude Code
   claude mcp add --transport http economy https://budget.example.com/mcp \
     --header "Authorization: Bearer eco_..."
   ```

   ```jsonc
   // Cursor (.cursor/mcp.json), VS Code (.vscode/mcp.json, key "servers"), Gemini CLI… same shape
   { "mcpServers": { "economy": { "url": "https://budget.example.com/mcp", "headers": { "Authorization": "Bearer eco_..." } } } }
   ```

   ```jsonc
   // Clients that only run local (stdio) servers, such as Claude Desktop, go through the mcp-remote bridge
   { "mcpServers": { "economy": { "command": "npx", "args": ["-y", "mcp-remote", "https://budget.example.com/mcp", "--header", "Authorization: Bearer ${ECONOMY_TOKEN}"], "env": { "ECONOMY_TOKEN": "eco_..." } } } }
   ```

| Tool | Access | What it does |
| ---- | ------ | ------------ |
| `get_context` | read | today's date, currency, and the **context** you wrote for assistants |
| `get_overview` | read | total balance, income and spending this month, projected end-of-month total, all warnings |
| `list_accounts` | read | accounts, balances, minimum-balance rules and ceilings |
| `list_transactions` | read | transactions of a month or of a date range (up to 366 days), optionally of one account |
| `get_spending_summary` | read | income, spending by category, and the previous month for comparison |
| `list_subscriptions` | read | subscriptions, bills, salary, standing transfers |
| `list_planned` | read | planned one-off operations |
| `get_forecast` | read | projected balances for up to 12 months, with rule and ceiling warnings |
| `can_afford` | read | **simulates a purchase** without recording it: balance month by month, the rule it would break, the lowest balance, and the earliest month where it breaks nothing |
| `add_transaction` | read and add | records an expense or an income |
| `add_planned` | read and add | plans an operation for a date |

So you can ask your assistant "can I spend €300 on a new phone, or should I wait?": it reads your context and overview, simulates the purchase with `can_afford`, and answers from your real figures. A read-only token is enough for that.

**Context.** In **Settings → AI assistants (MCP) → Context for assistants**, write what an assistant should know to advise you: goals ("keep €1,500 in my current account", "saving for a trip in June"), habits, personal rules ("purchases over €200 deserve a week's thought"). It is sent to the client when it connects and by `get_context`. Only you can edit it, never an assistant. It is not encrypted, so keep secrets out of it.

**Security model**

- **HTTPS only.** The app refuses `/mcp` unless `ORIGIN` is `https://` (`localhost` excepted), and refuses requests that came to the proxy in plain HTTP.
- **One token per client and per user**, 256 random bits. Only its SHA-256 is stored, so a stolen database contains no usable token. A token only ever sees its owner's data, with the same per-user filtering as the web app.
- **Least privilege**: read-only by default, and **nothing can be deleted or modified** through MCP, not even with a write token. Mistakes are fixed in the app.
- **Revoke** a token in Settings at any time (instant). Deleting a user deletes their tokens. The settings page shows each token's last use.
- Brute-force guard shared with the sign-in form (5 failures lock an IP for 15 minutes), `Host` and `Origin` checks against DNS rebinding, requests capped at 64 KB.
- Amounts are in your display currency, expenses negative. Labels you typed are returned to the model as data: avoid connecting an assistant you do not trust with your finances to a write token.

Limits: authentication is a static bearer token, not OAuth. That covers every client that accepts custom headers (the list above), but not "custom connectors" that can only sign in through OAuth, such as the claude.ai web interface or the ChatGPT web app. Tokens do not expire on their own: revoke the ones you no longer use.

## Data, updates and backups

The database is the app's only state. It lives in `/data`, outside the image, so replacing the image never touches it.

- **Docker Compose**: the named volume `economy-data` survives restarts, updates (`docker compose pull`, `docker compose up -d`) and rebuilds. Only `docker compose down -v` deletes it, so never add `-v`.
- **Schema updates**: a new version upgrades the existing database in place at startup (the version is tracked in `PRAGMA user_version`), keeping all data. For example, a single-user install became multi-user, and its owner became the administrator.
- **Logs**: the app's messages (start, version, account creation deadline, warnings) go to the container output and to `/data/economy.log` (rotated at 1 MB).
- **Check**: every start logs `[economy] Database /data/economy.db: N user(s).`, with a warning if `/data` is not a mounted volume. The admin panel also shows **Storage: Persistent** or **Ephemeral**.
- **Backups**: **Settings → Export a backup (JSON)** for your own data, or copy the whole database: `sqlite3 /data/economy.db ".backup economy-backup.db"`. Export before a major update.

## Versions and updates

Every push to the `stable` branch, whether a direct push or a merged `dev` → `stable` pull request, runs [the release workflow](.github/workflows/release.yml):

1. lint, type check and unit tests;
2. the next version is computed: the last release's patch number + 1 (`0.1.3` → `0.1.4`). To start a new minor or major version, set it in `package.json` (for example `0.2.0`) and the following releases count up from there;
3. the image is built and published as `ghcr.io/midnights-ra1n/economy:latest`, `:<version>` and `:sha-<commit>`;
4. the `.deb` packages are built for amd64 and arm64;
5. a GitHub release `v<version>` is created, with notes generated from the commits and the packages attached (`economy_<version>_<arch>.deb`, and `economy_<arch>.deb` so that `releases/latest/download/` always points to the newest).

Pull requests to `stable` run the tests and a test build, without publishing anything.

The app shows its version in **Settings** and in the admin panel. Every 6 hours it checks the latest GitHub release; when a newer one exists, administrators see a banner with a link to its notes. With the `.deb`, administrators install it from the admin panel in one click; with Docker, updates come with the image.

```bash
docker compose pull && docker compose up -d      # or let an image auto-updater do it
```

With the `.deb`, use the button in the admin panel ([details](#debian--ubuntu-package-deb-no-docker)). On Proxmox, pull the new image and recreate the container with the same `/data` mount. To stay on a given version, use a version tag instead of `latest`.

## Statements

**Statements** in the menu lists every statement, to open or download as a PDF, or to send by e-mail.

<p align="center">
  <img src="docs/screenshot-statements.png" alt="Statements page" width="60%">
  &nbsp;
  <img src="docs/screenshot-statement.png" alt="First page of a PDF statement" width="32%">
</p>

- **New statement**: a month or a week (Monday to Sunday) from any day in it, or any range of up to a year. Making a month or week again replaces it with fresh figures.
- **Automatic statements**: every week or every month, a statement is made once the period is over, checked every hour. With an e-mail address and the box ticked, it is also e-mailed with the PDF attached; a failed send is retried at the next check.
- **Automatic cleanup** deletes statements older than the chosen number of months.
- A statement is a snapshot: editing transactions later does not change it. Erasing your banking data deletes your statements too.

### Setting up e-mail

1. An administrator enters the outgoing mail server in **Admin → E-mail**: SMTP server, port and security (STARTTLS on 587, or TLS on 465), username and password, and the sender, for example `no-reply@example.com` with the name `Economy`.
2. Each user enters their own address in **Settings → E-mail address**: their statements go there.
3. **Send a test e-mail**, in the admin panel or in Settings, sends a sample statement with its PDF attached. Receiving it confirms that both sending and PDF generation work.

The SMTP password is encrypted (AES-256-GCM) with a key stored outside the database, in `/data/secret.key`. A copy of `economy.db` alone does not reveal it, and it is never sent back to the browser. Keep `secret.key` with the database when you move it; otherwise, enter the password again.

## Users and administration

- Each user sees only their own accounts, transactions and plans, and their exports contain only their data.
- The administrator reaches the panel from **Admin** (top bar on desktop, or **Settings → Administration** on mobile). It shows instance statistics, and for each user lets you:
  - change their role
  - set a new password, which signs them out everywhere
  - sign them out of all their devices
  - **erase their banking data** while keeping their login
  - delete them
- An administrator can neither demote nor delete themselves, so there is always at least one administrator.
- **Reset the app**, at the bottom of the admin panel, deletes every user and all data. It asks you to type `RESET` (or `RÉINITIALISER`) and your password, then opens the first-account screen again for 10 minutes.
- Every user can also erase their own banking data from **Settings**, with their password.

## Languages

The interface is available in **French and English**. Each user picks a language in **Settings → Language and currency**. Before signing in, the app follows the browser language, and the login page has a language switch.

Strings live in [`lib/i18n.ts`](lib/i18n.ts). To add a language, add a dictionary there with the same keys (TypeScript flags any missing one) and register it in `LOCALES`.

## Security

- No secret is readable in the database. Passwords are hashed with salted **scrypt**, session tokens with SHA-256.
- The database is never served over the web. Its folder is `700` and its files `600`, so only the app's system user can read them.
- The first account can only be created during the first 10 minutes after the server starts (or after a reset). Creating it is serialized, so two simultaneous attempts cannot both become administrator.
- After 5 failed sign-ins, an IP address is locked out for 15 minutes.
- Sessions are random tokens in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` over HTTPS) and expire after 30 days. Changing a password signs out the other devices.
- WebAuthn challenges are stored server-side, single-use, and expire after 5 minutes.
- Every page and server action checks the session again, and admin actions check the role again. Every query on banking data is filtered by user, and account ids sent by forms are verified.
- Deleted data is overwritten (`PRAGMA secure_delete`). A full reset also empties the WAL journal and compacts the database.
- The SMTP password is the only secret the app must read back: it is encrypted with a key kept outside the database (`/data/secret.key`, mode 600) and never shown again in the interface.
- The MCP server needs HTTPS, authenticates with revocable hashed tokens, is read-only by default and never deletes ([details](#mcp-server-ai-assistants)).
- Security headers are set (HSTS, `X-Frame-Options`, `nosniff`, …), and the app asks search engines not to index it.

## Development

```bash
pnpm dev      # http://localhost:3000
pnpm test     # unit tests: forecast, backup format, migrations, translations
pnpm lint
pnpm typecheck
```

Built with Next.js 16 (App Router, server actions), React 19, Tailwind CSS 4, `node:sqlite` and `@simplewebauthn`. Fonts: Geist and Geist Mono.

```
app/(app)/     signed-in pages: dashboard, transactions, planning, statements, accounts, settings, admin
app/login/     setup, sign-in and passkeys
lib/db.ts      SQLite connection, schema migrations, first-account window, logs
lib/auth.ts    sessions, passwords, rate limiting
lib/budget.ts  per-user budget queries
lib/forecast.ts  projection logic (pure, tested)
lib/i18n.ts    French and English strings
lib/statement.ts  statement periods and figures (pure, tested)
lib/pdf.ts     PDF statement (pdfkit, Geist fonts from assets/fonts)
lib/mail.ts    statement e-mail (nodemailer)
lib/mcp.ts     MCP server: tokens, JSON-RPC, tools (route: app/mcp/route.ts)
lib/reports.ts storage, scheduler, e-mail and cleanup of statements
```
