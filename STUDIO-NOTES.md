# STUDIO-NOTES.md — PI Studio, notes de l'agent de code

Journal de travail associé à [STUDIO.md](STUDIO.md). Session 1 (2026-10-14) : lecture et cadrage, **aucun fichier de code modifié**.

Sources lues : `STUDIO.md`, `AGENTS.md`, `CONTEXT.md`, `CONTRIBUTING.md`, `docs/` (i18n, release, terminal, worktrees, `docs/agents/*`, ADR 0001 à 0006), les six captures de `docs/studio/maquette/`, le code de `lib/`, `proxy.ts`, `app/` et `hooks/useI18n.tsx`.

Les docs de Pi et de l'adaptateur viennent des paquets npm eux-mêmes (`npm pack`, rien n'est installé dans le dépôt) :

- `@earendil-works/pi-coding-agent@1.2.0`, la version épinglée dans `package.json` : `docs/configuration.md`, `security.md`, `settings.md`, `skills.md`, `mcp.md`, `cli.md`, ainsi que `dist/core/skills.js`, `trust-manager`, `system-prompt.js` et `utils/frontmatter.js` ;
- `pi-mcp-adapter@5.3.0`, la dernière version, publiée le 2026-10-13 : `docs/configuration.md`, `servers.md`, `auth.md` et `pi-builtin-comparison.md`.

Le dépôt n'avait pas de `node_modules`. Il faudra lancer `npm ci` avant de coder.

---

## 1. Carte des modules réutilisables de `lib/`

Convention du dépôt pour les tests : `node --test` charge les modules TypeScript avec `jiti` (`createJiti(import.meta.url, { alias: { "@": process.cwd() } })`). Les routes API se testent en important `route.ts` et en lui passant un `NextRequest` (voir `app/api/git/diff/route.test.mjs`). Dans `lib/studio/`, les imports seront relatifs pour que les tests restent simples.

### 1.1 Sessions (surtout pour le lot 2)

| Fichier | Fonctions clés | Usage Studio |
|---|---|---|
| `lib/rpc-manager.ts` | `startRpcSession()`, `AgentSessionWrapper` (`send()`, `isRunning()`, `shutdown()`), `getRpcSession()`, `getRunningRpcSessionIds()`, `destroyRpcSessionsForCwd()`, `resolveActiveToolNames()` | Point d'entrée pour exécuter un cas : une session neuve, `cwd` = le pack, un modèle explicite. `app/api/agent/new/route.ts` montre l'appel complet (`cwd`, `provider`, `modelId`, `toolNames`, `thinkingLevel`). |
| `lib/agent-event-stream.ts`, `agent-event-wire.ts` | flux d'événements de session (SSE) | Suivi en temps réel d'une campagne (lot 2). |
| `lib/session-reader.ts` | `listAllSessions()`, `openSessionManager()`, `getSessionEntries()`, `buildSessionContext()`, `resolveSessionPath()`, `readSessionHeader()` | Relire le `.jsonl` d'un cas terminé pour exporter le transcript (`tests/transcript.ts`). |
| `lib/normalize.ts` | `normalizeToolCalls()` | Normaliser les appels d'outils avant l'export Markdown. |
| `lib/session-title.ts` | `generateSessionTitle()` | Inutile au Studio. Les sessions de test seront nommées `[test] …`. |
| `lib/session-links.ts` | lien `?session=<id>` | Bouton « Ouvrir la session » de la revue (lot 2). |
| `lib/project-trust.ts` | `getProjectTrustStatus()`, `mayReadProjectConfigNow()`, `trustProject()`, `projectTrustReloadOptions()` | Savoir si Pi chargera bien les `.pi/*` d'un pack. Le résultat s'affiche dans Configuration et dans la validation (§2, écart E4). |
| `lib/skills-service.ts` | `loadSkillsWithInstallInfo(cwd)` (`DefaultResourceLoader` du SDK) | Contrôle « vu par Pi » : les skills que le runtime charge réellement dans le pack, avec ses diagnostics. |

### 1.2 Modèles

| Fichier | Fonctions clés | Usage Studio |
|---|---|---|
| `GET /api/models?cwd=` (`app/api/models/route.ts`) | `{ models, modelList, defaultModel, … }` | Liste des modèles proposés dans Configuration (modèle par défaut du pack) et, au lot 2, au lancement d'une campagne. On n'écrit rien de nouveau. |
| `lib/model-scope.ts` | `resolveVisibleModels()`, `orderSelectorModels()` | Mêmes règles d'`enabledModels` que pi-web. |
| `lib/default-preferences.ts` | `projectSettingsPath()`, `shadowingProjectKeys()`, `isThinkingLevel()` | Le modèle par défaut du pack s'écrit dans les clés `defaultProvider` / `defaultModel` du `.pi/settings.json` du pack. On reprend les mêmes noms de clés et la même validation. `writeDefaultPreferences()` écrit le fichier global : à ne pas utiliser ici. |
| `components/ModelSelector.tsx`, `SelectorRow.tsx` | sélecteur de modèle | Réutilisable tel quel (sans étoile : on ne passe pas `onSetDefault`). |
| `components/ModelsConfig.tsx`, Settings › Models | providers, `models.json`, test de modèle | La rubrique *Providers* du Studio y renvoie (section `models` de `lib/settings-navigation.ts`). |

### 1.3 Fichiers et sécurité des chemins

| Fichier | Fonctions clés | Usage Studio |
|---|---|---|
| `lib/path-security.ts` | `isPathWithinRoots()`, `isExistingPathWithinRoots()`, `hasParentDirectorySegment()`, `resolveRealRoots()` | Le cœur de `lib/studio/paths.ts`. L'unique racine est `STUDIO_PACKS_DIR`, résolue en chemin réel. On refuse `..`, puis on contrôle le préfixe après `realpath`. AGENTS.md exige de garder `isPathWithinRoots()` comme seule implémentation : on le réutilise, on ne le copie pas. |
| `lib/linked-directory.ts` | liens de répertoire sortant des racines | Modèle à suivre pour refuser les liens symboliques sortants d'un pack. |
| `lib/regular-file.ts` | `readRegularFileText(path, maxBytes)` | Lit uniquement les fichiers ordinaires, avec une taille plafonnée : AGENTS.md, SYSTEM.md, SKILL.md, `pack.json`. |
| `lib/atomic-file.ts` | `writePrivateFileAtomicSync()` | Écriture atomique, mais en mode 0600. Il faut une variante qui conserve le mode du fichier (0644 pour un fichier versionné). Elle ira dans `lib/studio/files.ts`, sans toucher l'amont. |
| `lib/key-serializer.ts` | `serializeByKey(storeKey, key, task)` | Sérialise toutes les écritures et opérations Git sur le dépôt des packs, avec une seule clé pour `STUDIO_PACKS_DIR`. Cela évite les conflits sur `index.lock` et les commits mélangés entre deux utilisatrices. |
| `lib/json-response.ts` | `jsonResponse()` | Réponses JSON des routes Studio. |
| `lib/jsonc.ts` | lecture JSON tolérante | Lecture de `.pi/settings.json`, que l'intégratrice peut éditer à la main. |
| `lib/file-access.ts`, `allowed-roots.ts` | `getAllowedFileRoots()`, `allowFileRoot()` | Ne servent pas aux routes Studio, qui ont leur propre racine. Au lot 2, « Ouvrir la session » passe par la vue pi-web. Les cwd des sessions y sont autorisés d'office. |
| `components/MarkdownBody.tsx`, `FrontmatterCard.tsx`, `lib/markdown.ts` | rendu Markdown avec plugins, carte de frontmatter | Aperçu de l'éditeur Markdown. |
| `lib/delimited-table.ts` | parsing tolérant des tableaux CSV/TSV | Exemple de style de parsing tolérant pour `tests/parse.ts` (lot 2). Le format Markdown impose malgré tout un parseur dédié. |

