# Déployer PI Studio sur un serveur (Traefik)

Ce guide installe le Studio sur un serveur Linux où **Traefik** tourne déjà, avec HTTPS (Let's Encrypt) et une **authentification basique** : un identifiant et un mot de passe par personne. Les fichiers du dépôt :

| Fichier | Rôle |
|---|---|
| `compose.vps.yml` | Le service, ses volumes, les labels Traefik (route, HTTPS, authentification basique). |
| `.env.vps.example` | Le modèle du `.env` du serveur : domaine, dossier des données, identifiants, mots de passe, jetons. |
| `docker/studio-users.example.json` | Le modèle de la liste des personnes (nom et adresse de chaque version). |

Les commandes sont à lancer sur le serveur, dans un terminal SSH.

## 1. Ce qu'il faut avant de commencer

- Traefik, sur un réseau Docker externe nommé **`web`**, avec un point d'entrée HTTPS **`websecure`** et un résolveur de certificats **`le`**. Vérification :

  ```bash
  docker network ls | grep -w web
  ```

  Si les noms diffèrent chez vous, adaptez les labels de `compose.vps.yml` (`entrypoints`, `certresolver`, `traefik.docker.network`, `networks`).
- Un nom de domaine qui pointe vers le serveur (enregistrement DNS A ou AAAA), par exemple `pi-web-studio.smartbiblia.fr`.
- Au moins **3 Go de mémoire libre** pour construire l'image (sinon le build s'arrête en `EOF`) : au besoin, ajoutez un fichier d'échange (swap).
- `htpasswd`, pour chiffrer les mots de passe. Il n'est pas besoin de l'installer : la commande du §4 le lance dans un conteneur.

## 2. Récupérer le code

```bash
sudo git clone -b studio https://github.com/gegedenice/pi-web-studio.git /srv/pi-web-studio
cd /srv/pi-web-studio
```

Toutes les commandes suivantes se lancent depuis `/srv/pi-web-studio`.

## 3. Préparer le dossier des données

Les packs (un dépôt Git), le dossier de Pi (providers, jetons OAuth des serveurs MCP, sessions) et la liste des personnes vivent **hors du code**, dans un dossier à sauvegarder (§9) :

```bash
sudo mkdir -p /srv/pi-studio-data/workspace /srv/pi-studio-data/pi-agent
sudo cp docker/studio-users.example.json /srv/pi-studio-data/studio-users.json
sudo nano /srv/pi-studio-data/studio-users.json
```

Une entrée par personne. La **clé** (par exemple `geraldine`) est son identifiant de connexion (§4) ; `name` et `email` sont ceux qui apparaissent dans l'historique des versions.

## 4. Les identifiants de connexion

Pour chaque personne, chiffrez son mot de passe :

```bash
docker run --rm httpd:2.4-alpine htpasswd -nbB geraldine 'son-mot-de-passe'
```

La commande affiche une ligne comme `geraldine:$2y$05$Qx…`. Gardez ces lignes pour le `.env`, séparées par des virgules.

## 5. Le fichier `.env`

```bash
sudo cp .env.vps.example .env
sudo chmod 600 .env
sudo nano .env
```

- `STUDIO_DOMAIN` : votre domaine, sans `https://`.
- `STUDIO_DATA_DIR` : `/srv/pi-studio-data`, ou le dossier choisi au §3.
- `STUDIO_BASIC_AUTH_USERS` : les lignes du §4, séparées par des virgules, **entre guillemets simples** :

  ```
  STUDIO_BASIC_AUTH_USERS='geraldine:$2y$05$Qx…,bibliothecaire-1:$2y$05$Lm…'
  ```

- `PI_WEB_PASSWORD` : un mot de passe long et aléatoire, par exemple tiré de `openssl rand -base64 24`. C'est une seconde barrière : les autres conteneurs du réseau `web` peuvent joindre le Studio sans passer par Traefik. Il est demandé une fois par navigateur, puis retenu 30 jours. Le Studio refuse de démarrer s'il est vide.
- Les jetons des serveurs MCP (`HAL_TOKEN=…`) et la clé éventuelle du provider (`LLAMA_API_KEY=…`).

Vérifiez ce que Compose comprend, sans rien démarrer :

```bash
docker compose -f compose.vps.yml config | grep -E 'Host\(|basicauth.users|PI_WEB_ALLOWED_HOSTS'
```

On doit voir votre domaine et les empreintes complètes (avec leurs `$`). Si une empreinte est tronquée, vérifiez les guillemets simples.

## 6. Démarrer

