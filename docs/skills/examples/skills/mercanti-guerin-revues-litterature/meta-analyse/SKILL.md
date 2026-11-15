---
name: meta-analyse
description: >
  Structure, conduit ou révise une méta-analyse : agrégation statistique des tailles
  d'effet issues d'études quantitatives comparables (corrélations, d de Cohen, odds
  ratios), modèle à effets fixes/aléatoires, hétérogénéité (Q, I²), biais de publication
  (funnel plot, trim-and-fill), analyse de modérateurs. Utilise ce skill dès que
  l'utilisateur mentionne « méta-analyse », « taille d'effet », « effect size »,
  « forest plot », « hétérogénéité », « I² », « biais de publication », veut agréger
  quantitativement les résultats de plusieurs études, ou demande si un corpus se prête
  à une méta-analyse. Déclenche-le aussi pour rédiger ou relire la section méthode d'une
  méta-analyse. Ne pas utiliser pour une synthèse narrative d'études hétérogènes
  (revue-systematique) ni pour synthétiser du qualitatif (meta-synthese-qualitative).
---

# Méta-analyse

La méta-analyse est une revue systématique **dont la synthèse est statistique** : elle traite chaque étude comme une observation et estime un effet moyen pondéré. Elle hérite donc de tout le protocole d'une SLR (question, équation, flux PRISMA — voir `revue-systematique`) et y ajoute une chaîne quantitative propre. Ce skill couvre cette chaîne.

## Condition d'entrée : la commensurabilité

Avant tout, vérifier que les études sont **agrégeables** : même relation conceptuelle (X→Y comparable), statistiques convertibles en une métrique commune, indépendance des échantillons. Si les opérationnalisations divergent trop, le dire à l'utilisateur et proposer une SLR narrative ou une méta-analyse restreinte à un sous-ensemble. Une méta-analyse de pommes et d'oranges est le mode d'échec n°1 signalé par les relecteurs.

En gestion/marketing, l'unité typique est la **corrélation (r)** entre deux construits ; en expérimental, le **d de Cohen** ou le **g de Hedges** ; pour les issues binaires, l'**odds ratio** ou le **risk ratio**.

## Étape 1 — Extraction des effets

Pour chaque étude, extraire : taille d'effet (ou statistiques permettant de la calculer : t, F, χ², moyennes+écarts-types), taille d'échantillon, fiabilité des mesures (α, pour la correction d'atténuation à la Hunter-Schmidt), et les modérateurs candidats (contexte, période, type d'échantillon, design).

Règles : une étude peut fournir plusieurs effets — gérer la dépendance (moyenne intra-étude, ou modèles multiniveaux/RVE si l'utilisateur a les moyens). Convertir tous les effets dans la même métrique avant agrégation ; transformer r en z de Fisher pour le calcul.

## Étape 2 — Modèle d'agrégation

- **Effets aléatoires** par défaut (DerSimonian-Laird ou REML) : hypothèse réaliste que le vrai effet varie entre contextes. Les effets fixes ne se justifient que pour des réplications quasi identiques.
- École **Hedges-Olkin** (pondération par variance inverse) vs école **Hunter-Schmidt** (correction des artefacts : atténuation, restriction de variance) — la seconde domine en GRH/management. Choisir et justifier.
- Rapporter : k (nombre d'effets), N total, effet moyen, IC à 95 %, intervalle de prédiction.

## Étape 3 — Hétérogénéité et modérateurs

- Q de Cochran (test), **I²** (part de variance inter-études : ~25 % faible, ~50 % modérée, ~75 % forte), τ².
- Si I² élevé (cas normal en gestion) : analyse de **modérateurs** — méta-régression pour les continus, sous-groupes pour les catégoriels. Les modérateurs doivent être théorisés *a priori*, pas pêchés dans les données.

## Étape 4 — Biais de publication et robustesse

Au moins deux diagnostics : funnel plot + test d'Egger ; trim-and-fill ; fail-safe N (à présenter comme indicatif, il est critiqué) ; PET-PEESE si le corpus le permet. Analyses de sensibilité : leave-one-out, exclusion des outliers d'influence.

## Étape 5 — Présentation

- **Forest plot** : chaque étude avec son IC, l'effet global en losange.
- Tableau des études incluses (auteurs, N, effet, contexte).
- Interprétation en termes de magnitude (repères de Cohen contextualisés — un r de .20 peut être substantiel en comportement du consommateur), jamais seulement en significativité.

Outils à recommander selon le profil : R (`metafor` — référence), JASP (interface graphique gratuite), CMA (payant).

## Passe de vérification (obligatoire)

| Contrôle | OK ? |
|---|---|
| Commensurabilité des études argumentée | |
| Métrique d'effet unique, conversions documentées | |
| Dépendance des effets multiples traitée | |
| Modèle (aléatoire/fixe, H-O/H-S) choisi et justifié | |
| I² rapporté et interprété ; modérateurs théorisés a priori | |
| ≥ 2 diagnostics de biais de publication | |
| Effets interprétés en magnitude, pas seulement en p | |

## Références clés

- Borenstein, M., Hedges, L. V., Higgins, J. P. T., & Rothstein, H. R. (2021). *Introduction to Meta-Analysis* (2e éd.). Wiley.
- Hunter, J. E., & Schmidt, F. L. (2015). *Methods of Meta-Analysis* (3e éd.). Sage.
- Grewal, D., Puccinelli, N., & Monroe, K. B. (2018). Meta-analysis: Integrating accumulated knowledge. *Journal of the Academy of Marketing Science*, 46(1).

## Skills voisins

Protocole de recherche documentaire → `revue-systematique`. Corpus qualitatif → `meta-synthese-qualitative`. Revues de revues avec méta-analyses existantes → `umbrella-review`.
