# Tester PI Studio en local (Windows et Docker Desktop)

Cette procédure installe le Studio sur votre ordinateur, dans un conteneur Docker, puis vérifie le lot 1 point par point. Aucune connaissance en développement n'est nécessaire : il suffit de copier les commandes dans PowerShell.

Le Studio est publié uniquement sur votre ordinateur, à l'adresse <http://localhost:30141>. Personne d'autre sur le réseau ne peut y accéder.

---

## 1. Ce qu'il faut avant de commencer

- **Docker Desktop**, démarré : la baleine doit être visible dans la barre des tâches.
- **Git pour Windows**. À défaut, téléchargez l'archive ZIP de la branche `studio` depuis GitHub et décompressez-la.
- **llama.cpp**, lancé sur Windows avec le modèle Qwen3-VL-8B. Deux points comptent :
  - le serveur doit écouter sur toutes les interfaces, sinon le conteneur ne peut pas le joindre : ajoutez `--host 0.0.0.0` à la commande `llama-server` ;
  - si le pare-feu Windows pose la question, autorisez l'accès sur les **réseaux privés**.

Notez le **port** de llama.cpp (souvent `8080`) et le **nom exact du modèle**. Pour l'obtenir, ouvrez PowerShell et tapez :

```powershell
curl.exe http://localhost:8080/v1/models
```

Le nom du modèle est la valeur de `"id"` dans la réponse.

## 2. Récupérer la branche

Dans PowerShell, placez-vous dans le dossier de votre choix, puis :

```powershell
git clone -b studio https://github.com/gegedenice/pi-web-studio.git
cd pi-web-studio
```

Toutes les commandes qui suivent se tapent **dans ce dossier `pi-web-studio`**.

## 3. Préparer le fichier `.env`

```powershell
Copy-Item .env.example .env
notepad .env
```

- `PI_WEB_PASSWORD` : laissez vide pour commencer. Un mot de passe sera ajouté pour la vérification V9.
- `STUDIO_DEFAULT_USER=geraldine` : le nom enregistré comme autrice des versions. Les noms complets associés sont dans `docker/studio-users.dev.json`.

Le fichier `.env` reste sur votre machine : il n'est jamais envoyé sur GitHub ni copié dans l'image.

## 4. Démarrer le Studio

```powershell
docker compose -f compose.dev.yml up --build
```

Le premier démarrage prend de 5 à 15 minutes, le temps de construire l'image ; les suivants ne prennent que quelques secondes. Le Studio est prêt quand le journal affiche à la fois :

```
[entrypoint] starting PI Studio on 0.0.0.0:30141
… Ready …
```

Ouvrez alors <http://localhost:30141> dans votre navigateur.

Gardez cette fenêtre PowerShell ouverte : elle affiche le journal du Studio. Ouvrez une **deuxième fenêtre PowerShell** dans le même dossier pour les commandes de vérification, et commencez-y par définir ce raccourci :

```powershell
function studio { docker compose -f compose.dev.yml exec pi-studio @args }
```

À partir de là, `studio <commande>` exécute `<commande>` dans le conteneur. Le raccourci est à redéfinir à chaque nouvelle fenêtre PowerShell.

**Arrêter le Studio** : `Ctrl+C` dans la première fenêtre, ou `docker compose -f compose.dev.yml down`.
Les packs et les réglages de Pi sont conservés sur votre disque, dans `dev\workspace` et `dev\pi-agent`.
**Repartir de zéro** : arrêtez le Studio, puis supprimez le dossier `dev`.

## 5. Configurer le provider llama.cpp

1. Copiez l'exemple fourni dans le dossier de Pi :

   ```powershell
   Copy-Item docker\models.example.json dev\pi-agent\models.json
   notepad dev\pi-agent\models.json
   ```

