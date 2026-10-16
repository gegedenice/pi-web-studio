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

**À savoir avant de commencer.** Ne demandez pas au modèle « quelles skills as-tu ? » pour faire ce constat : un petit modèle invente volontiers une liste plausible, même quand le pack n'en a aucune. Le constat se fait avec Pi lui-même, sans modèle (commandes 1 et 2). La commande 3, avec le modèle, n'est qu'un complément.

- **Action** :
  1. Dans le Studio, ajoutez au pack au moins une skill, par exemple `recherche-openalex` (V5), et enregistrez-la.
  2. Dans Configuration, choisissez le modèle `Qwen3-VL-8B…` comme modèle par défaut, puis enregistrez.
- **Attendu** :
  - `pi --version` affiche `1.2.0` ;
  - commande 1 : « Confiance : oui », puis **exactement** les skills créées dans le Studio, ni plus ni moins ;
  - commande 2 : en tapant `/skill:` dans Pi, la liste proposée contient ces mêmes skills ;
  - commande 3 : la réponse suit les instructions de la skill nommée.
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
