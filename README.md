# Economy

Gestion de budget personnel, simple, installable en PWA (mobile et desktop), auto-hébergée.

- **Comptes** courants et épargne, avec une **règle de solde minimum** (ex. « mon livret ne descend pas sous 1 000 € »)
- **Opérations** : dépenses, revenus, virements entre comptes, catégories
- **Abonnements et revenus mensuels**, ajoutés automatiquement aux opérations le jour venu
- **Dépenses prévues** ponctuelles, à valider une fois payées
- **Prévision** du solde en fin de mois et **projection sur 6 mois**, avec une alerte si une règle va être enfreinte
- **Import / export** : sauvegarde complète en JSON (restaurable), opérations en CSV pour Excel ou LibreOffice
- **Devise** au choix (euro par défaut, dollar, livre, franc suisse…)
- Connexion par **identifiant et mot de passe**, avec **passkeys en option** (Face ID, Touch ID, Windows Hello)
- **Plusieurs utilisateurs**, chacun avec ses propres comptes, et un **panneau d'administration** (création, rôles, mots de passe, déconnexion, effacement des données, réinitialisation complète)
- Base **SQLite** dans un seul fichier, via le module `node:sqlite` intégré à Node (aucune dépendance native)

Les données vivent sur votre serveur : tous vos appareils (PC, téléphone) voient les mêmes chiffres.

## Utilisateurs et administration

- Le premier compte, créé avec le code d'initialisation, est **administrateur**. Il crée les autres utilisateurs depuis **Admin** (barre du haut sur ordinateur, ou Réglages → Administration sur mobile).
- Chaque utilisateur ne voit que ses propres comptes, opérations et prévisions. Ses exports ne contiennent que ses données.
- L'administrateur peut, pour chaque utilisateur : changer son rôle, lui donner un nouveau mot de passe, le déconnecter de tous ses appareils, **effacer ses données bancaires** (son accès est conservé) ou le supprimer.
- Un administrateur ne peut ni se retirer ses droits ni supprimer son propre compte : il reste donc toujours au moins un administrateur.
- **Réinitialiser l'application** (Admin, en bas) supprime tous les utilisateurs et toutes les données. Il faut taper `RÉINITIALISER` et son mot de passe. Un nouveau code d'initialisation s'affiche ensuite dans les logs.
- Chacun peut aussi effacer ses propres données bancaires dans Réglages, avec son mot de passe.

## Démarrage avec Docker

```bash
ORIGIN=https://budget.mondomaine.fr docker compose up -d --build
docker compose logs economy   # affiche le code d'initialisation
```

Ouvrez l'URL, saisissez le **code d'initialisation** affiché dans les logs, puis choisissez votre identifiant et votre mot de passe. Un nouveau code est généré à chaque démarrage tant qu'aucun compte n'existe, et il disparaît dès que le compte est créé : personne ne peut ensuite s'inscrire seul : c'est l'administrateur qui crée les autres comptes. Vous pourrez ajouter des passkeys dans Réglages.

Les données sont stockées dans le volume `economy-data` (`/data/economy.db`).

## Persistance et mises à jour

La base est le seul état de l'application. Elle se trouve dans `/data`, en dehors de l'image : remplacer l'image ne la touche pas.

- **Docker Compose** : le volume nommé `economy-data` survit aux redémarrages, à `docker compose up -d --build` et à `docker compose pull`. Seul `docker compose down -v` le supprime : n'utilisez jamais `-v`.
- **`docker run`** : passez toujours le même volume nommé, `-v economy-data:/data`. Sans lui, Docker crée un volume anonyme différent à chaque nouveau conteneur, et la nouvelle version repart d'une base vide.
- **Mises à jour du schéma** : au démarrage, une nouvelle version met à niveau la base existante sur place (version notée dans `PRAGMA user_version`). Les données existantes sont conservées. Une installation mono-utilisateur devient ainsi multi-utilisateur, et son propriétaire devient administrateur.
- **Vérification** : à chaque démarrage, les logs affichent `[economy] Base /data/economy.db : N utilisateur(s).`, avec un avertissement si `/data` n'est pas un volume monté. Le panneau Admin indique aussi « Stockage : Persistant » ou « Éphémère ».
- Avant une mise à jour importante, exportez une sauvegarde (Réglages) ou copiez `economy.db`.

## Conteneur LXC sur Proxmox (image OCI)

L'image construite par le `Dockerfile` est une image OCI standard. Proxmox VE 9.1 ou plus récent sait créer un conteneur LXC à partir d'une archive OCI.

