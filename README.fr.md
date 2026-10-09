# Economy

**Une application de budget personnel auto-hébergée, qui vous dit combien il vous restera à la fin du mois.**

Suivez vos comptes, abonnements et dépenses, prévoyez vos dépenses ponctuelles et voyez votre solde six mois à l'avance. Vous êtes prévenu avant qu'un livret ne passe sous le plancher que vous avez fixé. L'application s'installe sur téléphone et ordinateur (PWA), et les données restent sur votre propre serveur.

[English](README.md)

<p align="center">
  <img src="docs/screenshot-desktop.png" alt="Tableau de bord sur ordinateur" width="68%">
  &nbsp;
  <img src="docs/screenshot-mobile.png" alt="Tableau de bord sur téléphone, mode sombre" width="24%">
</p>

## Fonctionnalités

**Budget**
- Comptes courants et épargne, chacun avec une **règle de solde minimum** facultative (« mon livret ne descend pas sous 1 000 € »)
- Dépenses, revenus et virements entre comptes, avec catégories
- **Abonnements, salaire et virements mensuels**, ajoutés automatiquement le jour venu (les mois manqués sont rattrapés)
- **Dépenses prévues** ponctuelles, à cocher une fois payées
- **Prévision de fin de mois** et **projection sur 6 mois**, avec une alerte quand une règle va être enfreinte
- Un calendrier du mois avec les prélèvements prévus (touchez un jour pour voir le détail) et une courbe des dépenses comparée au mois précédent

**Au quotidien**
- Une opération s'ajoute en quelques gestes depuis n'importe quelle page, avec le bouton **+**
- **PWA** installable sur ordinateur et mobile, en mode clair et sombre
- **Français et anglais**, au choix de chaque utilisateur, avec la langue du navigateur par défaut
- Devise d'affichage au choix : euro par défaut, dollar US, livre, franc suisse, dollar canadien, yen
- **Import / export** : sauvegarde complète en JSON (restaurable), opérations en CSV pour Excel ou LibreOffice

**Comptes et sécurité**
- Connexion par identifiant et mot de passe, avec **passkeys en option** (Face ID, Touch ID, Windows Hello)
- **Plusieurs utilisateurs**, chacun avec ses données privées, et un **panneau d'administration**
- Aucun secret stocké en clair, protection contre les attaques par force brute, données réellement effacées à la suppression
- Un seul fichier **SQLite**, via le module `node:sqlite` intégré à Node, sans dépendance native

## Démarrage rapide (Docker Compose)

```bash
git clone https://github.com/<vous>/economy.git && cd economy
ORIGIN=https://budget.mondomaine.fr docker compose up -d --build
docker compose logs economy        # affiche le code d'initialisation
```

Ouvrez l'URL, saisissez le **code d'initialisation** affiché dans les logs, puis choisissez votre identifiant et votre mot de passe. Ce premier compte est **administrateur**.

Un nouveau code est généré à chaque démarrage tant qu'aucun compte n'existe, puis il disparaît. Personne ne peut ensuite s'inscrire seul : c'est l'administrateur qui crée les autres comptes.

> Pour essayer en local, lancez `docker compose up -d --build` sans `ORIGIN` et ouvrez http://localhost:3000.

## Autres façons de l'installer

### `docker run`

```bash
docker build -t economy .
docker run -d --name economy -p 3000:3000 \
  -e ORIGIN=https://budget.mondomaine.fr \
  -v economy-data:/data \
  economy
```

Passez toujours le même volume nommé (`-v economy-data:/data`). Sans lui, chaque nouveau conteneur repart d'une base vide.

### Conteneur LXC sur Proxmox (image OCI)

L'image est une image OCI standard, et Proxmox VE 9.1 ou plus récent sait créer un conteneur LXC à partir d'une archive OCI.

1. Construisez l'archive sur une machine qui a Docker ou Podman. Le `--platform` est indispensable depuis un Mac Apple Silicon, car un serveur Proxmox est en x86-64.

   ```bash
   docker build --platform linux/amd64 -t economy .
   docker save economy -o economy-oci.tar      # Docker 25+ produit une archive OCI
   # ou : podman build --platform linux/amd64 -t economy . && podman save --format oci-archive -o economy-oci.tar economy
   ```