```bash
docker compose -f compose.vps.yml up -d --build
docker compose -f compose.vps.yml logs -f
```

On attend dans le journal les lignes `[entrypoint] …` (dossier des packs approuvé pour Pi, dépôt créé au premier démarrage) puis `starting PI Studio on 0.0.0.0:30141`. Ouvrez `https://<votre domaine>` : le navigateur demande l'identifiant et le mot de passe du §4, puis Pi Web demande son mot de passe, et le Studio s'affiche.

## 7. Configurer le provider et les serveurs MCP

- **Provider** : Studio › Providers › « Ouvrir les réglages des modèles », comme en local. Le fichier se trouve ensuite dans `/srv/pi-studio-data/pi-agent/models.json` (modèle : `docker/models.example.json`). Si llama.cpp tourne sur l'hôte du serveur, décommentez `extra_hosts` dans `compose.vps.yml` et utilisez `http://host.docker.internal:<port>/v1`.
- **Serveurs MCP avec jeton** : ajoutez la variable au `.env`, puis `docker compose -f compose.vps.yml up -d` pour qu'elle soit prise en compte.
- **Serveurs MCP avec OAuth** (OpenAlex) : les connexions faites en local ne sont pas sur le serveur. Refaites-les comme en V17 bis (rubrique MCP › « Ouvrir ce pack dans Pi Web » › Réglages › MCP › « Sign in », puis collez l'adresse de retour).

## 8. Vérifications au déploiement (V3, V4)

### V3 — Une identité par personne

- **Action** : deux personnes se connectent avec leurs identifiants (deux navigateurs, ou une fenêtre privée), et chacune enregistre une modification dans un pack.
- **Attendu** : l'en-tête du Studio affiche le nom de chacune ; l'historique montre chaque version sous le bon nom.
- **Commande** :

  ```bash
  docker compose -f compose.vps.yml exec pi-studio git -C /workspace/packs log --format='%an <%ae> | %s' -5
  ```

  Un identifiant absent de `studio-users.json` enregistre quand même, sous son identifiant, avec un avertissement dans le journal.

### V4 — Un en-tête d'identité ajouté à la main est ignoré

Traefik remplace l'en-tête `Remote-User` par l'identifiant connecté. Vérification depuis votre poste, en vous faisant passer pour une autre personne :

```bash
D=https://pi-web-studio.smartbiblia.fr
curl -s -c jar -u geraldine:'son-mot-de-passe' -H 'Content-Type: application/json' \
  -d '{"password":"<PI_WEB_PASSWORD>"}' "$D/api/web-auth"
curl -s -b jar -u geraldine:'son-mot-de-passe' -H 'Remote-User: bibliothecaire-1' "$D/api/studio/me"
rm jar
```

**Attendu** : `{"id":"geraldine",…}`, et non `bibliothecaire-1`. Sans identifiants, `curl -s -o /dev/null -w '%{http_code}' "$D/studio"` répond `401`.

### Et aussi

- Refaites V1 (Pi en ligne de commande dans le conteneur), V17 (inspection d'un serveur MCP) et une campagne courte : le serveur n'a pas les mêmes accès réseau que votre poste.

## 9. Sauvegarde

Tout ce qui compte est dans `/srv/pi-studio-data` (et le `.env`). Par exemple, chaque nuit :

```bash
sudo tar czf /srv/backups/pi-studio-$(date +%F).tar.gz -C /srv pi-studio-data /srv/pi-web-studio/.env
```

Le dépôt des packs n'est **jamais poussé** par le Studio : cette sauvegarde en est la seule copie. Pour en garder une copie Git portable :

```bash
docker compose -f compose.vps.yml exec pi-studio git -C /workspace/packs bundle create /workspace/packs.bundle --all
```

## 10. Mettre à jour

```bash
cd /srv/pi-web-studio
sudo git pull
docker compose -f compose.vps.yml up -d --build
```

Les données ne sont pas touchées. Une campagne en cours au moment du redémarrage est notée « Interrompue » ; « Relancer les cas non terminés » la reprend.

## 11. Sécurité, en bref

- Le Studio n'est joignable que par Traefik (aucun port publié), en HTTPS, derrière deux mots de passe.
- L'agent et le terminal de Pi Web donnent un shell dans le conteneur : ne donnez des identifiants qu'aux personnes qui doivent concevoir les packs.
- Aucun secret dans l'image ni dans le dépôt : tout est dans `.env` (droits `600`) et dans `/srv/pi-studio-data/pi-agent`.
- Le socket Docker n'est jamais monté dans le conteneur.