1. Construisez l'archive sur une machine qui a Docker ou Podman. Le `--platform` est indispensable depuis un Mac Apple Silicon, car un serveur Proxmox est en x86-64.

   ```bash
   docker build --platform linux/amd64 -t economy .
   docker save economy -o economy-oci.tar          # Docker 25+ : archive au format OCI
   # ou : podman build --platform linux/amd64 -t economy . && podman save --format oci-archive -o economy-oci.tar economy
   ```

2. Dans Proxmox, envoyez `economy-oci.tar` dans un stockage, rubrique **CT Templates → Upload**.
3. Créez le conteneur (**Create CT**) avec ce template, puis montez un dossier de l'hôte sur `/data` : `pct set <id> -mp0 /srv/economy,mp=/data`. Un montage depuis l'hôte (bind mount) n'est jamais supprimé avec le conteneur. Pour mettre à jour, créez un conteneur depuis la nouvelle image avec le même montage : il retrouve toutes les données. Évitez un volume créé par Proxmox, qui est détruit avec le conteneur.
4. Ajoutez la variable d'environnement `ORIGIN=https://budget.mondomaine.fr` dans les options du conteneur. `DATA_DIR`, `PORT` et `TZ` sont déjà définis par l'image.
5. Le processus tourne sous l'utilisateur `node` (uid 1000), donc `/data` doit lui appartenir. Dans un conteneur non privilégié, cet uid correspond à 101000 sur l'hôte : `mkdir -p /srv/economy && chown 101000:101000 /srv/economy`.
6. Démarrez le conteneur. Le code d'initialisation s'affiche dans sa console.

## Démarrage sans Docker

Node.js 24 ou plus récent est requis.

```bash
pnpm install
pnpm build
ORIGIN=http://localhost:3000 pnpm start
```

La base est créée dans `./data` (modifiable avec `DATA_DIR`).

## Configuration

| Variable   | Défaut                  | Rôle                                                              |
| ---------- | ----------------------- | ----------------------------------------------------------------- |
| `ORIGIN`   | `http://localhost:3000` | URL publique exacte. Les passkeys sont liées à ce domaine.         |
| `DATA_DIR` | `./data` (`/data` dans Docker) | Dossier de la base SQLite.                                 |
| `TZ`       | `Europe/Paris` dans Docker | Fuseau utilisé pour les échéances mensuelles.                   |

## Mise en ligne

- **HTTPS est obligatoire** pour les passkeys et l'installation PWA (seul `localhost` y échappe). Placez l'application derrière un reverse proxy (Caddy, Traefik, nginx…) qui termine le TLS.
- Le proxy doit transmettre l'en-tête `Host` d'origine : les server actions de Next.js rejettent les requêtes dont l'`Origin` ne correspond pas à l'hôte (protection CSRF).
- `ORIGIN` doit correspondre exactement à l'URL tapée dans le navigateur. Si vous changez de domaine, les passkeys existantes ne fonctionneront plus.
- Le proxy doit transmettre `X-Forwarded-For` (ou `X-Real-IP`) : la limite de tentatives de connexion se fait par adresse IP.
- Sauvegarde : **Réglages → Exporter une sauvegarde**, ou copie de `economy.db` (par exemple avec `sqlite3 economy.db ".backup save.db"`).

## Sécurité

- Aucun secret n'est lisible dans la base : le mot de passe est haché avec **scrypt** (salé), le code d'initialisation et les sessions avec SHA-256.
- La base n'est jamais servie par le web. Son dossier est en `700` et ses fichiers en `600` : seul l'utilisateur système de l'application peut les lire.
- Après 5 échecs de connexion, une adresse IP est bloquée 15 minutes.
- Les sessions sont des jetons aléatoires dans un cookie `HttpOnly`, `SameSite=Lax` et `Secure` en HTTPS. Elles expirent après 30 jours. Changer le mot de passe déconnecte les autres appareils.
- Les défis WebAuthn sont stockés côté serveur, à usage unique, et expirent après 5 minutes.
- Chaque page et chaque server action revérifie la session.
- Le rôle administrateur est revérifié côté serveur à chaque action du panneau. Chaque requête sur des données bancaires est filtrée par utilisateur, et les identifiants de compte envoyés par les formulaires sont contrôlés.
- Les effacements écrasent réellement les données (`PRAGMA secure_delete`). La réinitialisation vide aussi le journal WAL et compacte la base.
- Les en-têtes de sécurité sont configurés (HSTS, `X-Frame-Options`, `nosniff`…) et l'application demande à ne pas être indexée.

## Développement

```bash
pnpm dev     # http://localhost:3000
pnpm test    # tests de la prévision et de l'import/export (node --test)
pnpm lint
```

Next.js 16 (App Router, server actions), Tailwind CSS 4, `@simplewebauthn`.
