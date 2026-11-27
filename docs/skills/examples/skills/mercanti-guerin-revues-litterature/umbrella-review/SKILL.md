---
name: umbrella-review
description: >
  Conduit ou structure une umbrella review (revue de revues, overview of reviews, méta-revue) :
  synthèse dont les unités d'analyse sont des revues systématiques et méta-analyses
  existantes, avec évaluation de leur qualité (AMSTAR 2), gestion du chevauchement des
  études primaires et gradation de la confiance dans les résultats. Utilise ce skill dès
  que l'utilisateur mentionne « umbrella review », « revue de revues », « méta-revue »,
  « overview of reviews », « synthèse de méta-analyses », veut comparer ou réconcilier des
  revues systématiques contradictoires, ou dresser le panorama d'un champ déjà couvert par
  de nombreuses revues. Ne pas utiliser si le champ compte peu de revues systématiques
  publiées (basculer en revue-systematique sur les études primaires) ni pour agréger
  soi-même des effets primaires (meta-analyse).
---

# Umbrella review (revue de revues)

L'umbrella review prend de la hauteur : ses **unités d'analyse sont des revues systématiques et méta-analyses**, pas des études primaires. Elle sert quand un champ est si travaillé que les revues elles-mêmes prolifèrent — et parfois se contredisent. Sa valeur : dire au lecteur ce que l'ensemble des synthèses établit, avec quel niveau de confiance, et pourquoi elles divergent quand elles divergent.

## Condition de faisabilité

Vérifier d'abord qu'il existe **assez de revues systématiques/méta-analyses** (ordre de grandeur : ≥ 5–10 sur la question). Sinon, le format n'est pas viable — le dire à l'utilisateur et proposer une SLR classique. Vérifier aussi le périmètre : l'umbrella exige que les revues incluses portent sur une question comparable (même famille d'interventions/relations).

## Méthode en 6 temps

**1. Question et critères.** Question au format PICO/équivalent gestion, avec un critère d'inclusion supplémentaire : **seuls les documents se présentant comme revues systématiques ou méta-analyses** (méthodes de recherche documentées) sont éligibles ; exclure les revues narratives. Trancher à l'avance : inclut-on les revues systématiques sans méta-analyse ? les méta-analyses en préprint ?

**2. Recherche et sélection.** Équations avec filtres de type de document (« systematic review » OR « meta-analysis » dans titre/résumé), bases classiques + registres (PROSPERO pour repérer les revues en cours). Flux PRISMA adapté.

**3. Évaluation de la qualité des revues incluses — étape signature.** Outil standard : **AMSTAR 2** (16 items, dont 7 critiques : protocole préalable, exhaustivité de la recherche, justification des exclusions, risque de biais, méthodes statistiques, prise en compte du biais dans l'interprétation, biais de publication). Classer chaque revue : confiance élevée / modérée / faible / critique. En gestion, où AMSTAR est rare, l'adapter en grille explicite et le dire.

**4. Gestion du chevauchement (overlap).** Piège central du format : les mêmes études primaires apparaissent dans plusieurs revues → double comptage des preuves. Construire la **matrice de citation** (études primaires × revues) et calculer le **CCA** (corrected covered area : < 5 % faible, 5–10 % modéré, 10–15 % élevé, > 15 % très élevé). Si l'overlap est très élevé, privilégier la revue la plus récente/complète par question plutôt que d'additionner.

**5. Extraction et gradation.** Par revue : question, k études, N total, effet agrégé + IC, I², évaluation du biais de publication, conclusion des auteurs. Puis graduer la confiance par résultat (logique GRADE ou classes de preuves : convaincant / hautement suggestif / suggestif / faible), en croisant taille d'effet, significativité, hétérogénéité, qualité AMSTAR.

**6. Synthèse.** Organiser par **résultats** (pas par revue) : pour chaque relation, ce que les revues convergent à dire, avec quelle confiance, et l'explication des divergences (périodes couvertes, critères d'inclusion, méthodes d'agrégation différentes). Tableau maître : relation → nb de revues → effet(s) → confiance → divergences.

## Erreurs à bloquer

- Additionner les k et N des revues comme si les études étaient indépendantes (overlap ignoré).
- Traiter la conclusion d'une revue AMSTAR « critique » à égalité avec une revue robuste.
- Refaire une méta-analyse des méta-analyses sans justifier la méthode (possible mais exigeant : le signaler comme option avancée).

## Passe de vérification (obligatoire)

| Contrôle | OK ? |
|---|---|
| ≥ 5 revues systématiques/méta-analyses éligibles (sinon réorienter) | |
| Revues narratives exclues, critère documenté | |
| AMSTAR 2 (ou grille adaptée) appliqué à chaque revue | |
| Matrice de chevauchement + CCA calculé et interprété | |
| Synthèse par résultats avec gradation de confiance | |
| Divergences entre revues expliquées, pas moyennées en silence | |

## Références clés

- Aromataris, E., et al. (2015). Summarizing systematic reviews: methodological development of an umbrella review approach. *Int. Journal of Evidence-Based Healthcare*, 13(3).
- Shea, B. J., et al. (2017). AMSTAR 2. *BMJ*, 358:j4008.
- Pieper, D., et al. (2014). Systematic review finds overlapping reviews were not mentioned in every other overview. *Journal of Clinical Epidemiology*, 67(4). [CCA]

## Skills voisins

Peu de revues existantes → `revue-systematique`. Agrégation d'effets primaires → `meta-analyse`.
