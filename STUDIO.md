# STUDIO.md — PI Studio (fork de agegr/pi-web)

Spécification à destination d'un agent de code (Claude Code / Pi).
Lire ce fichier en entier avant toute modification, puis lire `AGENTS.md` et `CONTEXT.md` du dépôt pi-web.

---

## 0. Contexte et finalité

PI Studio est un environnement web permettant à **deux bibliothécaires non développeuses** et à une intégratrice de concevoir, tester et valider des **packs d'agents Pi** (skills, consignes système, serveurs MCP) pour une bibliothèque de l'ESR.

Le Studio est un **fork de [agegr/pi-web](https://github.com/agegr/pi-web)** (Next.js, MIT) auquel on ajoute une couche « Studio ». pi-web fournit déjà : sessions, navigation de fichiers, diffs Git, configuration des providers/modèles, gestion des skills, authentification par mot de passe.

Le prototype de référence pour l'UX est « PI Pack Studio » (maquette, aucun code à reprendre). Son parcours en trois temps est conservé : **Concevoir → Connecter → Évaluer**. Captures et sources éventuelles de la maquette sont dans `docs/studio/maquette/` : **référence visuelle uniquement**, ne rien importer, compiler ni copier depuis ce dossier.

### Principes directeurs (non négociables)

1. **Utilisatrices non développeuses.** Interface en français, vocabulaire métier (« Enregistrer », « Version », « Tester »), jamais de jargon Git ni de JSON brut en vue par défaut. Un « mode avancé » peut afficher les fichiers bruts.
2. **Le disque est la source de vérité.** Un pack est un dossier de projet Pi standard. Le Studio n'a pas de base de données : il lit et écrit des fichiers que Pi consomme nativement. Un pack doit rester utilisable avec `pi` en ligne de commande, sans le Studio.
3. **Fork à faible friction.** Tout le code Studio vit dans des répertoires dédiés (§4). Les modifications du code amont sont limitées aux points d'accroche listés et consignées dans `STUDIO-NOTES.md`, pour pouvoir rebaser sur `agegr/pi-web` régulièrement.
4. **Ne pas refaire ce qui existe.** Providers, modèles, tests de modèles, sessions, diffs : réutiliser les écrans et la logique de pi-web.
5. **Traçabilité.** Chaque enregistrement produit un commit Git attribué à la personne. Chaque campagne de tests produit un résultat versionné.

### Environnement de développement de l'agent de code

L'agent de code travaille **dans un environnement cloud** sur le fork GitHub, sans Docker, sans provider LLM et sans serveur MCP accessibles. L'intégratrice teste ensuite la branche en local (conteneur Docker avec Pi et un provider llama.cpp).

Conséquences :
- **Chemins configurables.** Aucun chemin en dur. Le dossier des packs est donné par `STUDIO_PACKS_DIR` (défaut `/workspace/packs`), le dossier agent Pi par `PI_CODING_AGENT_DIR` (défaut `~/.pi/agent`). Les tests utilisent des dossiers temporaires.
- **Tout ce qui est testable sans LLM doit l'être en unitaire** : validation, parsing, écriture de fichiers, Git (sur un dépôt temporaire), résolution de chemins, lecture/écriture de `.pi/mcp.json`.
- **Ce qui exige un vrai modèle ou un vrai serveur MCP** (exécution de campagnes, inspection MCP) est isolé derrière une interface injectable, avec une implémentation factice pour les tests. Les vérifications réelles sont listées dans `STUDIO-NOTES.md`, section « À vérifier en local », pour l'intégratrice.
- Le serveur de dev peut être lancé pour vérifier que les pages s'affichent ; ne pas tenter d'installer ni de configurer un provider LLM.
- Travailler sur une branche dédiée, commits réguliers et lisibles ; ne jamais pousser sur `main`.

---

## 1. Modèle de fichiers Pi (rappel, à vérifier sur la version installée)

Pi charge depuis le dossier de projet (cwd) :

| Fichier / dossier | Rôle |
|---|---|
| `AGENTS.md` | Contexte projet, chargé même sans confiance projet |
| `.pi/SYSTEM.md` | Remplace le prompt système |
| `.pi/APPEND_SYSTEM.md` | Complète le prompt système |
| `.pi/settings.json` | Réglages projet (modèle par défaut `defaultProvider`/`defaultModel`, paquets…) |
| `.pi/skills/<nom>/SKILL.md` | Skills du projet (+ `references/`, `scripts/`, `assets/`) |
| `.pi/mcp.json` | Serveurs MCP du projet (`mcpServers`), lus par le **MCP intégré de Pi** (Pi ≥ 0.99), géré par pi-web (Settings › MCP, `McpHost`) |

Vérifié sur Pi 1.2.0 (voir `STUDIO-NOTES.md` §2). **Décision : le Studio utilise le MCP intégré de Pi, pas pi-mcp-adapter** (`.mcp.json`, `.pi/mcp-adapter.json`). L'adaptateur remplacerait le MCP intégré, désactiverait la gestion MCP de pi-web, exigerait une approbation propre des serveurs projet et se replierait sur SSE. `AGENTS.md` est aussi lu dans les dossiers parents du cwd : ne jamais en placer à la racine du dépôt des packs.

**Confiance projet (piège critique).** Les ressources `.pi/*` (dont `.pi/mcp.json`) ne sont chargées que si le projet est « trusted ». pi-web ne lit que les décisions de `~/.pi/agent/trust.json` (exactes ou héritées d'un dossier parent) et **ignore `defaultProjectTrust`**. Le conteneur doit donc écrire `{"/workspace/packs": true}` (chemin réel) dans `trust.json` au démarrage (§7) : tous les packs en héritent.

Avant de coder, l'agent doit **vérifier ces chemins dans la documentation de la version de Pi installée** (`pi --version`, docs `configuration.md`, `security.md`) et dans celle de pi-mcp-adapter (`docs/configuration.md`, `docs/servers.md`), et corriger ce tableau dans `STUDIO-NOTES.md` si besoin.

---

## 2. Modèle de données Studio

### 2.1 Arborescence

```
$STUDIO_PACKS_DIR/                ← un seul dépôt Git (monorepo des packs), /workspace/packs en conteneur
├── .git/
└── literature-review/            ← un pack = un projet Pi
    ├── AGENTS.md
    ├── .pi/
    │   ├── APPEND_SYSTEM.md      (défaut ; SYSTEM.md en mode avancé)
    │   ├── settings.json
    │   ├── mcp.json              (serveurs MCP du pack, lot 3)
    │   └── skills/
    │       └── openalex-search/
    │           ├── SKILL.md
    │           └── references/
    ├── tests/
    │   └── recherche-bibliographique.md   ← une suite de tests
    └── .studio/
        ├── pack.json             ← métadonnées gérées par l'UI
        └── runs/
            └── 2026-10-14T15-20_qwen3-vl-8b/
                ├── run.json
                └── cases/
                    └── RB-01.md  ← transcript exporté de la session
```

### 2.2 `.studio/pack.json`

Géré exclusivement par l'UI (jamais édité à la main par les utilisatrices).

```json
{
  "id": "literature-review",
  "title": "Revue de littérature",
  "description": "Pack d'assistance à la revue de littérature scientifique.",
  "status": "en-conception",
  "version": "0.4",
  "owners": ["geraldine"],
  "createdAt": "2026-10-01T09:00:00Z"
}
```

`status` ∈ `en-conception | en-test | valide | archive`.

### 2.3 Format des suites de tests (`tests/*.md`)

Format lisible et éditable par des non-développeuses. Un fichier = une suite. Un en-tête facultatif puis **un tableau Markdown** :

```markdown
---
titre: Recherche bibliographique
skill: openalex-search
---

| id | requête | attendu | sources attendues |
|----|---------|---------|-------------------|
| RB-01 | Trouve 5 articles récents sur la désinformation climatique en sciences politiques | 5 références 2022+ avec DOI | OpenAlex |
| RB-02 | … | … | … |
```

Règles de parsing : tolérant aux espaces, colonnes reconnues par leur intitulé (insensible à la casse et aux accents), `id` obligatoire et unique dans le pack, lignes vides ignorées. Les erreurs de parsing sont affichées en clair dans l'UI (ligne, problème, correction suggérée).

### 2.4 `run.json` (résultat d'une campagne)

```json
{
  "runId": "2026-10-14T15-20_qwen3-vl-8b",
  "pack": "literature-review",
  "packCommit": "a1b2c3d",
  "model": { "provider": "smartbiblia", "id": "qwen3-vl-8b-instruct" },
  "startedBy": "geraldine",
  "startedAt": "2026-10-14T15:20:00Z",
  "cases": [
    {
      "suite": "recherche-bibliographique",
      "id": "RB-01",
      "status": "termine",
      "durationMs": 48200,
      "tokens": { "input": 0, "output": 0 },
      "transcript": "cases/RB-01.md",
      "sessionFile": "~/.pi/agent/sessions/…/….jsonl",
      "verdict": "ok",
      "comment": "Références correctes, un DOI manquant.",
      "reviewedBy": "bibliothecaire-1",
      "reviewedAt": "2026-10-14T16:02:00Z"
    }
  ]
}
```

`status` ∈ `en-attente | en-cours | termine | erreur | timeout`.
`verdict` ∈ `null | ok | partiel | ko`.

---

## 3. Fonctionnalités par lot

Chaque lot doit être livrable et utilisable seul. Ne pas commencer un lot avant que le précédent satisfasse ses critères d'acceptation.

### Lot 1 — Socle : packs, édition, validation, versions

**Écrans**
- **Accueil Studio** : liste des packs (titre, statut, version, dernière modification), bouton « Nouveau pack ». Le parcours Concevoir / Connecter / Évaluer est affiché pour le pack actif, avec un indicateur d'état par étape.
- **Atelier du pack** (navigation latérale reprenant le prototype) : *Consignes* (AGENTS.md, APPEND_SYSTEM.md ou SYSTEM.md), *Skills*, *MCP* (lot 3), *Tests* (lot 2), *Configuration* (modèle par défaut, métadonnées). *Providers* renvoie vers le panneau Models existant de pi-web.
- **Éditeur Markdown** : édition avec aperçu, enregistrement explicite (bouton + Ctrl/Cmd+S), indicateur « modifications non enregistrées ». Réutiliser un composant d'édition déjà présent dans pi-web si possible ; sinon CodeMirror 6 en mode Markdown.
- **Skills** : liste, création depuis un modèle, renommage, suppression (avec confirmation), import d'un `SKILL.md` collé ou téléversé. Le frontmatter est édité via un **formulaire** (nom, description) au-dessus du corps Markdown ; le YAML brut n'est visible qu'en mode avancé.
- **Historique** : pour chaque fichier, liste des versions (auteur, date, message) et restauration d'une version antérieure (nouveau commit, jamais de réécriture d'historique).
- **Historique du pack** : liste de tous les enregistrements du pack ; c'est là qu'on restaure une skill supprimée.
- **Modifié en dehors du Studio** : bandeau signalant les fichiers du pack modifiés hors Studio (sessions Pi, édition manuelle), avec « Conserver » (enregistre) et « Annuler » (restaure la dernière version) ; les deux créent un nouveau commit.

**Comportements**
- Création d'un pack : dossier, `pack.json`, `AGENTS.md` et `.pi/APPEND_SYSTEM.md` depuis modèles, `.pi/settings.json` minimal, commit initial.
- Chaque enregistrement = un commit sur le dépôt `/workspace/packs`, limité aux fichiers modifiés, auteur = identité de la personne connectée (§6), message généré (`[literature-review] Modifie skill openalex-search`) éditable optionnellement.
- Validation à l'enregistrement d'une skill (bloquante si erreur, non bloquante si avertissement) :
  - `name` présent, identique au nom du dossier, `^[a-z0-9]+(-[a-z0-9]+)*$`, ≤ 64 caractères ;
  - `description` présente, non vide, ≤ 1024 caractères ;
  - frontmatter YAML valide et placé en tête de fichier ;
  - liens relatifs du corps (`references/…`) pointant vers des fichiers existants (avertissement).
- Messages d'erreur en français courant, avec la correction attendue.
- Les pages `/studio` s'affichent en français par défaut, sans changer la langue du reste de pi-web. Couleurs et composants de pi-web ; la maquette donne la structure et le parcours, pas la palette.
- Identité inconnue de `studio-users.json` : auteur de repli et avertissement dans les journaux du serveur, jamais de refus d'enregistrer.

**Critères d'acceptation**
- Une utilisatrice crée un pack, ajoute une skill depuis le modèle, l'enregistre, la modifie, restaure la première version, sans voir de terme Git ni de JSON.
- `git log` montre un commit par enregistrement avec le bon auteur.
- Lancer `pi` en CLI dans le dossier du pack charge bien la skill (vérification manuelle par l'intégratrice en local, procédure écrite dans `STUDIO-NOTES.md` § « À vérifier en local »).

### Lot 2 — Évaluation : suites de tests et verdicts

**Écrans**
- **Tests** : liste des suites du pack, éditeur de suite (vue tableau éditable + mode Markdown brut), validation du format.
- **Lancer une campagne** : choix des suites (ou d'un sous-ensemble de cas) et d'un modèle parmi ceux configurés dans pi-web. Avertissement s'il y a des modifications non enregistrées.
- **Suivi de campagne** : progression cas par cas, en temps réel.
- **Revue** : pour chaque cas, la requête, l'attendu, la réponse finale, les appels d'outils (repliés), puis la saisie du verdict (OK / Partiel / KO) et d'un commentaire. Lien « Ouvrir la session » vers la vue session de pi-web.
- **Comparaison** : tableau cas × campagnes (modèles ou versions du pack) avec les verdicts, filtrable par suite.

**Comportements**
- Chaque cas s'exécute dans **une session Pi neuve**, cwd = dossier du pack, modèle choisi, sans historique. Réutiliser la logique de session de `lib/` de pi-web (identifier le point d'entrée dans `AGENTS.md` / `CONTEXT.md` du dépôt) plutôt que réimplémenter l'appel au SDK.
- Exécution **séquentielle** par défaut (le provider local llama.cpp ne supporte pas la concurrence), concurrence configurable.
- Timeout par cas configurable (défaut 5 min) ; un cas en erreur n'interrompt pas la campagne.
- À la fin de chaque cas : export du transcript en Markdown lisible dans `cases/<id>.md`, mise à jour de `run.json`.
- `packCommit` = commit courant du pack au lancement (la campagne teste une version identifiée).
- Les résultats et verdicts sont commités (ce sont les preuves du protocole d'évaluation).
- Les sessions de test doivent être distinguables des sessions de travail dans la barre latérale de pi-web (nom préfixé `[test]`, ou filtre).

**Critères d'acceptation**
- Une suite de 4 cas s'exécute sur deux modèles ; la comparaison affiche les deux colonnes ; les verdicts saisis survivent à un redémarrage du conteneur.
- Un cas qui dépasse le timeout est marqué `timeout` et la campagne continue.

### Lot 3 — MCP

**Écrans** (reprendre la maquette : carte « Serveur MCP », endpoint, version du protocole, authentification, bouton « Inspecter tools/list »)
- Liste des serveurs du pack, ajout, activation/désactivation, suppression.
- Formulaire : identifiant, URL, description, authentification (`Aucune` | `Jeton Bearer via variable d'environnement`), exposition des outils (`direct` par défaut ; `toolExposure` par outil en mode avancé, dont `hidden` pour masquer un outil). Le MCP intégré n'a ni `protocolVersion` ni `lifecycle`.
- **Inspecter** : réutiliser le « Test » de pi-web (`lib/mcp-test.ts`, connexion bornée via le SDK Pi), `initialize` puis `tools/list`, affichage des outils (nom, description, schéma replié). C'est un diagnostic.

**Comportements**
- Écrit dans `.pi/mcp.json` du pack (format `mcpServers` du MCP intégré de Pi), en réutilisant l'écrivain de pi-web (`lib/mcp-config-file.ts` : verrou, écriture atomique). Activer/désactiver = `enabled: false` dans l'entrée.
- **Exposition `direct` par défaut** (`"exposure": "direct"`) : le modèle cible est un petit modèle local, qui doit voir les outils déclarés comme des outils ordinaires plutôt que passer par des scripts `codemode` ou `tool_search`.
- **Politique de transport : Streamable HTTP uniquement.** Le Studio refuse `command`/stdio et le SSE historique, avec un message explicite. (Les serveurs stdio restent configurables à la main par l'intégratrice, hors Studio.)
- **Aucun secret dans le dépôt.** Pour l'authentification Bearer, le Studio n'enregistre que le *nom* d'une variable d'environnement, sous la forme `"headers": { "Authorization": "Bearer ${NOM_VAR}" }` (syntaxe du MCP intégré, équivalente à `pi mcp add --bearer-token-env-var`) ; la valeur est fournie au conteneur (`.env`).
- OAuth hors périmètre pour le Studio (pi-web sait le gérer dans Settings › MCP, pour l'intégratrice).

**Critères d'acceptation**
- Ajout d'un serveur Streamable HTTP via le formulaire, inspection réussie, puis une session de test du pack appelle effectivement un de ses outils, déclaré en exposition `direct` (`mcp__<serveur>__<outil>`).
- Tentative d'ajout d'un serveur stdio refusée avec message clair.

### Lot 4 — Valider et exporter

- **Valider le pack** : contrôle global affiché en liste (vert/orange/rouge) — toutes les skills valides, `AGENTS.md` et prompt système présents, `.pi/mcp.json` valide et conforme à la politique de transport, serveurs MCP joignables (inspection), suites de tests parsables, dernière campagne sans cas `ko` (avertissement seulement).
- **Publier une version** : incrémente `version` dans `pack.json`, crée le tag Git `<pack-id>/v<version>`, passe le statut à `valide` si la validation est verte. Une note de version (texte libre) est demandée.
- **Exporter** : archive `.zip` du dossier du pack à une version taguée, **sans** `.studio/runs/` (option pour les inclure) et sans aucun secret.

### Lot 5 — Agents (différé)

Ne pas implémenter sans décision explicite. Candidat : extension de sous-agents (ex. `tintinweb/pi-subagents`), dont le format de définition dictera l'écran. L'« allowlist d'agents par serveur MCP » de la maquette n'est pas un mécanisme de Pi : hors périmètre.

---

## 4. Architecture dans le fork

```
app/studio/                  pages du Studio (App Router)
app/api/studio/              routes API du Studio
components/studio/           composants UI Studio
lib/studio/
  packs.ts                   lecture/écriture/création de packs, pack.json
  skills.ts                  CRUD skills, frontmatter
  validate.ts                règles de validation (skills, mcp, tests, pack)
  git.ts                     commit, historique, restauration, tags (simple-git ou isomorphic-git)
  tests/parse.ts             parsing des suites Markdown
  tests/runner.ts            exécution des campagnes (s'appuie sur lib/ de pi-web)
  tests/transcript.ts        export Markdown des sessions
  mcp/config.ts              lecture/écriture .pi/mcp.json (via lib/mcp-config-file.ts)
  mcp/inspect.ts             initialize + tools/list (via lib/mcp-test.ts)
  identity.ts                identité de l'utilisatrice (en-tête du proxy)
studio-templates/            modèles : pack, AGENTS.md, APPEND_SYSTEM.md, SKILL.md, suite de tests
```

**Points d'accroche autorisés dans le code amont** (à consigner dans `STUDIO-NOTES.md`) :
- ajout d'une entrée « Studio » dans la navigation principale ;
- ajout de la locale `fr` en suivant `docs/i18n.md` du dépôt (toutes les chaînes Studio passent par l'i18n) ;
- filtre ou préfixe des sessions de test dans la barre latérale ;
- ajout éventuel de dépendances dans `package.json`.

Toute autre modification du code amont doit être justifiée dans `STUDIO-NOTES.md`.

**Sécurité côté API Studio**
- Toutes les routes `api/studio` résolvent les chemins **sous `STUDIO_PACKS_DIR`** uniquement (normalisation + vérification de préfixe, refus des liens symboliques sortants).
- Réutiliser le contrôle d'authentification de pi-web pour ces routes.
- Les scripts présents dans `skills/*/scripts/` ne sont jamais exécutés par le Studio lui-même.

**Tests**
- Tests unitaires pour `validate.ts`, `tests/parse.ts`, `mcp/config.ts`, la résolution de chemins.
- Un test e2e (le dépôt a un dossier `e2e/`) pour le parcours du lot 1.
- Respecter les commandes du dépôt : `npm test`, `tsc --noEmit`, `npm run lint`. Ne pas lancer `npm run build` pendant le développement.

---

## 5. UX et rédaction

- Libellés : Enregistrer, Version, Historique, Restaurer, Tester, Campagne, Verdict, Publier une version, Exporter.
- Interdits en vue par défaut : commit, branch, HEAD, diff, JSON, YAML, stdio, cwd.
- Chaque écran vide propose l'action suivante (« Aucune suite de tests. Créer la première suite »).
- Confirmation explicite pour toute suppression ; restauration toujours possible via l'historique.
- Responsive tablette au minimum ; le mobile n'est pas une cible.

---

## 6. Identité et authentification

- En production, l'authentification est assurée par Traefik (middleware forward-auth : Authelia, oauth2-proxy ou équivalent) qui transmet l'identité dans un en-tête (ex. `Remote-User`, `X-Forwarded-User` — rendre le nom de l'en-tête configurable via `STUDIO_IDENTITY_HEADER`).
- `lib/studio/identity.ts` lit cet en-tête **uniquement si** la requête provient du proxy de confiance (variable `STUDIO_TRUSTED_PROXY=true`) ; sinon identité = `STUDIO_DEFAULT_USER` (défaut `studio`).
- Correspondance identité → auteur Git (`Nom <email>`) via un fichier `studio-users.json` monté dans le conteneur.

---

## 7. Conteneur et déploiement

### 7.1 Dockerfile (point de départ, à adapter pour builder le fork)

Réalisation : `docker/Dockerfile`, `docker/entrypoint.sh`, `compose.dev.yml` (test local) ; procédure dans `docs/studio/TEST-LOCAL.md`, détails dans `STUDIO-NOTES.md` §9.

```dockerfile
FROM node:24-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends \
      bash ca-certificates curl git ripgrep python3 python3-venv build-essential \
  && rm -rf /var/lib/apt/lists/*

RUN curl -LsSf https://astral.sh/uv/install.sh | sh \
  && install -m 0755 /root/.local/bin/uv /usr/local/bin/uv \
  && install -m 0755 /root/.local/bin/uvx /usr/local/bin/uvx \
  && rm -rf /root/.local

# Versions figées pendant toute la mission
ARG PI_VERSION=x.y.z
RUN npm install -g --ignore-scripts @earendil-works/pi-coding-agent@${PI_VERSION}

# Fork PI Studio buildé depuis les sources (étape à écrire d'après docs/release.md du dépôt)
WORKDIR /opt/pi-studio
COPY . .
RUN npm ci && npm run build

COPY docker/entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENV PI_WEB_APP_NAME="PI Studio"
WORKDIR /workspace/packs
EXPOSE 30141
ENTRYPOINT ["entrypoint.sh"]
```

### 7.2 `docker/entrypoint.sh` (responsabilités)

1. (Pas d'installation de pi-mcp-adapter : le Studio utilise le MCP intégré de Pi.)
2. Marquer `/workspace/packs` comme projet de confiance : écrire la décision dans `$PI_CODING_AGENT_DIR/trust.json` (chemin réel, par exemple via `ProjectTrustStore` du SDK). pi-web ignore `defaultProjectTrust`.
3. Initialiser `/workspace/packs` en dépôt Git s'il ne l'est pas ; configurer `safe.directory`.
4. Lancer le serveur du fork sur `0.0.0.0:30141`, sans ouverture de navigateur. `STUDIO_HOME=true` : `/` ouvre le dernier endroit utilisé, le Studio par défaut, ou Pi Web après « Retour à Pi Web » (cookie `pi_studio_place`).

### 7.3 docker-compose (VPS)

```yaml
services:
  pi-studio:
    build: .
    restart: unless-stopped
    env_file: .env            # PI_WEB_PASSWORD, PI_WEB_ALLOWED_HOSTS, jetons MCP…
    environment:
      STUDIO_TRUSTED_PROXY: "true"
      STUDIO_IDENTITY_HEADER: "Remote-User"
    volumes:
      - ./workspace:/workspace
      - ./pi-agent:/root/.pi/agent
      - ./studio-users.json:/opt/pi-studio/studio-users.json:ro
    networks: [traefik]
    # pas de "ports:" : accessible uniquement via Traefik
    labels:
      - traefik.enable=true
      - traefik.http.routers.pistudio.rule=Host(`studio.example.fr`)
      - traefik.http.routers.pistudio.entrypoints=websecure
      - traefik.http.routers.pistudio.tls.certresolver=le
      - traefik.http.routers.pistudio.middlewares=auth@file
      - traefik.http.services.pistudio.loadbalancer.server.port=30141

networks:
  traefik:
    external: true
```

Règles : pas de mot de passe dans l'image ; pas de socket Docker monté ; sauvegarde de `./workspace` et `./pi-agent` ; HTTPS obligatoire (l'agent dispose de bash).

---

## 8. Hors périmètre

- Base de connaissances Markdown / co-édition temps réel (décision reportée).
- OAuth pour les serveurs MCP.
- Serveurs MCP stdio via l'UI.
- Gestion multi-établissement, droits fins par pack.
- Exécution automatique de scripts de skills importées.

---

## 9. Questions ouvertes (à trancher avant ou pendant le lot concerné)

1. ~~Lot 1 : un dépôt Git unique ou un dépôt par pack ?~~ **Tranché : un dépôt unique.**
2. ~~Lot 1 : `SYSTEM.md` ou `APPEND_SYSTEM.md` par défaut ?~~ **Tranché : `APPEND_SYSTEM.md`** (`SYSTEM.md` en mode avancé).
3. Lot 2 : faut-il une notation automatique (présence de DOI, sources citées) en plus du verdict humain ? Proposition : non pour le MVP.
4. ~~Lot 3 : en-tête Bearer issu d'une variable d'environnement.~~ **Tranché : MCP intégré, `"Authorization": "Bearer ${NOM_VAR}"`.**
5. Déploiement : forward-auth seul, ou forward-auth + `PI_WEB_PASSWORD` (double connexion pénible pour les utilisatrices) ?

---

## 10. Méthode de travail attendue de l'agent de code

1. Lire `AGENTS.md`, `CONTEXT.md`, `docs/` du dépôt pi-web, et regarder les captures de `docs/studio/maquette/` ; produire dans `STUDIO-NOTES.md` une carte des modules de `lib/` réutilisables (sessions, modèles, fichiers, Git, sécurité).
2. Vérifier les chemins Pi et MCP (§1) dans la documentation de la version de Pi déclarée dans `package.json` et dans le dépôt de l'adaptateur ; consigner les écarts, et ce qui ne peut être vérifié qu'en local.
3. Proposer le plan du lot en cours (fichiers créés/modifiés) avant de coder.
4. Livrer lot par lot, critères d'acceptation vérifiés et notés dans `STUDIO-NOTES.md`.
5. Pousser régulièrement la branche de travail du fork (`studio`) : c'est attendu. Ne jamais pousser sur `main`, ne jamais forcer un push. Le Studio lui-même n'exécute jamais `git push` sur le dépôt des packs et n'en modifie jamais l'historique.