2. Dans ce fichier, adaptez le **port** de `baseUrl` et l'**id** du modèle, avec les valeurs relevées à l'étape 1 :

   ```json
   {
     "providers": {
       "llamacpp-hote": {
         "baseUrl": "http://host.docker.internal:8080/v1",
         "api": "openai-completions",
         "apiKey": "local",
         "models": [
           { "id": "Qwen3-VL-8B-Instruct", "name": "Qwen3-VL-8B (llama.cpp sur l'hôte)", "input": ["text", "image"] }
         ]
       }
     }
   }
   ```

   `host.docker.internal` désigne votre ordinateur vu depuis le conteneur. `apiKey` est obligatoire pour Pi, même si llama.cpp ne demande pas de clé : toute valeur convient. Si llama.cpp est lancé avec `--api-key`, mettez la clé dans `.env` (`LLAMA_API_KEY=…`) et écrivez `"apiKey": "$LLAMA_API_KEY"`.

   Un llama.cpp distant convient aussi : mettez son adresse dans `baseUrl` (par exemple `https://vlm.example.fr/v1`), sans rien changer d'autre. La suite de la procédure reste valable ; remplacez seulement `llamacpp-hote` par le nom de provider que vous avez choisi.

3. Vérifiez que le conteneur joint bien llama.cpp :

   ```powershell
   studio curl -s http://host.docker.internal:8080/v1/models
   ```

   **Attendu** : la liste des modèles, la même qu'à l'étape 1.

4. Vérifiez que Pi voit le modèle :

   ```powershell
   studio pi --list-models llamacpp
   ```

   **Attendu** : une ligne `llamacpp-hote` avec votre modèle.

5. Redémarrez le Studio, pour que Pi Web relise ce fichier créé à la main (le CLI `pi` le voit tout de suite, Pi Web non) :

   ```powershell
   docker compose -f compose.dev.yml restart
   ```

   Patientez jusqu'à ce que le journal affiche à nouveau `Ready`.

Dans Pi Web, la rubrique Réglages › Models affiche ensuite ce provider. Elle permet aussi de modifier `models.json` sans passer par le Bloc-notes ; les modifications faites par cette rubrique sont prises en compte sans redémarrage.

---

## 6. Vérifications

Faites-les dans cet ordre. Chacune indique l'**action**, le **résultat attendu** et la **commande** qui permet de le constater. Notez au fur et à mesure ce qui ne correspond pas.

### V2 — Le dossier des packs est approuvé pour Pi

- **Action** : aucune ; le démarrage du conteneur s'en charge.
- **Attendu** : le fichier de confiance de Pi contient `"/workspace/packs": true`. Dans le Studio, une fois un pack ouvert, le bandeau orange « Pi ne chargera pas les consignes système ni les skills de ce pack… » **n'apparaît pas**.
- **Commande** :

  ```powershell
  studio cat /root/.pi/agent/trust.json
  ```

### V5 — Les versions s'enregistrent sur le volume Windows

- **Action** : dans le Studio, cliquez sur « Nouveau pack », titre « Essai », identifiant `essai`, puis « Créer le pack ». Créez ensuite une skill `recherche-openalex` avec une description, et enregistrez-la.
- **Attendu** :
  - le dossier `dev\workspace\packs\essai` apparaît dans l'Explorateur Windows ;
  - l'historique montre trois versions, sans erreur `dubious ownership` ;
  - `safe.directory` vaut `/workspace/packs`.
- **Commandes** :

  ```powershell
  studio git -C /workspace/packs log --format="%an <%ae> | %s"
  studio git config --global --get-all safe.directory
  ```

  La première commande doit afficher « Initialise le dépôt des packs », « Crée le pack » et « Crée skill … », avec votre nom pour les deux dernières.

### V1 — Pi en ligne de commande charge la skill du pack

**À savoir avant de commencer.** Ne demandez pas au modèle « quelles skills as-tu ? », que ce soit en ligne de commande ou dans une session Pi Web. Le modèle répond toujours par une liste, souvent inventée à partir du contexte du pack (« Literature Review », « Citation Management »…), même quand le pack n'a aucune skill. Ce n'est un défaut ni du Studio ni de Pi : avec zéro skill, Pi n'envoie au modèle aucune liste de skills. Le constat se fait donc **sans le modèle**, par les points 1, 2 et 4 ; le point 3 n'est qu'un complément.

