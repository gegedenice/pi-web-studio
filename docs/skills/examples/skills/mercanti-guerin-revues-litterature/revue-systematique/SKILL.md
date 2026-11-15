---
name: revue-systematique
description: >
  Conduit ou structure une revue systématique de la littérature (SLR) selon le standard
  PRISMA 2020, avec variante SPAR-4-SLR pour les revues en sciences de gestion. Couvre :
  formulation de la question (PICO/SPIDER), équation de recherche booléenne, critères
  d'inclusion/exclusion, diagramme de flux PRISMA, grille d'extraction, évaluation de la
  qualité des études, synthèse narrative structurée. Utilise ce skill dès que l'utilisateur
  mentionne « revue systématique », « SLR », « PRISMA », « SPAR-4-SLR », « protocole de
  revue », « diagramme de flux », « équation de recherche », veut transformer un corpus
  d'articles en revue publiable, ou prépare la section revue de littérature d'un article
  visant une revue exigeant un protocole explicite. Ne pas utiliser pour : cartographier
  un champ émergent sans question fermée (scoping-review), agréger statistiquement des
  effets (meta-analyse), analyser des réseaux de citations (revue-bibliometrique).
---

# Revue systématique (PRISMA 2020 / SPAR-4-SLR)

Une revue systématique n'est pas une lecture exhaustive : c'est une **méthode de recherche à part entière**, reproductible, où chaque décision (mots-clés, bases, critères, exclusions) est documentée au point qu'un tiers pourrait refaire la revue et obtenir le même corpus. La transparence du protocole compte autant que la synthèse elle-même.

## Choix du standard

- **PRISMA 2020** (Page et al., 2021) : standard universel, 27 items, exigé par la plupart des revues. Défaut si l'utilisateur ne précise pas.
- **SPAR-4-SLR** (Paul et al., 2021) : protocole conçu pour le management/marketing, 3 phases (Assembling, Arranging, Assessing) × 2 sous-étapes. Préférer si la cible est une revue de gestion (IJCS, EJM, JBR, M@n@gement, RAM...). Les deux sont compatibles : SPAR-4-SLR pour organiser le travail, PRISMA pour le diagramme de flux.

## Étape 1 — Question et protocole

1. Formuler une **question fermée et répondable**. Gabarits : PICO (Population, Intervention, Comparaison, Outcome) pour les effets ; SPIDER pour le qualitatif ; en gestion, souvent « Que sait-on de X dans le contexte Y, et quelles lacunes ? »
2. Fixer les **bornes** : période, langues, types de documents (articles à comité de lecture seulement ? chapitres ? actes ?), champs disciplinaires.
3. Choisir les **bases** : Scopus + Web of Science comme socle ; compléter selon le champ (EBSCO Business Source, ABI/Inform, Cairn pour le francophone). Documenter la date d'interrogation.
4. Si la revue cible l'exige : pré-enregistrer le protocole (PROSPERO pour la santé ; en gestion, annexe méthodologique suffit).

## Étape 2 — Équation de recherche

Construire l'équation en blocs de synonymes reliés par AND :

```
("influencer marketing" OR "social media influencer*" OR "brand ambassador*")
AND ("consumer trust" OR "credibility" OR "authenticity")
AND ("systematic*" OR "empirical" OR "experiment*")   [si pertinent]
```

Règles : troncature (*) pour les variantes ; tester l'équation et rapporter le nombre de résultats par base ; conserver toutes les versions de l'équation (les relecteurs les demandent).

## Étape 3 — Sélection et diagramme de flux

Quatre stades PRISMA à chiffrer précisément :

1. **Identification** : n résultats par base, n après dédoublonnage.
2. **Screening** : titre/résumé contre les critères → n exclus.
3. **Éligibilité** : lecture plein texte → n exclus **avec motif par article** (hors périmètre, pas empirique, doublon conceptuel...).
4. **Inclusion** : n final.

Produire le diagramme de flux (les 4 boîtes avec effectifs et motifs d'exclusion). Chaque critère d'inclusion/exclusion doit être défini *avant* le screening, pas ajusté après pour justifier le corpus.

## Étape 4 — Extraction et évaluation

Grille d'extraction (tableur) avec au minimum : auteurs/année, revue, pays/contexte, théorie mobilisée, méthode, échantillon, variables/concepts, résultats principaux, limites. En gestion, ajouter les colonnes du cadre d'analyse choisi (souvent TCCM — voir skill `revue-cadre-tccm` pour structurer la synthèse).

Évaluation de la qualité : en santé, outils formels (RoB 2, MMAT) ; en gestion, proxy accepté = classement des revues (FNEGE, ABS/AJG, CNRS) + critères méthodologiques explicites. Toujours dire ce qui a été fait.

## Étape 5 — Synthèse et écriture

- Synthèse **thématique structurée**, jamais une suite de fiches de lecture. Organiser par concepts, débats ou mécanismes, pas par article.
- Descriptif obligatoire : distribution temporelle, revues, méthodes, contextes géographiques (tableaux ou figures).
- Terminer par : lacunes identifiées → agenda de recherche (souvent la contribution la plus citée d'une SLR).

## Passe de vérification (obligatoire)

| Contrôle | OK ? |
|---|---|
| Question de recherche fermée et énoncée verbatim | |
| Équation(s) de recherche reproductible(s), bases et dates documentées | |
| Effectifs du flux cohérents (identification − exclusions = inclusion) | |
| Motif d'exclusion donné pour chaque article écarté en plein texte | |
| Synthèse organisée par thèmes, pas par articles | |
| Agenda de recherche dérivé des lacunes, pas plaqué | |
| Checklist PRISMA 2020 (27 items) ou phases SPAR-4-SLR couvertes | |

## Références clés

- Page, M. J., et al. (2021). The PRISMA 2020 statement. *BMJ*, 372:n71.
- Paul, J., Lim, W. M., O'Cass, A., Hao, A. W., & Bresciani, S. (2021). Scientific procedures and rationales for systematic literature reviews (SPAR-4-SLR). *International Journal of Consumer Studies*, 45(4).
- Tranfield, D., Denyer, D., & Smart, P. (2003). Towards a methodology for developing evidence-informed management knowledge. *British Journal of Management*, 14(3).

## Skills voisins

Question ouverte / champ émergent → `scoping-review`. Agrégation statistique d'effets → `meta-analyse`. Structure de synthèse par cadre → `revue-cadre-tccm`. Analyse quantitative du corpus → `revue-bibliometrique`.