### 1.4 Git

| Fichier | Fonctions clés | Usage Studio |
|---|---|---|
| `lib/git-changes.ts` | helper interne `git(cwd, args)` (`execFile("git", ["-C", cwd, …])`, timeout de 10 s, `LC_ALL=C`), `getGitStatus()`, `getGitFileDiff()` | **Modèle à suivre, sans nouvelle dépendance** : `lib/studio/git.ts` appellera le binaire `git` par `execFile`, comme pi-web. Ni `simple-git` ni `isomorphic-git`. `getGitStatus(packDir)` sert aussi à détecter les modifications non enregistrées faites hors Studio. |
| `lib/git-status.ts` | `parseGitPorcelainV1()`, `classifyGitStatus()` | Lecture de `git status --porcelain=v1 -z`. |
| `lib/worktree.ts` | `resolveProject()`, `invalidateProjectCache()` | Regroupement des sessions par projet. Les sessions d'un pack se regrouperont sous le dépôt des packs (à prendre en compte pour le filtre `[test]` du lot 2). |
| `lib/paths.ts` | `samePath()`, `toNativePath()`, `toSlashPath()` | Comparer les chemins renvoyés par Git. |

### 1.5 Authentification et sécurité des requêtes

| Fichier | Fonctions clés | Usage Studio |
|---|---|---|
| `proxy.ts` | middleware Next : hôte autorisé, mot de passe (`PI_WEB_PASSWORD`, cookie ou Basic), throttle | **Réutilisé tel quel pour `/api/studio/*`**, déjà couvert par le matcher `/api/:path*`. Attention : le matcher ne couvre **pas** `/studio`. Voir la modification amont M1 au §3.2. |
| `lib/request-security.ts` | `isApiRequestAllowed()`, `isApiRequestHostAllowed()` | Contrôle d'origine et d'hôte (`PI_WEB_ALLOWED_HOSTS`), appliqué par `proxy.ts`. |
| `lib/web-auth.ts`, `lib/auth-throttle.ts` | `isWebPasswordEnabled()`, `isValidWebSessionToken()`… | Inchangés. L'identité Studio (§6 de la spec) s'ajoute à cette authentification sans la remplacer. |
| `lib/project-command-env.ts` | `sanitizeProjectCommandEnvironment()` | Rien au lot 1. À reprendre si le Studio lance un jour un processus. |

### 1.6 i18n

| Fichier | Fonctions clés | Usage Studio |
|---|---|---|
| `lib/i18n/types.ts` | `Locale = "en" \| "zh-CN" \| "zh-TW"`, `LocalePlugin` | Ajout de `"fr"`. |
| `lib/i18n/registry.ts` | `localePlugins`, `getLocalePlugin()`, `getSupportedLocales()`, `resolveBrowserLocale()` | Enregistrement de `frLocale`, `fr*` → `fr`, fusion des messages Studio. |
| `lib/i18n/format.ts` | `translateMessage()`, `interpolateMessage()`, `formatRelativeTime()`, `formatUpdatedTime()` | Toutes les chaînes Studio passent par `t()`. Les dates « dernière modification » s'affichent avec `formatUpdatedTime()`. |
| `hooks/useI18n.tsx` | `I18nProvider`, `useI18n()` ; `readInitialLocale()` accepte une **liste en dur** `en \| zh-CN \| zh-TW` | Remplacer cette liste par `getLocalePlugin(stored)`, sinon une locale `fr` enregistrée est ignorée. Le provider n'est monté que dans `app/page.tsx` : les pages `/studio` doivent le monter elles-mêmes. |
| `lib/i18n/messages/en.ts` (1 432 clés) | | Voir la question Q7 sur l'étendue de la traduction française. |

### 1.7 Skills et frontmatter