- **Action** :
  1. Dans le Studio, ajoutez au pack au moins une skill, par exemple `recherche-openalex` (V5), et enregistrez-la.
  2. Dans Configuration, choisissez le modèle `Qwen3-VL-8B…` comme modèle par défaut, puis enregistrez.
- **Attendu** :
  - `pi --version` affiche `1.2.0` ;
  - commande 1 : « Confiance : oui », puis **exactement** les skills créées dans le Studio, ni plus ni moins ;
  - commande 2 : en tapant `/skill:` dans Pi, la liste proposée contient ces mêmes skills ;
  - commande 3 : la réponse suit les instructions de la skill nommée ;
  - point 4 : le prompt système contient un bloc `<available_skills>` qui liste exactement ces skills. Pour un pack sans skill, ce bloc est **absent**.
- **Commandes** (remplacez `essai` par l'identifiant de votre pack) :

  ```powershell
  studio pi --version
  ```

  1. La liste des skills que Pi charge dans le pack, calculée par le chargeur de Pi lui-même :

     ```powershell
     studio node /opt/pi-studio/lib/studio/list-skills.mjs /workspace/packs/essai
     ```

     Pour un pack sans skill, la commande affiche « Skills chargées par Pi : 0 (aucune) ».

  2. Le même constat dans l'interface de Pi en ligne de commande :

     ```powershell
     docker compose -f compose.dev.yml exec -w /workspace/packs/essai pi-studio pi
     ```

     Tapez `/skill:` sans valider : Pi propose les skills du pack. Quittez avec `Ctrl+C` deux fois.

  3. En complément, avec le modèle : la commande `/skill:<nom>` fait lire la skill au modèle avant la question.

     ```powershell
     docker compose -f compose.dev.yml exec -w /workspace/packs/essai pi-studio pi -p "/skill:recherche-openalex Résume en une phrase ce que cette skill te demande de faire."
     ```

  4. Ce que Pi envoie réellement au modèle, dans Pi Web :
     1. Ouvrez « Retour à Pi Web », puis « Open another project… », et choisissez `/workspace/packs/essai`.
     2. Démarrez une session et envoyez un premier message, par exemple « Bonjour ».
     3. Cliquez sur **System prompt** dans la barre du haut.
     4. Cherchez (`Ctrl+F`) `available_skills` : chaque skill du pack y figure avec son nom (`<name>…</name>`) et sa description.

### V8 — Le modèle par défaut du pack est bien utilisé

- **Action** : le modèle a été choisi en V1. Dans Pi Web (« Retour à Pi Web »), cliquez sur « Open another project… », choisissez `/workspace/packs/essai`, puis démarrez une nouvelle session.
- **Attendu** : le modèle présélectionné est celui du pack (`Qwen3-VL-8B…`), et non le modèle par défaut global.
- **Commande** :

  ```powershell
  studio curl -s http://localhost:30141/api/studio/packs/essai/models
  ```

  La réponse doit contenir `"defaultModel":{"provider":"llamacpp-hote","modelId":"…"}`, avec votre nom de provider s'il est différent.
  Une fois le mot de passe ajouté (V9), écrivez `curl -s -u pi:VOTRE_MOT_DE_PASSE …`.

### V9 — Le Studio comme page d'accueil, et le mot de passe

<http://localhost:30141> ouvre **le dernier endroit utilisé** : le Studio par défaut. Après « Retour à Pi Web », c'est Pi Web, jusqu'à ce que vous rouvriez le Studio.

- **Action** :
  1. Ouvrez <http://localhost:30141>.
  2. Dans le Studio, cliquez sur « Retour à Pi Web ». Utilisez Pi Web normalement : ouvrez un projet, démarrez une session, rechargez la page (`F5`), puis tapez à nouveau <http://localhost:30141>.
  3. Revenez au Studio par le bouton « π Studio » de la barre latérale, puis tapez à nouveau <http://localhost:30141>.
  4. Mettez un mot de passe dans `.env` (`PI_WEB_PASSWORD=…`), redémarrez avec `docker compose -f compose.dev.yml up -d`, puis rouvrez <http://localhost:30141>.
- **Attendu** :
  - étape 1 : l'adresse devient `/studio` ;
  - étape 2 : vous restez dans Pi Web à chaque action, y compris après `F5` et en retapant l'adresse ;
  - étape 3 : le Studio s'ouvre, puis l'adresse mène de nouveau au Studio ;
  - étape 4 : la page de connexion s'affiche d'abord, puis le dernier endroit utilisé.
- **Commande** (sans mot de passe) :

  ```powershell
  curl.exe -s -o NUL -w "%{http_code} %{redirect_url}" http://localhost:30141/
  ```

  **Attendu** : `307 http://localhost:30141/studio`. Cette commande n'a pas l'historique du navigateur : elle répond toujours Studio.

### V10 — Le parcours complet

- **Action** :
  1. Créez un pack et une skill, puis enregistrez.
  2. Cliquez sur « Valider ».
  3. Ouvrez `dev\workspace\packs\essai\AGENTS.md` dans le Bloc-notes, ajoutez une ligne et enregistrez. Revenez au Studio et cliquez dans la page.
  4. Cliquez sur « Conserver ».
  5. Refaites une modification dans le Bloc-notes, puis cliquez sur « Annuler » et confirmez.
  6. Ouvrez la même skill dans deux onglets. Modifiez et enregistrez dans le premier, puis modifiez et enregistrez dans le second.
  7. Dans Pi Web, ouvrez une session sur `/workspace/packs/essai` et demandez au modèle : « Ajoute une ligne "Test" à la fin de AGENTS.md ».
- **Attendu** :
  - étape 2 : « Ce que Pi charge » liste la skill ;
  - étape 3 : le bandeau « Modifié en dehors du Studio » apparaît et nomme « Contexte du pack (AGENTS.md) » ;
  - étape 4 : une nouvelle version apparaît dans l'Historique ;
  - étape 5 : le fichier revient à sa dernière version, et l'Historique montre « Annule les modifications faites hors Studio » ;
  - étape 6 : le second onglet affiche « Ce fichier a été modifié ailleurs… » avec un bouton « Recharger », et rien n'est perdu dans le premier ;
  - étape 7 : de retour dans le Studio, le même bandeau apparaît.
- **Commande** :

  ```powershell
  studio git -C /workspace/packs log --format="%an | %s" -5
  ```

  (La partie « deux comptes en même temps » demande le proxy d'authentification : elle relève de V3, au déploiement.)

### V11 — Le lien vers les providers

- **Action** : dans un pack, rubrique Providers, cliquez sur « Ouvrir les réglages des modèles ». Dans Pi Web, cliquez ensuite sur Réglages (en bas de la barre latérale).
- **Attendu** : les Réglages s'ouvrent directement sur la rubrique des modèles, où `llamacpp-hote` est listé.

### V12 — L'affichage sur tablette

- **Action** : dans le navigateur, appuyez sur `F12`, puis `Ctrl+Shift+M` (affichage appareil), et choisissez une largeur de 820 px. Refaites rapidement V10 (pack, skill, enregistrement).
- **Attendu** :
  - la navigation passe en ligne au-dessus du contenu, et la liste des skills au-dessus de l'éditeur ;
  - la barre « Enregistrer » reste visible en bas ;
  - rien ne déborde horizontalement.

### Lot 2 — Tests et campagnes

Ces vérifications demandent le pack `essai` de V1, avec sa skill, et le provider `llamacpp-hote` de l'étape 5. Pour V14, un second modèle est utile : un autre fichier GGUF servi par llama.cpp, ou le même modèle déclaré deux fois dans `models.json` sous deux noms.

### V13 — Une suite de tests

- **Action** :
  1. Dans le pack `essai`, ouvrez la rubrique **Tests**, puis cliquez sur « Créer une première suite ». Titre : « Recherche documentaire ».
  2. Remplissez quatre cas (« Ajouter un cas ») avec une requête et un attendu chacun, puis `Ctrl+S`.
  3. Donnez au deuxième cas l'identifiant du premier, puis enregistrez.
  4. Rétablissez l'identifiant. Cochez « Mode avancé », passez en « Texte brut », regardez le fichier, puis revenez au tableau.
- **Attendu** :
  - étape 2 : « Tout est enregistré » et « Aucun problème détecté. » ;
  - étape 3 : l'enregistrement est refusé avec « L'identifiant … est déjà utilisé ligne … » ;
  - étape 4 : le texte brut montre l'en-tête `titre:` puis un tableau `| id | requête | attendu | sources attendues |`.
- **Commande** :

  ```powershell
  studio cat /workspace/packs/essai/tests/recherche-documentaire.md
  ```

### V14 — Deux campagnes, la revue et la comparaison

- **Action** :
  1. Onglet **Campagnes**, « Lancer une campagne » : gardez la suite cochée, choisissez le premier modèle et lancez.
  2. Suivez l'avancement sans recharger la page.
  3. Ouvrez chaque cas, lisez la réponse, donnez un verdict (OK, Partiel ou KO) et un commentaire à l'un d'eux, puis « Enregistrer les verdicts ».
  4. Sur un cas, cliquez sur « Ouvrir la session ».
  5. Lancez une seconde campagne avec le second modèle, puis ouvrez l'onglet **Comparaison**.
- **Attendu** :
  - étape 2 : les cas passent de « En attente » à « En cours » puis « Terminé », et le compteur avance toutes les 2 secondes environ ;
  - étape 3 : « Verdicts enregistrés. », et la liste affiche « 4 / 4 jugés » ;
  - étape 4 : Pi Web s'ouvre dans un nouvel onglet, sur une session nommée `[test] essai · RD-01 · <modèle>` ;
  - étape 5 : une colonne par campagne ; les verdicts de la première, et « À juger » pour la seconde ;
  - dans le Parcours, « Évaluer » passe à « Prêt » quand une campagne est entièrement jugée.
- **Commande** :

  ```powershell
  studio git -C /workspace/packs log --format="%an | %s" -6
  ```

  On attend une version par enregistrement de la suite, une par campagne terminée (« Campagne … : 4 cas, 4 terminés ») et une par « Enregistrer les verdicts ». Aucune version n'est créée pendant l'exécution.

### V15 — Les verdicts survivent à un redémarrage, et une campagne interrompue

- **Action** :
  1. Après V14, lancez `docker compose -f compose.dev.yml restart`, puis rouvrez la campagne jugée.
  2. Lancez une nouvelle campagne, et redémarrez le conteneur pendant qu'elle tourne. Rouvrez-la.
  3. Cliquez sur « Relancer les … cas non terminés ».
- **Attendu** :
  - étape 1 : les verdicts et commentaires sont toujours là ;
  - étape 2 : la campagne est « Interrompue » ; les cas non terminés sont en « Erreur » avec « Le serveur s'est arrêté pendant la campagne. » ;
  - étape 3 : une nouvelle campagne démarre avec ces seuls cas.

### V16 — Le délai par cas, les outils, et le bouton Arrêter

- **Action** :
  1. Lancez une campagne avec un délai de **1 minute**, sur une question longue (par exemple « Rédige une synthèse de 3000 mots sur… »).
  2. Lancez une campagne de quatre cas et cliquez sur « Arrêter » pendant le premier cas.
  3. En mode avancé, rubrique Configuration, cochez `bash` dans « Outils des sessions de test ».
- **Attendu** :
  - étape 1 : le cas passe « Hors délai » après une minute environ, et les cas suivants s'exécutent ;
  - étape 2 : la campagne est « Arrêtée », les cas restants sont en « Erreur » avec « Campagne arrêtée avant ce cas. » ;
  - étape 3 : un avertissement explique que `bash` permet d'agir hors du dossier du pack. Décochez-le et enregistrez.
- **Remarque** : avec l'outil `read` seul (le défaut), un outil MCP que son serveur ne déclare pas « lecture seule » est refusé ; la revue l'indique « bloqué ». Cela concerne le lot 3.

### Lot 3 — Serveurs MCP

Il faut l'adresse Streamable HTTP d'un serveur MCP réel (par exemple celui de l'établissement) et, s'il en demande un, son jeton. Ajoutez le jeton au fichier `.env`, sous un nom de votre choix, puis redémarrez :

```
OPENALEX_TOKEN=la-valeur-du-jeton
```

Vérifiez que la variable passe bien au conteneur (`compose.dev.yml` doit charger `.env`) : `studio printenv OPENALEX_TOKEN`.

### V17 — Ajouter et inspecter un serveur

- **Action** :
  1. Dans le pack `essai`, rubrique **MCP**, « Nouveau serveur ». Identifiant `openalex`, l'adresse du serveur, une description, « Jeton Bearer via variable d'environnement » et `OPENALEX_TOKEN` (ou « Aucune »). Enregistrez.
  2. Cliquez sur « Inspecter tools/list », puis dépliez un outil.
  3. Rubrique **Configuration** : choisissez un modèle par défaut si ce n'est pas fait.
- **Attendu** :
  - étape 1 : « La variable est définie dans le conteneur. » et l'état « À inspecter » ;
  - étape 2 : « Connexion réussie : n outil(s). », le nom et la version du serveur, la description et les paramètres de chaque outil ; l'état devient « Inspecté » ;
  - étape 3 : dans le Parcours, « Connecter » passe à « Prêt ».
- **Commande** :

  ```powershell
  studio cat /workspace/packs/essai/.pi/mcp.json
  ```

  On attend l'entrée avec `"exposure": "direct"` et `"Authorization": "Bearer ${OPENALEX_TOKEN}"`, **jamais** la valeur du jeton.

### V17 bis — Un serveur qui demande une connexion par compte (OAuth)

Le Studio ne fait pas la connexion OAuth lui-même : il utilise celle de Pi Web.

- **Action** :
  1. Ajoutez le MCP d'OpenAlex avec l'authentification « Aucune », puis « Inspecter tools/list ».
  2. Cliquez sur « Ouvrir ce pack dans Pi Web », puis sur Réglages (en bas de la barre latérale) : la rubrique MCP s'ouvre. Sur la ligne du serveur (partie projet), cliquez sur « Sign in » et allez jusqu'au bout de la connexion sur openalex.org. Si la page de retour ne s'ouvre pas, collez son adresse dans le champ que Pi Web propose.
  3. Revenez au Studio, rechargez la page, puis inspectez de nouveau. Lancez enfin une campagne d'un cas qui utilise un outil d'OpenAlex.
- **Attendu** :
  - étape 1 : la marche à suivre et le bouton « Ouvrir ce pack dans Pi Web » ; l'état « Connexion par compte » ;
  - étape 3 : l'état « Compte connecté » puis « Inspecté », la liste des outils, et l'appel `mcp__openalex__…` dans la revue du cas.
- **Remarque** : chaque appel passe par la clé d'API OpenAlex du compte connecté, et son budget.

### V18 — Une campagne qui appelle un outil du serveur

- **Action** : créez une suite d'un cas dont la requête demande explicitement d'utiliser l'outil (par exemple « Utilise l'outil de recherche pour trouver trois articles récents sur … »), puis lancez une campagne avec Qwen3-VL-8B.
- **Attendu** : dans la revue du cas, « Outils utilisés » montre `mcp__openalex__…` sans la mention « bloqué », et la réponse reprend ce que l'outil a renvoyé. « Ouvrir la session » montre le même appel dans Pi Web.
- **Variante** : en mode avancé, rubrique Configuration, choisissez « Seulement ceux déclarés en lecture seule » et relancez. Un outil que le serveur ne déclare pas en lecture seule apparaît alors « bloqué ».
- **Remarque** : un petit modèle n'appelle pas toujours l'outil. Si la réponse n'en utilise aucun, reformulez la requête avant de conclure.

### V19 — Les refus et les erreurs

- **Action** :
  1. « Nouveau serveur » : collez `npx -y @modelcontextprotocol/server-filesystem .` dans l'adresse.
  2. En mode avancé, dans « Fichier des serveurs », ajoutez une entrée `"fs": { "command": "npx", "args": ["srv"] }` et enregistrez.
  3. Ajoutez un serveur avec une adresse injoignable (`https://exemple.invalid/mcp`), puis inspectez-le.
  4. Ajoutez un serveur qui lit une variable absente du `.env`, puis inspectez-le.
- **Attendu** :
  - étape 1 : « Ceci ressemble à une commande, pas à une adresse… » ; rien n'est enregistré ;
  - étape 2 : « Le serveur « fs » n'est pas un serveur Streamable HTTP : le Studio ne l'enregistre pas. » ;
  - étape 3 : « La connexion a échoué. » en moins de 20 secondes, avec le message du serveur replié ;
  - étape 4 : « Jeton absent », et l'inspection répond sans contacter le serveur.

### V20 — Pi Web voit les mêmes serveurs

- **Action** : dans Pi Web, ouvrez une session sur `/workspace/packs/essai`, puis les Réglages › MCP.
- **Attendu** : le serveur `openalex` du pack est listé dans la partie projet, avec le même état. Les serveurs globaux désactivés dans le pack depuis le Studio y apparaissent désactivés pour ce projet.

### V3 et V4 — Au déploiement

Ces deux vérifications demandent le proxy d'authentification (Traefik avec forward-auth). Elles se font donc **au déploiement**, pas en local :

- **V3** : un compte par personne, chaque version enregistrée sous le bon nom ;
- **V4** : sans le proxy de confiance, un en-tête d'identité ajouté à la main est ignoré.

---

## 7. En cas de problème

| Symptôme | Que faire |
|---|---|
| `port is already allocated` au démarrage | Un autre programme utilise le port 30141. Fermez-le, ou remplacez `127.0.0.1:30141:30141` par `127.0.0.1:30142:30141` dans `compose.dev.yml` et ouvrez <http://localhost:30142>. |
| Le build échoue sur `npm ci` ou `fonts.googleapis.com` | La machine n'atteint pas Internet, ou un proxy d'établissement filtre. Réessayez depuis un autre réseau, ou demandez les réglages du proxy. |
| `studio curl … /v1/models` ne répond pas | llama.cpp n'écoute que sur `127.0.0.1` : relancez-le avec `--host 0.0.0.0`, et autorisez-le dans le pare-feu Windows (réseaux privés). |
| `bad interpreter` ou `\r` dans le journal | Le script a reçu des fins de ligne Windows. Normalement l'image les corrige d'elle-même ; sinon, relancez avec `docker compose -f compose.dev.yml build --no-cache`. |
| Le bandeau « Pi ne chargera pas… » s'affiche | Lancez `studio cat /root/.pi/agent/trust.json`. Si `/workspace/packs` n'y figure pas, redémarrez le conteneur et lisez les lignes `[trust]` du journal. |
| Tout semble incohérent | Arrêtez, supprimez le dossier `dev`, puis relancez `docker compose -f compose.dev.yml up --build`. |

Pour rapporter un problème, joignez le journal du conteneur :

```powershell
docker compose -f compose.dev.yml logs --tail 200 > journal.txt
```