2. Dans Proxmox, envoyez `economy-oci.tar` dans un stockage, rubrique **CT Templates → Upload**.
3. Créez le conteneur (**Create CT**) à partir de ce template.
4. Préparez sur l'hôte un dossier qui appartient à l'utilisateur de l'application, puis montez-le sur `/data`. L'application tourne sous `node` (uid 1000), soit l'uid 101000 sur l'hôte pour un conteneur non privilégié :

   ```bash
   mkdir -p /srv/economy && chown 101000:101000 /srv/economy
   pct set <id> -mp0 /srv/economy,mp=/data
   ```

   Un montage depuis l'hôte (bind mount) n'est jamais supprimé avec le conteneur. Évitez un volume géré par Proxmox, qui est détruit avec lui.
5. Ajoutez la variable d'environnement `ORIGIN=https://budget.mondomaine.fr` dans les options du conteneur. `DATA_DIR`, `PORT` et `TZ` sont déjà définis par l'image.
6. Démarrez le conteneur. Le code d'initialisation s'affiche dans sa console.

Pour mettre à jour, créez un conteneur depuis la nouvelle image avec le même montage : il retrouve toutes les données.

### Sans Docker

Node.js 24 ou plus récent et pnpm sont requis.

```bash
pnpm install
pnpm build
ORIGIN=http://localhost:3000 pnpm start
```

La base est créée dans `./data` (modifiable avec `DATA_DIR`).

## Configuration

| Variable   | Défaut                           | Rôle                                                                      |
| ---------- | -------------------------------- | ------------------------------------------------------------------------- |
| `ORIGIN`   | `http://localhost:3000`          | URL publique exacte, sans barre finale. Les passkeys sont liées à ce domaine. |
| `DATA_DIR` | `./data` (`/data` dans Docker)   | Dossier de la base SQLite.                                                |
| `TZ`       | `Europe/Paris` dans Docker       | Fuseau horaire des échéances mensuelles.                                  |
| `PORT`     | `3000`                           | Port HTTP.                                                                |

## Mise en ligne

- **HTTPS est obligatoire** pour les passkeys et l'installation de la PWA (seul `localhost` y échappe). Placez l'application derrière un reverse proxy qui gère le TLS. Avec Caddy, ceci suffit :

  ```
  budget.mondomaine.fr {
      reverse_proxy localhost:3000
  }
  ```

- Le proxy doit transmettre l'en-tête `Host` d'origine. Les server actions de Next.js rejettent les requêtes dont l'`Origin` ne correspond pas à l'hôte (protection CSRF).
- `ORIGIN` doit correspondre exactement à l'URL tapée dans le navigateur. Si vous changez de domaine, les passkeys existantes ne fonctionnent plus.
- Le proxy doit transmettre `X-Forwarded-For` (ou `X-Real-IP`), car les tentatives de connexion sont limitées par adresse IP. Caddy, Traefik et nginx (avec `proxy_set_header`) le font.

## Données, mises à jour et sauvegardes

La base est le seul état de l'application. Elle se trouve dans `/data`, en dehors de l'image : remplacer l'image ne la touche jamais.

- **Docker Compose** : le volume nommé `economy-data` survit aux redémarrages, à `docker compose up -d --build` et à `docker compose pull`. Seul `docker compose down -v` le supprime, n'ajoutez donc jamais `-v`.
- **Mises à jour du schéma** : au démarrage, une nouvelle version met à niveau la base existante sur place (version notée dans `PRAGMA user_version`), sans perte de données. Par exemple, une installation mono-utilisateur est devenue multi-utilisateur, et son propriétaire administrateur.
- **Vérification** : chaque démarrage affiche `[economy] Database /data/economy.db: N user(s).` dans les logs, avec un avertissement si `/data` n'est pas un volume monté. Le panneau d'administration indique aussi **Stockage : Persistant** ou **Éphémère**.
- **Sauvegardes** : **Réglages → Exporter une sauvegarde (JSON)** pour vos propres données, ou copie de toute la base : `sqlite3 /data/economy.db ".backup economy-backup.db"`. Exportez avant une mise à jour importante.