| Fichier ou export | Fonctions clés | Usage Studio |
|---|---|---|
| SDK : `parseFrontmatter` (`@earendil-works/pi-coding-agent`) | parseur YAML `yaml`. Le frontmatter doit commencer au premier octet (après un BOM éventuel) et se ferme au premier `\n---`. | **Parseur de référence pour la validation**, pour réagir exactement comme Pi. Une erreur YAML lève une exception : on la convertit en message français avec numéro de ligne. |
| `lib/frontmatter.ts` | `parseFrontmatter()` (js-yaml, silencieux en cas d'erreur) | Affichage seulement, ne sert pas à valider : son comportement diffère de celui de Pi. |
| `lib/skill-frontmatter.ts` | `setDisableModelInvocation()` : édition chirurgicale d'une clé | Modèle pour réécrire `name` et `description` sans casser le reste du YAML (formulaire et renommage). |
| `app/api/skills/**`, `components/SkillsConfig.tsx` | Settings › Skills | Ne servent pas directement : le Studio a sa propre édition. Le panneau reste utile à l'intégratrice. |

### 1.8 Interface réutilisable

- `components/SettingsUi.tsx` fournit des blocs sans état, qui prennent tous leurs libellés en props : `ConfigDetailGrid`, `ConfigFooterStatus`, `ConfigScopeTag`… Ils servent pour la colonne « Détails » de la maquette.
- `lib/stacked-dialog.ts` : gestion d'Échap et du focus des dialogues (confirmation de suppression, import de skill).
- `components/SidebarToast.tsx` : toast « Enregistré », avec un « Annuler » éventuel.
- Thème : tokens `--bg`, `--bg-panel`, `--border`, `--text*`, `--accent`… de `app/globals.css`. Voir la question Q9.

---

## 2. Vérification des chemins Pi et pi-mcp-adapter (§1 de STUDIO.md)

### 2.1 Tableau corrigé (Pi 1.2.0, pi-mcp-adapter 5.3.0)

| Fichier ou dossier | Lu par | Confiance projet requise ? | Statut par rapport à la spec |
|---|---|---|---|
| `AGENTS.md` (aussi `AGENTS.override.md`, `CLAUDE.md`), dans le cwd **et ses dossiers parents** | Pi | Non | ✅ Conforme. Attention aux parents (écart E6). |
| `.pi/SYSTEM.md` | Pi | Oui | ✅ Remplace le préambule, la liste des outils, les règles et les docs. Le contexte, les skills et le cwd restent ajoutés (écart E7). |
| `.pi/APPEND_SYSTEM.md` | Pi | Oui | ✅ Ajouté en section `addendum`. |
| `.pi/settings.json` | Pi | Oui (sa seule présence rend le dossier « à confier ») | ✅ Conforme. Clés : `defaultProvider`, `defaultModel`, `defaultThinkingLevel`, `defaultTools`, `packages`… |
| `.pi/skills/<nom>/SKILL.md` (+ `references/`, `scripts/`, `assets/`) | Pi | Oui | ✅ Découverte récursive. `.agents/skills/` est aussi lu, dans le cwd et ses parents. |
| `.pi/mcp.json` | **MCP intégré à Pi** (et l'adaptateur, qui le traduit) | Oui | ⚠️ **Absent de la spec** (écart E1). |
| `.mcp.json` | **pi-mcp-adapter uniquement** | Pas pour Pi. L'adaptateur exige la confiance projet **et** sa propre approbation | ⚠️ Ignoré par Pi s'il n'y a pas d'adaptateur (écarts E1 à E3). |
| `.pi/mcp-adapter.json` | pi-mcp-adapter | Approbation de l'adaptateur | ✅ Les surcharges projet passent par `mcpServers.<nom>.disabled: true`, la clé qu'écrit `/mcp-adapter disable`. |
| `~/.pi/agent/trust.json` | Pi **et pi-web** | n/a | ✅ Format `{ "<chemin réel>": true \| false }`. Une décision vaut pour le dossier et **tout ce qu'il contient**. |
| `defaultProjectTrust` (`~/.pi/agent/settings.json`) | Pi CLI uniquement | n/a | ⚠️ **Ignoré par pi-web** (écart E4). |
| `PI_CODING_AGENT_DIR` | Pi et pi-web (via `getAgentDir()` du SDK) | n/a | ✅ Confirmé (`docs/environment-variables.md`). |

### 2.2 Écarts à trancher

**E1 — Pi 1.2 a son propre MCP, et pi-web le gère déjà.** Depuis Pi 0.99, l'extension intégrée `mcp` lit `~/.pi/agent/mcp.json` et `.pi/mcp.json`, en Streamable HTTP ou stdio ; elle refuse SSE. pi-web 0.12 l'a branchée complètement (ADR 0006) : Settings › MCP (liste, ajout par collage, activation, test, OAuth), un `McpHost` par session (connexion au premier prompt, environnement nettoyé, confiance relue à chaque prompt) et le statut de chaque serveur. pi-mcp-adapter est une extension tierce, qui **remplace** le MCP intégré quand elle est installée.

- Dans les sessions pi-web, le `McpHost` passe alors inactif (`docs/agents/mcp-runtime.md`). L'adaptateur connecte les serveurs avec son propre transport, qui hérite de l'environnement complet par défaut (`inheritEnv: true`), `PI_WEB_PASSWORD` compris.
- À l'installation, l'adaptateur ajoute de lui-même `"-builtin:mcp"` à `~/.pi/agent/settings.json`. Settings › MCP de pi-web affiche alors le MCP intégré comme désactivé.
- **Proposition** : discuter au lot 3 l'usage du MCP intégré (`.pi/mcp.json`) à la place de l'adaptateur (`.mcp.json`). On réutilise ainsi ce qui existe (principe 4). Il manque `lifecycle`, `protocolVersion`, `directTools`, `includeTools` et `excludeTools`, qui ont pour équivalents `exposure` et `toolExposure`. Question Q4.

**E2 — Politique « Streamable HTTP uniquement ».** Avec l'adaptateur, un `url` donne du « StreamableHTTP avec repli SSE » : l'adaptateur se replie seul sur SSE si l'endpoint refuse Streamable HTTP (404, 405, 406, 415). Le Studio peut refuser `command` et `type: "sse"`, mais il ne peut pas empêcher ce repli par la configuration. Le MCP intégré, lui, refuse SSE.

**E3 — Approbation des serveurs projet par l'adaptateur.** Même dans un projet de confiance, un serveur de `.mcp.json` doit être approuvé une fois par l'utilisateur dans une session interactive. En mode print, JSON ou RPC, il est **ignoré**. Pour une session non interactive, il faut `"settings": { "projectServers": "allow" }` dans la configuration **globale** de l'adaptateur (`~/.pi/agent/mcp-adapter.json`). La valeur n'est pas acceptée dans un fichier projet.

On ne sait pas comment l'adaptateur voit une session pi-web, qui a une UI d'extension. Il peut ouvrir un dialogue d'approbation qui bloquerait une campagne de tests. À vérifier en local (V6).

**E4 — Confiance du dossier des packs.** pi-web n'utilise que les décisions de `trust.json`, exactes ou héritées d'un parent (`lib/project-trust.ts`). Il **ignore `defaultProjectTrust`** (ADR 0006, « Consequences »).

L'entrypoint (§7.2, point 2) doit donc écrire `{"/workspace/packs": true}` dans `$PI_CODING_AGENT_DIR/trust.json`, avec le chemin réel, par exemple avec `new ProjectTrustStore(agentDir).set("/workspace/packs", true)` du SDK. Tous les packs en héritent. `defaultProjectTrust: "always"` ne servirait qu'au CLI.

Dans l'environnement cloud, `STUDIO_PACKS_DIR` n'est pas de confiance. Le Studio doit afficher clairement « Pi ne chargera pas les consignes ni les skills de ce pack » avec `getProjectTrustStatus()`, sans essayer de régler la confiance lui-même. Le contrôle de pi-web (`trustFreshFolderAndWrite`) refuse justement de faire confiance à un dossier parent qui contient d'autres projets.

**E5 — Skills : Pi est plus tolérant que la spec.**

- Pi ne demande pas que `name` corresponde au nom du dossier. Il ne fait qu'avertir pour un nom invalide et charge la skill quand même. Il ne la refuse que si la description manque ou si le YAML est invalide.
- La spec, plus stricte, reste compatible : on garde ses règles bloquantes.
- Le contrôle de nom de Pi (`a-z0-9-`, pas de tiret au début, à la fin ni en double) est équivalent à la regex de la spec `^[a-z0-9]+(-[a-z0-9]+)*$`.
- La validation passera par le `parseFrontmatter` du SDK, pour que « valide pour le Studio » implique « chargé par Pi ».

**E6 — `AGENTS.md` des dossiers parents.** Pi lit aussi les `AGENTS.md` des parents du cwd. Un `AGENTS.md` à la racine de `/workspace/packs`, ou dans `/workspace`, s'appliquerait à **tous** les packs et n'apparaîtrait pas dans l'export d'un pack.

Recommandation : ne jamais en créer à la racine du dépôt des packs. La validation du lot 4 avertira s'il y en a un.

**E7 — Les skills dépendent des outils actifs.** Le bloc `skills` du prompt système n'est ajouté que si `read` ou `bash` est actif (`dist/core/system-prompt.js`). Une session de test lancée en « Chat only » ou sans ces outils **ne voit aucune skill**. Le runner du lot 2 doit imposer au moins `read`. Cela concerne aussi le choix SYSTEM.md / APPEND_SYSTEM.md (Q2).

**E8 — Champs de l'adaptateur et maquette.**

- `protocolVersion` accepte `"legacy"` (par défaut), `"auto"` ou `"2026-07-28"`. La valeur `2025-11-25` de la maquette n'est pas acceptée.
- Bearer avec l'adaptateur : `"auth": "bearer", "bearerTokenEnv": "NOM_VAR"`.
- Bearer valable pour l'adaptateur **et** le MCP intégré : `"headers": { "Authorization": "Bearer ${NOM_VAR}" }` (c'est aussi ce qu'écrit `pi mcp add --bearer-token-env-var`).
- Cela répond à la question ouverte 4 de la spec, sous réserve de la vérification V7.

**E9 — Dockerfile (§7.1).**

- `PI_VERSION` doit valoir `1.2.0`. pi-web exécute le SDK épinglé en interne ; le CLI global ne sert qu'aux vérifications manuelles et doit être de la même version.
- `npm run start` écoute sur `127.0.0.1`. Il faut `start:lan` ou `bin/pi-web.js` avec ses options d'hôte.
- `PI_WEB_APP_NAME` ne change que le manifeste PWA. Le `<title>` reste « Pi Web » (`app/layout.tsx`). `app/studio/layout.tsx` peut définir son propre titre sans toucher l'amont.

Ce n'est pas l'objet du lot 1.

**E10 — OAuth et adaptateur.** L'adaptateur range ses jetons OAuth dans le trousseau du système, sans repli en clair. Cela confirme que l'OAuth est hors périmètre dans le conteneur, comme le prévoit la spec.

### 2.3 Ce qui ne peut être vérifié qu'en local

Voir la section « À vérifier en local » (§6) : V1 à V8.

---

## 3. Plan détaillé du lot 1

### 3.1 Choix structurants (sous réserve des questions du §5)

- **Pas de nouvelle dépendance.** Git via `execFile`, comme `lib/git-changes.ts`. YAML via le `parseFrontmatter` du SDK et `js-yaml` (déjà présent) pour sérialiser. L'éditeur est un `<textarea>` monospace avec un aperçu `MarkdownBody` : pi-web n'a pas de composant d'édition, seulement des `<textarea>` (comme dans `AgentsConfig.tsx`). CodeMirror 6 seulement si vous le demandez (Q8).
- **Un dépôt Git unique** pour `STUDIO_PACKS_DIR`, comme le propose la spec (Q1). L'historique d'un pack se lit avec `git log -- <pack>/`.
- **Commits sérialisés** par `serializeByKey`, limités à la liste de chemins (`git add -- <chemins>` puis `git commit --only -- <chemins>`). Le dépôt n'est jamais réécrit : ni `reset`, ni `rebase`, ni `push`.
- **Concurrence optimiste.** L'éditeur garde l'empreinte (sha-256) du contenu chargé. Un enregistrement dont le fichier a changé sur le disque entre-temps reçoit `409` et le message « Ce fichier a été modifié par ailleurs. Recharger ». Deux bibliothécaires peuvent ainsi travailler en même temps.
- **Restauration = nouveau commit** avec le contenu de `git show <rev>:<chemin>`.
- Les identifiants techniques (ids de commit, chemins) ne transitent que dans le JSON des API. L'interface n'affiche que « Version du 14 oct. 2026 à 15 h 20 — Géraldine — Modifie skill openalex-search ».

### 3.2 Modifications du code amont (avec justification)

| # | Fichier | Modification | Justification |
|---|---|---|---|
| M1 | `proxy.ts` | Ajouter `"/studio/:path*"` (et `"/studio"`) au `matcher` | **Hors liste autorisée, indispensable.** Le matcher ne couvre que `/`, `/login` et `/api/*`. Sans cet ajout, les pages `/studio` échappent au mot de passe et au contrôle d'hôte. Les données passent par `/api/studio`, qui est protégé, mais la page de connexion doit s'afficher. Diff d'une ligne. |
| M2 | `lib/i18n/types.ts` | `Locale` reçoit `"fr"` | Point d'accroche autorisé (locale `fr`), conforme à `docs/i18n.md` § 3. |
| M3 | `lib/i18n/registry.ts` | Enregistrer `frLocale`, `resolveBrowserLocale` : `fr` et `fr-*` → `fr`, fusion des messages Studio (`studioMessages.fr` et `.en`) dans les packs `fr` et `en` | Point d'accroche autorisé. La fusion évite de toucher `en.ts`, `zh-CN.ts` et `zh-TW.ts`, que l'amont modifie souvent. Les autres langues retombent sur l'anglais. |
| M4 | `hooks/useI18n.tsx` | `readInitialLocale()` : la liste en dur est remplacée par `getLocalePlugin(stored)` | Sans ce changement, la locale `fr` enregistrée est ignorée au rechargement. Ce serait aussi le correctif à proposer à l'amont. |
| M5 | `lib/i18n/registry.test.mjs` | Cas `fr` (identifiant, `fr-FR` → `fr`, une traduction) | Exigé par `docs/i18n.md` § 4. |
| M6 | `components/SessionSidebar.tsx` (ligne d'outils) ou `components/AppShell.tsx` | Un lien « Studio » vers `/studio` | Point d'accroche autorisé (entrée de navigation). Emplacement exact à valider (Q10). |
| M7 | `package.json` | Aucune modification au lot 1 | Seulement si Q8 retient CodeMirror. |

Aucune autre modification amont. `.gitignore` ignore déjà `/test-results/`, où l'e2e écrit.

### 3.3 Fichiers créés

**Bibliothèque `lib/studio/`** (côté serveur sauf mention contraire)

| Fichier | Contenu |
|---|---|
| `config.ts` | `getStudioConfig()` : `STUDIO_PACKS_DIR` (par défaut `/workspace/packs`), `STUDIO_IDENTITY_HEADER`, `STUDIO_TRUSTED_PROXY`, `STUDIO_DEFAULT_USER` (par défaut `studio`), `STUDIO_USERS_FILE` (par défaut `<cwd du serveur>/studio-users.json`, voir Q6). Dossier agent via `getAgentDir()` du SDK. Lu à chaque appel pour que les tests puissent changer l'environnement. |
| `paths.ts` | `assertPackId()` et `assertSkillName()` (regex de la spec), `resolvePackDir(id)`, `resolvePackFile(id, relPath)`. Repose sur `isPathWithinRoots` et `hasParentDirectorySegment`, avec `lstat` à chaque segment pour refuser tout lien symbolique. Liste blanche des chemins éditables du lot 1 : `AGENTS.md`, `.pi/SYSTEM.md`, `.pi/APPEND_SYSTEM.md`, `.pi/settings.json` (mode avancé), `.pi/skills/<nom>/**`. `.studio/pack.json` reste réservé à l'API. |
| `files.ts` | `readPackText()` (via `readRegularFileText`, plafond de 1 Mio) et `writePackTextAtomic()` (fichier temporaire, `rename`, mode conservé). `contentHash()` pour la concurrence optimiste. |
| `errors.ts` | `StudioError { code, status, params }`. Les codes sont des clés i18n (`studio.error.*`) : l'API ne renvoie jamais de phrase en anglais. |
| `identity.ts` | `getStudioIdentity(headers)` lit `STUDIO_IDENTITY_HEADER` **uniquement si** `STUDIO_TRUSTED_PROXY === "true"`, sinon `STUDIO_DEFAULT_USER`. `toGitAuthor(identity)` cherche dans `studio-users.json` `{ "<id>": { "name": "…", "email": "…" } }` et retombe sur `<id> <<id>@studio.invalid>` (Q6). Valeurs nettoyées : pas de retour à la ligne, de `<` ni de `>`. |
| `git.ts` | `ensureRepository()` (init idempotent, voir Q11), `commitPaths({ paths, message, author })` (`--author` plus `GIT_COMMITTER_*`, `-c core.quotepath=off`), `fileHistory(relPath, { follow })`, `fileAtRevision(rev, relPath)`, `restoreFile(…)`, `moveDirectory()` (`git mv`), `removePaths()` (`git rm -r`), `lastCommitFor(packId)`, `headCommit()`, `dirtyPaths(packId)`. Tous les appels passent par `serializeByKey`. Les `rev` reçues de l'API sont contrôlées (`^[0-9a-f]{7,40}$`) et doivent appartenir à l'historique du fichier. |
| `commit-message.ts` | Messages générés, en français, dans le format de la spec : `[literature-review] Crée le pack`, `Modifie AGENTS.md`, `Modifie consignes système`, `Crée skill x`, `Modifie skill x`, `Renomme skill x en y`, `Supprime skill x`, `Restaure <fichier> (version du …)`, `Modifie configuration`. Un complément de message optionnel est saisi par l'utilisatrice (une seule ligne, longueur bornée). |
| `packs.ts` | `listPacks()` : sous-dossiers contenant `.studio/pack.json`, avec titre, statut, version et date de dernière modification (`lastCommitFor`). `readPack()`, `createPack({ id, title, description, owner })` : dossier, `pack.json`, `AGENTS.md`, prompt système, `.pi/settings.json` minimal, commit initial ; refus si le pack existe. `updatePackMeta()` (titre, description, statut). `setPackDefaultModel()`. `packJourney(id)` calcule l'état des trois étapes (§3.5). |
| `skills.ts` | `listSkills(packId)`, `readSkill()` (renvoie `{ name, description, body, raw, extraFrontmatter }`), `serializeSkill()` (réécrit `name` et `description` en conservant les autres clés et l'ordre, sur le modèle de `skill-frontmatter.ts`), `createSkillFromTemplate()`, `importSkill(markdown)` (collé ou téléversé ; nom tiré du frontmatter, saisi s'il manque ; aucun script exécuté), `renameSkill(old, new)` (`git mv` puis réécriture de `name`, un seul commit), `deleteSkill()`. |
| `validate.ts` | `validateSkill({ dirName, raw, existingFiles })` → `{ errors[], warnings[] }`, chaque problème ayant `{ code, line?, params }`. Erreurs : frontmatter absent ou pas en tête, YAML invalide (ligne), `name` absent, différent du dossier, ne respectant pas la regex ou trop long, `description` absente, vide ou de plus de 1024 caractères. Avertissement : lien relatif (`references/…`, `scripts/…`, `assets/…`, liens Markdown `[..](rel)`) vers un fichier inexistant ou sortant de la skill. `validatePackId()`. `validatePack()` minimal pour le lot 1 (AGENTS.md et prompt système présents) ; le lot 4 le complétera. Fonctions **pures**, sans accès disque : la liste des fichiers est fournie par l'appelant. |
| `templates.ts` | Charge `studio-templates/` et remplace `{{id}}`, `{{title}}`, `{{description}}`, `{{name}}`. Le modèle de skill est validé par un test. |
| `client.ts` (client) | `fetch` typés vers `/api/studio/*` et conversion des `StudioError` en `t()`. |
| `types.ts` (partagé) | `PackMeta`, `PackStatus`, `SkillSummary`, `HistoryEntry`, `ValidationIssue`, `JourneyState`. |

**Modèles `studio-templates/`** (en français, pour le lot 1)

- `pack/AGENTS.md` : « # Pack : {{title}} », avec les sections Finalité, Ressources et Règles communes, comme dans la maquette.
- `pack/SYSTEM.md` **ou** `pack/APPEND_SYSTEM.md` (Q2).
- `pack/settings.json` : `{}`. Le modèle par défaut est ajouté depuis Configuration.
- `skill/SKILL.md` : frontmatter `name` et `description`, puis les sections « Quand l'utiliser », « Entrées », « Procédure » et « Sortie » de la maquette.
- (`tests/suite.md` viendra au lot 2.)

**Routes `app/api/studio/`** (toutes derrière `proxy.ts`, qui gère le mot de passe et l'hôte)

| Route | Méthodes |
|---|---|
| `me/route.ts` | GET : identité affichée. |
| `packs/route.ts` | GET : liste. POST : création. |
| `packs/[pack]/route.ts` | GET : métadonnées, étapes, confiance Pi, modifications faites hors Studio. PATCH : titre, description, statut, modèle par défaut. |
| `packs/[pack]/files/route.ts` | GET `?path=` : contenu et empreinte. PUT `{ path, content, baseHash, note? }` : enregistrement et commit, `409` en cas de conflit. Liste blanche §3.3. |
| `packs/[pack]/skills/route.ts` | GET : liste avec l'état de validation de chaque skill. POST `{ name, description }` (depuis le modèle) ou `{ import: markdown }`. |
| `packs/[pack]/skills/[skill]/route.ts` | GET. PUT `{ name, description, body \| raw, baseHash, note? }` : validation bloquante, puis commit. PATCH `{ newName }` : renommage. DELETE : suppression. |
| `packs/[pack]/history/route.ts` | GET `?path=` : versions. GET `?path=&rev=` : contenu d'une version pour l'aperçu. POST `{ path, rev }` : restauration. |
| `packs/[pack]/pi-check/route.ts` | GET : skills vues par Pi (`loadSkillsWithInstallInfo(packDir)`) et diagnostics, plus l'état de confiance. Lecture seule. |

**Pages `app/studio/`**

- `layout.tsx` : `I18nProvider`, `Suspense`, `metadata.title = "PI Studio"`.
- `page.tsx` : accueil (liste des packs, « Nouveau pack »).
- `[pack]/page.tsx` : atelier du pack, avec `?section=consignes|skills|mcp|tests|configuration|providers&item=…`.

**Composants `components/studio/`**

| Composant | Rôle |
|---|---|
| `StudioShell.tsx` | En-tête « PI Studio · Pack actif · version », retour vers Pi Web, colonne de navigation de l'atelier, parcours Concevoir → Connecter → Évaluer. |
| `PackList.tsx`, `NewPackDialog.tsx` | Accueil (avec état vide « Aucun pack. Créer le premier pack »), formulaire de création (titre → identifiant proposé et modifiable). |
| `JourneySteps.tsx` | Les trois étapes avec leur indicateur : à faire, en cours, prêt, ou « bientôt » pour les lots 2 et 3. |
| `WorkshopNav.tsx` | Consignes, Skills, MCP (« disponible au lot 3 »), Tests (« lot 2 »), Configuration, Providers (lien vers Settings › Models). |
| `MarkdownEditor.tsx` | Textarea avec bascule Édition / Aperçu (`MarkdownBody`), « Enregistrer » plus Ctrl/Cmd+S, pastille « modifications non enregistrées », garde `beforeunload`, champ « Note de version (facultatif) ». |
| `InstructionsPanel.tsx` | Onglets AGENTS.md et consignes système. |
| `SkillList.tsx`, `SkillEditor.tsx` | Liste filtrable avec l'état prêt / à vérifier. Éditeur avec formulaire (nom, description et compteur 0/1024) au-dessus du corps Markdown. Le YAML brut n'apparaît qu'en mode avancé. |
| `SkillCreateDialog.tsx`, `SkillImportDialog.tsx`, `SkillRenameDialog.tsx` | Création depuis le modèle, import (collage ou fichier `.md`), renommage. |
| `ConfirmDialog.tsx` | Confirmation explicite (« Supprimer la skill openalex-search ? Elle restera récupérable dans l'Historique du pack »). |
| `HistoryPanel.tsx` | Versions (auteur, date, message), aperçu d'une version, « Restaurer cette version ». |
| `ValidationList.tsx` | Problèmes en français : ligne, problème et correction attendue. Rouge = bloquant, orange = avertissement. |
| `ConfigurationPanel.tsx` | Métadonnées (titre, description, statut) et modèle par défaut (`ModelSelector`). En mode avancé : `.pi/settings.json` brut. |
| `AdvancedModeToggle.tsx` | Mode avancé, mémorisé par navigateur (`localStorage`, avec `try`/`catch`). |
| `studio.css` | Mise en page en trois colonnes de la maquette, responsive tablette, **avec les tokens existants** de `globals.css` (Q9). |

**Messages i18n** : `lib/studio/i18n/fr.ts` et `en.ts` (clés `studio.*`), fusionnés par M3. Le `fr` est complet ; le `en` sert de repli lisible.

### 3.4 Règles et vocabulaire

- Libellés : Enregistrer, Version, Historique, Restaurer, Note de version, Nouveau pack, Supprimer, Renommer, Importer, Mode avancé.
- Jamais en vue par défaut : commit, branche, HEAD, diff, JSON, YAML, cwd, chemin absolu. Un test le vérifie dans les messages `studio.*` du `fr` (§4).
- Les scripts des skills (`scripts/`) ne sont jamais exécutés. L'import n'accepte qu'un `SKILL.md`. Les dossiers `references/` et `scripts/` d'une skill importée restent hors du lot 1 (Q12).

### 3.5 Indicateurs du parcours (lot 1)

- **Concevoir** : *prêt* si AGENTS.md et le prompt système sont présents et non vides, et si au moins une skill est valide. *En cours* si l'un des deux existe. *À faire* sinon.
- **Connecter** : « disponible au lot 3 », en grisé. Les providers sont considérés comme configurés si `/api/models` renvoie au moins un modèle ; cette indication est seulement informative.
- **Évaluer** : « disponible au lot 2 ».

### 3.6 Ordre de travail proposé (commits lisibles)

1. `npm ci`. Vérifier `tsc`, `lint` et `npm test` sur la base.
2. `lib/studio/{config,paths,errors,files}.ts` avec leurs tests.
3. `validate.ts`, `commit-message.ts`, `identity.ts` avec leurs tests.
4. `git.ts` avec ses tests sur un dépôt temporaire.
5. `templates.ts`, `studio-templates/`, `packs.ts`, `skills.ts` avec leurs tests.
6. i18n `fr` (M2 à M5).
7. Routes `app/api/studio/**` avec leurs tests de route.
8. Pages et composants, M1 (`proxy.ts`), M6 (lien de navigation).
9. e2e du parcours du lot 1, puis vérification visuelle avec `npm run dev`.
10. Mise à jour de ce fichier : critères d'acceptation vérifiés, procédure « À vérifier en local ».

---

## 4. Stratégie de test du lot 1

### 4.1 Unitaire (`npm test`, `node:test` + `jiti`, dossiers `mkdtemp`, aucun réseau ni LLM)

| Sujet | Cas principaux |
|---|---|
| `config.ts` | Valeurs par défaut, variables d'environnement, `PI_CODING_AGENT_DIR` respecté. |
| `paths.ts` | Identifiants valides et invalides. `..` et `%2e%2e` refusés, chemin absolu refusé, lien symbolique sortant (fichier et dossier) refusé, lien interne refusé (aucun lien accepté), chemin hors liste blanche refusé, `.studio/pack.json` non éditable par `files`. |
| `validate.ts` | Table de cas : frontmatter absent, pas en tête (ligne vide ou BOM), non fermé, YAML invalide (numéro de ligne), `name` absent, différent du dossier, avec majuscules, `--`, tiret final, 65 caractères, `description` absente, vide ou de 1 025 caractères. Liens relatifs existants, absents, sortants ; URL absolue ignorée. Parité avec Pi : tout ce que `validateSkill` accepte se charge sans diagnostic avec le `DefaultResourceLoader` du SDK. |
| `identity.ts` | En-tête ignoré si `STUDIO_TRUSTED_PROXY` n'est pas défini. En-tête lu sinon, avec le nom configurable. Repli sur `STUDIO_DEFAULT_USER`. Correspondance avec `studio-users.json`, fichier absent ou invalide. Valeurs nettoyées (`\n`, `<>`). |
| `git.ts` (vrai `git` sur un dépôt temporaire) | Un commit par enregistrement, avec le bon auteur et committer. Seuls les chemins demandés sont commités, même si un autre fichier est modifié ou indexé. Historique d'un fichier avec auteur, date et message. La restauration crée un **nouveau** commit, sans modifier les commits précédents (`git rev-list` contrôlé). Le renommage suit l'historique (`--follow`). Suppression. Deux enregistrements simultanés sont sérialisés : deux commits, aucune erreur `index.lock`. `rev` invalide ou étrangère au fichier refusée. |
| `commit-message.ts` | Formats exacts de la spec, note libre tronquée et ramenée à une ligne. |
| `packs.ts` | Création : fichiers attendus, `pack.json` conforme au §2.2, commit initial ; refus d'un doublon. Liste triée avec date de dernière modification. Étapes du parcours. |
| `skills.ts` | Création depuis le modèle (valide). Sérialisation du formulaire qui conserve les autres clés du frontmatter. Import collé (avec et sans frontmatter). Renommage (dossier et `name`, un seul commit). Suppression. |
| `templates.ts` | Chaque modèle se remplit sans laisser de `{{…}}`. Le SKILL.md modèle est valide. |
| i18n | `fr` enregistré, `fr-FR` → `fr`, `readInitialLocale` accepte `fr`. Les clés `studio.*` existent en `fr` et en `en`. Aucun mot interdit (commit, branch, HEAD, diff, JSON, YAML, stdio, cwd) dans les valeurs `studio.*` du `fr` hors mode avancé. |
| Routes `app/api/studio/**` | Création, puis lecture et enregistrement avec `baseHash` (200 puis 409), validation bloquante (422 avec ses problèmes), avertissement non bloquant (200 avec avertissements), historique et restauration, en-têtes d'identité. |

### 4.2 e2e (`e2e/studio.mjs`, branché dans `e2e/run.mjs`)

Serveur de dev isolé avec `STUDIO_PACKS_DIR` et `PI_CODING_AGENT_DIR` temporaires, puis Playwright avec le Chromium préinstallé. Le parcours suit le critère d'acceptation :

1. créer un pack ;
2. ajouter une skill depuis le modèle ;
3. l'enregistrer, puis la modifier avec Ctrl+S ;
4. restaurer la première version ;
5. vérifier qu'aucun des mots interdits n'apparaît dans le texte visible ;
6. vérifier avec `git log` qu'il y a un commit par enregistrement, avec le bon auteur.

### 4.3 Ce qui ne peut être vérifié que dans le cloud, sans LLM

`tsc --noEmit`, `npm run lint`, `npm test` et l'e2e. Le serveur de dev permet de vérifier l'affichage des pages, sans provider ni MCP.

---

## 5. Questions

### Questions ouvertes de la spec (§9) concernant le lot 1

**Q1 — Un dépôt unique ou un dépôt par pack ?** Je recommande le **dépôt unique** de la spec : les tags `<pack>/v<version>` du lot 4 et `git log -- <pack>/` suffisent, la sauvegarde est simple, et la sérialisation des commits règle la concurrence. Le seul coût : un dépôt par pack éviterait que l'historique de l'un pèse sur l'autre, ce qui est négligeable à cette échelle. → Confirmez-vous ?

**Q2 — `SYSTEM.md` ou `APPEND_SYSTEM.md` par défaut ?** Je recommande **`APPEND_SYSTEM.md`**.

- `SYSTEM.md` remplace tout le préambule de Pi, y compris la description des outils et les règles d'usage (`read`, `edit`…). Pour un petit modèle local, c'est un risque de mauvais usage des outils.
- `APPEND_SYSTEM.md` garde ce socle et ajoute les consignes du pack.
- Dans les deux cas, les skills et `AGENTS.md` restent dans le prompt (E7).
- L'écran « Consignes » proposerait en mode avancé de basculer vers « Remplacer entièrement les consignes de Pi ».

### Autres points ambigus

**Q3 — Push de la branche `studio`.** Le §10.5 dit « Ne jamais exécuter `git push` ». La session cloud, elle, demande de pousser sur `studio`, faute de quoi le travail est perdu. Je lis le §10.5 comme une règle sur le **dépôt des packs** : le Studio ne pousse jamais. J'ai donc poussé `STUDIO-NOTES.md` et `docs/studio/maquette/` sur `origin/studio`. Est-ce correct ?

**Q4 — MCP intégré ou pi-mcp-adapter ?** Voir E1 à E3. La décision appartient au lot 3, mais elle compte dès le lot 1 pour le contenu de `.pi/settings.json`, l'entrypoint et la documentation. Ma recommandation : **le MCP intégré de Pi 1.2 (`.pi/mcp.json`)**, déjà géré par pi-web. Ce choix supprime l'approbation propre à l'adaptateur (E3) et le repli SSE (E2), et conserve le transport nettoyé de pi-web. Faut-il garder l'adaptateur pour des fonctions qu'il est seul à offrir (lifecycle `lazy`, `protocolVersion`, élicitation) ?

**Q5 — « Lot 6 » dans la question ouverte 5.** Aucun lot 6 n'est défini au §3. Je suppose qu'il s'agit du déploiement (§6 et §7). Au lot 1, je n'implémente que `identity.ts`, nécessaire à l'auteur des commits, et je garde `PI_WEB_PASSWORD` tel quel. D'accord ?

**Q6 — `studio-users.json`.** Emplacement : variable `STUDIO_USERS_FILE`, par défaut `./studio-users.json` à côté du serveur (`/opt/pi-studio/` en conteneur). Format proposé : `{ "geraldine": { "name": "Géraldine Geoffroy", "email": "…" } }`. Pour une identité absente du fichier, je propose `id <id@studio.invalid>` plutôt qu'un refus d'enregistrer. Faut-il au contraire refuser ?

**Q7 — Étendue du français.** Faut-il traduire **tout pi-web**, soit 1 432 clés, ou **seulement le Studio** ? Dans le second cas, les écrans pi-web (sessions, Settings › Models) restent en anglais quand la locale est `fr`. Je propose le Studio seul au lot 1. La traduction de pi-web serait un lot à part : beaucoup de travail, et un fichier `fr.ts` à suivre à chaque rebase. Et faut-il forcer `fr` dans `/studio`, quelle que soit la langue du navigateur ?

**Q8 — Éditeur.** Pour rester sans dépendance, je propose un textarea avec aperçu. La maquette montre des numéros de ligne et une coloration Markdown, ce qu'apporterait CodeMirror 6 (`@codemirror/*`, environ 150 Ko). Faut-il les numéros de ligne dès le lot 1 ? Ils aident à suivre « ligne 3 : … » dans les messages d'erreur.

**Q9 — Charte graphique.** La maquette utilise un vert et des titres en serif. `CONTRIBUTING.md` (amont) interdit les nouvelles couleurs. Je propose les **tokens pi-web** (`--accent`…), donc un Studio cohérent avec le reste et en thème clair ou sombre, avec la mise en page de la maquette. Voulez-vous plutôt la palette de la maquette ?

**Q10 — Entrée « Studio ».** Je propose un bouton dans la ligne d'outils de la barre latérale de pi-web, à côté de « Nouvelle session » et de la recherche, et un lien « Retour à Pi Web » dans l'en-tête du Studio. Faut-il plutôt faire de `/studio` la page d'accueil pour les bibliothécaires ?

**Q11 — Initialisation du dépôt des packs.** La spec la confie à l'entrypoint. Je propose que le Studio fasse aussi un `git init` idempotent si `STUDIO_PACKS_DIR` n'est pas un dépôt, pour le développement et les tests. Il ajouterait un `.gitignore` racine minimal (`.pi/mcp-traces/`, `*.log`). D'accord, ou faut-il refuser de démarrer sans dépôt ?

**Q12 — Import de skill.** Au lot 1, l'import accepte uniquement un `SKILL.md`, collé ou téléversé. Faut-il aussi accepter un `.zip` (avec `references/`, `scripts/`, `assets/`) ? Il faudrait un dézippage sécurisé : chemins, taille, liens. Les fichiers de `references/` sont-ils éditables dans le Studio, ou seulement affichés ?

**Q13 — Écrans de la maquette hors lot 1.** La maquette montre des boutons « Agents » (lot 5, différé), « Valider » et « Exporter » (lot 4), « Connexion requise », et un onglet « Validation » dans la colonne de droite. Au lot 1, je propose :

- masquer « Agents » ;
- remplacer « Valider » par la liste de validation de l'élément ouvert (onglet Validation) ;
- masquer « Exporter ».

D'accord ?

**Q14 — Suppression et restauration.** « Restauration toujours possible via l'historique » vaut aussi pour une skill **supprimée**. Son historique de fichier n'est plus accessible depuis la liste. Je propose un Historique au niveau du pack, qui liste les enregistrements du pack et permet de « Restaurer cette skill ». Au lot 1, ou plus tard ?

**Q15 — Modifications faites hors Studio.** Un pack peut être modifié hors Studio : par l'agent dans une session pi-web (qui a `write` et `edit`), par l'intégratrice ou par un `git pull`. Les fichiers modifiés restent alors hors commit. Je propose de les signaler (« 2 fichiers modifiés en dehors du Studio ») avec « Enregistrer ces modifications » et « Annuler ces modifications ». « Annuler » restaurerait la dernière version par un nouveau commit, sans `git checkout` destructif. Faut-il cela dès le lot 1 ?

**Q16 — Modèle par défaut du pack.** Il s'écrit dans `defaultProvider` / `defaultModel` du `.pi/settings.json` du pack, ce que le CLI respecte. Dans pi-web, une nouvelle session présélectionne le modèle par défaut **global** (`docs/agents/models.md`). Il faut vérifier que `GET /api/models?cwd=<pack>` résout bien celui du projet (V8). Sinon, la présélection pi-web ignorera celui du pack, alors que le runner du lot 2 passera le modèle explicitement de toute façon.

---

## 6. À vérifier en local (intégratrice)

À compléter à chaque lot. Pour le lot 1 :

- **V1 — La skill est chargée par le CLI.**
  1. Dans le conteneur : `cd /workspace/packs/<pack> && pi --version` doit afficher `1.2.0`.
  2. Lancer `pi`, puis `/skill:<nom>` : la skill doit se charger.
  3. Vérifier qu'aucun diagnostic n'apparaît au démarrage.
  4. Variante non interactive : `pi -p "Liste les skills disponibles"` ne doit montrer aucun avertissement de confiance.
- **V2 — La confiance est héritée.** `cat $PI_CODING_AGENT_DIR/trust.json` doit contenir `"/workspace/packs": true`, avec le chemin réel. Dans pi-web, une session ouverte dans un pack ne doit pas afficher le dialogue de confiance.
- **V3 — Auteur des commits.** Derrière Traefik et forward-auth, avec `STUDIO_TRUSTED_PROXY=true` : `git -C /workspace/packs log --format='%an <%ae> | %s'` doit montrer un commit par enregistrement, avec l'auteur pris dans `studio-users.json`.
- **V4 — En-tête d'identité.** Sans le proxy (accès direct au port), l'en-tête `Remote-User` envoyé à la main doit être **ignoré** si `STUDIO_TRUSTED_PROXY` n'est pas défini.
- **V5 — `safe.directory`.** Le volume `./workspace` appartient à un autre utilisateur que celui du processus. Les commits doivent quand même réussir, ce qui dépend de l'entrypoint.

Pour les lots suivants, à confirmer dès maintenant si possible :

- **V6 (lot 3, si l'adaptateur est retenu)** : `pi install npm:pi-mcp-adapter`, puis vérifier que `~/.pi/agent/settings.json` a reçu `-builtin:mcp`. Dans une session pi-web d'un pack contenant un `.mcp.json`, observer si l'adaptateur affiche un dialogue d'approbation ou ignore le serveur. Recommencer avec `"settings": { "projectServers": "allow" }` dans `~/.pi/agent/mcp-adapter.json`.
- **V7 (lot 3)** : serveur Streamable HTTP avec `"auth": "bearer", "bearerTokenEnv": "X"` (adaptateur) et avec `"headers": { "Authorization": "Bearer ${X}" }` (intégré). Vérifier que la variable fournie par `.env` est bien envoyée.
- **V8 (lots 1 et 2)** : `curl '/api/models?cwd=/workspace/packs/<pack>'` doit renvoyer le `defaultModel` du pack et non celui du global (Q16).

---

## 7. Journal

- 2026-10-14 : ajout de `docs/studio/maquette/` (6 captures). Seul ce dossier venait de l'archive : le reste de `docs/` existait déjà dans le dépôt.
- 2026-10-14 : rédaction de ce fichier. Aucun code modifié. **En attente de relecture avant le lot 1.**
