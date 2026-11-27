---
name: revue-bibliometrique
description: >
  Conduit ou structure une revue bibliométrique (Donthu et al., 2021) : analyse quantitative
  d'un corpus large (centaines/milliers de documents) par analyse de performance (citations,
  auteurs, revues productives) et cartographie scientifique (co-citation, couplage
  bibliographique, cooccurrence de mots-clés, VOSviewer/Bibliometrix). Utilise ce skill dès
  que l'utilisateur mentionne « bibliométrie », « revue bibliométrique », « co-citation »,
  « couplage bibliographique », « VOSviewer », « Bibliometrix », « biblioshiny », « h-index
  d'un champ », veut identifier la structure intellectuelle d'un domaine, ses clusters
  thématiques, son évolution temporelle, ou traiter un corpus trop volumineux pour une
  lecture intégrale. Ne pas utiliser pour synthétiser le contenu des résultats
  (revue-systematique) : la bibliométrie décrit la structure d'un champ, pas ses conclusions.
  Les deux se combinent souvent (bibliométrie puis SLR sur les clusters).
---

# Revue bibliométrique

La revue bibliométrique analyse un champ **par ses métadonnées** (citations, auteurs, mots-clés, références) plutôt que par la lecture de ses contenus. Elle répond à : quelle est la structure intellectuelle du domaine, quels sont ses clusters, ses fondations, ses fronts émergents, sa dynamique. Format adapté aux corpus larges (règle de Donthu : pertinent à partir de plusieurs centaines de documents ; en dessous, préférer une SLR).

Limite à toujours rappeler : la bibliométrie dit qui parle avec qui et de quoi, **pas ce que les études concluent**. Une revue bibliométrique publiable se termine par une lecture qualitative des clusters, pas par les seules cartes.

## Étape 1 — Corpus

1. **Base unique de préférence** (Scopus ou Web of Science) : les formats de métadonnées se fusionnent mal. Documenter base, requête, filtres (types de documents, période, catégories), date d'extraction, n final.
2. Requête construite comme une équation de SLR (blocs de synonymes) puis **nettoyage** : dédoublonnage, harmonisation des mots-clés (singulier/pluriel, « AI »/« artificial intelligence »), désambiguïsation des auteurs homonymes. Le nettoyage conditionne toutes les cartes — y consacrer du temps et le documenter.

## Étape 2 — Analyse de performance (le « qui » et le « combien »)

Métriques descriptives : production annuelle (courbe de croissance), auteurs/institutions/pays les plus productifs et cités, revues sources, articles les plus cités (avec citations totales et par an), lois de distribution si utile (Lotka, Bradford). Présenter en tableaux ; c'est le volet descriptif, pas la contribution principale.

## Étape 3 — Cartographie scientifique (le « comment c'est structuré »)

Choisir les techniques selon la question (Donthu et al., 2021) :

| Technique | Unité liée | Révèle | Question type |
|---|---|---|---|
| **Analyse de co-citation** | Références citées ensemble | Les **fondations intellectuelles** (structure passée) | Sur quels socles le champ repose-t-il ? |
| **Couplage bibliographique** | Documents partageant des références | Les **fronts de recherche actuels** | Comment la recherche récente se regroupe-t-elle ? |
| **Cooccurrence de mots-clés** | Mots-clés apparaissant ensemble | La **structure thématique** | De quoi parle le champ ? |
| **Co-autorat** | Collaborations | La structure **sociale** | Qui travaille avec qui ? |
| Analyses dynamiques (overlay temporel, thematic evolution) | — | Les trajectoires | Comment les thèmes émergent/déclinent ? |

Combinaison canonique pour un article : co-citation (passé) + couplage ou cooccurrence (présent) + analyse temporelle (dynamique).

Outils : **VOSviewer** (cartes, gratuit), **Bibliometrix/biblioshiny** (R, le plus complet : diagramme stratégique, évolution thématique), CiteSpace (burst detection). Rapporter les paramètres (seuils d'occurrence, méthode de normalisation, résolution du clustering) — exigés par les relecteurs.

## Étape 4 — Interprétation des clusters (l'étape qui fait l'article)

Pour chaque cluster : le nommer (à partir de ses items dominants), lire ses 5–10 documents centraux, rédiger un paragraphe : objet du cluster, travaux structurants, lien avec les autres clusters, questions ouvertes. Puis monter en synthèse : que dit la structure d'ensemble (champ fragmenté ? dominé par une tradition ? front émergent sous-connecté aux fondations ?) → **agenda de recherche**.

## Erreurs à bloquer

- Publier les cartes sans lecture qualitative des clusters (« carte-poster »).
- Fusionner Scopus et WoS sans protocole de réconciliation.
- Interpréter la co-citation comme le présent du champ (elle photographie ses fondations).
- Corpus non nettoyé (mots-clés doublonnés) → clusters artefactuels.

## Passe de vérification (obligatoire)

| Contrôle | OK ? |
|---|---|
| Base, requête, filtres, date, n documentés | |
| Nettoyage des métadonnées décrit | |
| Techniques choisies justifiées par les questions | |
| Paramètres des cartes rapportés (seuils, normalisation, clustering) | |
| Chaque cluster nommé, lu et interprété | |
| Limite « structure ≠ conclusions » énoncée ; agenda de recherche final | |

## Références clés

- Donthu, N., Kumar, S., Mukherjee, D., Pandey, N., & Lim, W. M. (2021). How to conduct a bibliometric analysis: An overview and guidelines. *Journal of Business Research*, 133.
- Aria, M., & Cuccurullo, C. (2017). bibliometrix: An R-tool for comprehensive science mapping analysis. *Journal of Informetrics*, 11(4).
- Zupic, I., & Čater, T. (2015). Bibliometric methods in management and organization. *Organizational Research Methods*, 18(3).

## Skills voisins

Synthèse du contenu des clusters → `revue-systematique` (workflow hybride bibliométrie → SLR très valorisé). Champ émergent, petit corpus → `scoping-review`.
