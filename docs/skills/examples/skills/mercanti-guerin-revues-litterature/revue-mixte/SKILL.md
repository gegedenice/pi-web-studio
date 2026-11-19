---
name: revue-mixte
description: >
  Conduit ou structure une revue à méthodes mixtes (mixed studies review / mixed methods
  review) : synthèse combinant études quantitatives, qualitatives et mixtes sur une même
  question, avec choix d'un design d'intégration (convergent, séquentiel) et évaluation
  par le MMAT. Utilise ce skill dès que l'utilisateur mentionne « mixed studies review »,
  « revue mixte », « revue à méthodes mixtes », veut combiner le « combien » et le
  « pourquoi » (l'ampleur d'un effet ET l'expérience des acteurs), synthétiser un corpus
  où coexistent enquêtes, expérimentations et études d'entretiens, ou croiser efficacité
  et acceptabilité d'un dispositif. Ne pas utiliser pour un corpus homogène quantitatif
  (meta-analyse) ou qualitatif (meta-synthese-qualitative), ni pour croiser des
  littératures disciplinaires sans logique quanti/quali (revue-integrative).
---

# Revue à méthodes mixtes (mixed studies review)

La revue mixte synthétise **sur une même question** des preuves quantitatives (combien, quel effet) et qualitatives (pourquoi, comment c'est vécu), et — c'est sa signature — les **intègre** au lieu de les juxtaposer. Exemple type : les études quantitatives mesurent l'effet des chatbots sur la satisfaction client ; les qualitatives expliquent pourquoi certains segments les rejettent ; la revue mixte croise les deux pour dire quand l'effet se produit et pourquoi il s'inverse.

Force du format (Grant & Booth) : chaque volet compense les faiblesses de l'autre. Difficulté : l'intégration exige un design explicite — c'est l'objet central de ce skill.

## Étape 1 — Question(s) et design d'intégration

Choisir le design **avant** la synthèse (typologie de Pluye & Hong, 2014) :

- **Design convergent (parallèle)** : une même question, corpus quanti et quali analysés puis confrontés. Deux variantes :
  - *ségrégée* : deux synthèses séparées (méta-analyse d'un côté, synthèse thématique de l'autre) puis **matrice de convergence** ;
  - *intégrée* : toutes les études transformées dans un langage commun — généralement **qualitisation** des résultats quantitatifs (convertis en énoncés) puis synthèse thématique unique. Plus simple, adaptée aux corpus déséquilibrés.
- **Design séquentiel** : une synthèse informe l'autre. *Explicatif* (quanti → quali : les études qualitatives expliquent l'hétérogénéité des effets) ou *exploratoire* (quali → quanti : les thèmes qualitatifs structurent la lecture des mesures).

Formuler la ou les questions en conséquence : une question d'effet + une question d'expérience/mécanisme.

## Étape 2 — Recherche et sélection

Protocole SLR standard (voir `revue-systematique`), avec équations couvrant les deux traditions (termes de design quanti ET quali). Ne pas exclure les études mixtes primaires : elles se codent dans les deux volets.

## Étape 3 — Évaluation de la qualité : le MMAT

Outil dédié : **MMAT** (Mixed Methods Appraisal Tool, Hong et al., 2018) — le seul qui évalue avec une grille cohérente les cinq familles : quali, essais randomisés, quanti non randomisé, quanti descriptif, mixte (5 critères par famille). Rapporter l'évaluation par étude ; l'utiliser en pondération ou sensibilité, pas forcément en exclusion.

## Étape 4 — Synthèse et intégration

Le livrable d'intégration selon le design :

- Convergent ségrégé → **matrice de convergence** : lignes = résultats/thèmes ; colonnes = « ce que dit le quanti », « ce que dit le quali », « statut » (convergence / complémentarité / dissonance). Les **dissonances** se traitent explicitement : différences de populations, de temporalités, artefacts de mesure — ou vraie contradiction à documenter.
- Convergent intégré → synthèse thématique unique, chaque thème étiqueté par les types d'études qui le soutiennent.
- Séquentiel → narration en deux actes, la seconde synthèse répondant aux questions ouvertes par la première.

Dans tous les cas, conclure par des **méta-inférences** : les conclusions qui n'existent que par le croisement (« l'effet moyen positif masque un rejet actif chez X, expliqué par M »).

## Passe de vérification (obligatoire)

| Contrôle | OK ? |
|---|---|
| Design d'intégration choisi et nommé avant synthèse | |
| Équations couvrant les deux traditions méthodologiques | |
| MMAT appliqué aux cinq familles d'études | |
| Intégration matérialisée (matrice ou synthèse unifiée), pas deux revues juxtaposées | |
| Dissonances quanti/quali analysées, pas gommées | |
| Méta-inférences explicites en conclusion | |

## Références clés

- Pluye, P., & Hong, Q. N. (2014). Combining the power of stories and the power of numbers: mixed methods reviews. *Annual Review of Public Health*, 35.
- Hong, Q. N., et al. (2018). The Mixed Methods Appraisal Tool (MMAT) version 2018. *Education for Information*, 34(4).
- Sandelowski, M., Voils, C. I., & Barroso, J. (2006). Defining and designing mixed research synthesis studies. *Research in the Schools*, 13(1).

## Skills voisins

Corpus quanti seul → `meta-analyse`. Corpus quali seul → `meta-synthese-qualitative`. Croisement de disciplines → `revue-integrative`.