## Utilisateurs et administration

- Chaque utilisateur ne voit que ses propres comptes, opérations et prévisions, et ses exports ne contiennent que ses données.
- L'administrateur accède au panneau par **Admin** (barre du haut sur ordinateur, ou **Réglages → Administration** sur mobile). Le panneau affiche les statistiques de l'instance et permet, pour chaque utilisateur :
  - de changer son rôle ;
  - de lui donner un nouveau mot de passe, ce qui le déconnecte partout ;
  - de le déconnecter de tous ses appareils ;
  - d'**effacer ses données bancaires** en conservant son accès ;
  - de le supprimer.
- Un administrateur ne peut ni se retirer ses droits ni supprimer son propre compte : il reste donc toujours au moins un administrateur.
- **Réinitialiser l'application**, en bas du panneau, supprime tous les utilisateurs et toutes les données. Il faut taper `RÉINITIALISER` (ou `RESET`) et son mot de passe. Un nouveau code d'initialisation s'affiche ensuite dans les logs.
- Chacun peut aussi effacer ses propres données bancaires depuis **Réglages**, avec son mot de passe.

## Langues

L'interface existe en **français et en anglais**. Chaque utilisateur choisit sa langue dans **Réglages → Langue et devise**. Avant la connexion, l'application suit la langue du navigateur, et la page de connexion propose un sélecteur de langue.

Les textes se trouvent dans [`lib/i18n.ts`](lib/i18n.ts). Pour ajouter une langue, ajoutez-y un dictionnaire avec les mêmes clés (TypeScript signale toute clé manquante) et déclarez-la dans `LOCALES`.

## Sécurité

- Aucun secret n'est lisible dans la base. Les mots de passe sont hachés avec **scrypt** salé, le code d'initialisation et les jetons de session avec SHA-256.
- La base n'est jamais servie par le web. Son dossier est en `700` et ses fichiers en `600` : seul l'utilisateur système de l'application peut les lire.
- Après 5 échecs de connexion, une adresse IP est bloquée 15 minutes.
- Les sessions sont des jetons aléatoires dans un cookie `HttpOnly`, `SameSite=Lax` (et `Secure` en HTTPS). Elles expirent après 30 jours. Changer de mot de passe déconnecte les autres appareils.
- Les défis WebAuthn sont stockés côté serveur, à usage unique, et expirent après 5 minutes.
- Chaque page et chaque server action revérifient la session, et les actions d'administration revérifient le rôle. Chaque requête sur des données bancaires est filtrée par utilisateur, et les identifiants de compte envoyés par les formulaires sont contrôlés.
- Les données supprimées sont écrasées (`PRAGMA secure_delete`). Une réinitialisation complète vide aussi le journal WAL et compacte la base.
- Les en-têtes de sécurité sont configurés (HSTS, `X-Frame-Options`, `nosniff`…), et l'application demande aux moteurs de recherche de ne pas l'indexer.

## Développement

```bash
pnpm dev      # http://localhost:3000
pnpm test     # tests unitaires : prévision, format de sauvegarde, migrations, traductions
pnpm lint
```

Construit avec Next.js 16 (App Router, server actions), React 19, Tailwind CSS 4, `node:sqlite` et `@simplewebauthn`. Polices : Geist et Geist Mono.

```
app/(app)/       pages connectées : accueil, opérations, prévisions, comptes, réglages, admin
app/login/       initialisation, connexion et passkeys
lib/db.ts        connexion SQLite, migrations du schéma, code d'initialisation
lib/auth.ts      sessions, mots de passe, limite de tentatives
lib/budget.ts    requêtes budgétaires par utilisateur
lib/forecast.ts  logique de projection (pure, testée)
lib/i18n.ts      textes en français et en anglais
```
