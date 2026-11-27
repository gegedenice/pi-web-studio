---
name: evaluer-le-corpus
description: >
  Produit le rapport d'évaluation du corpus d'une revue de littérature AVANT toute synthèse :
  volume par source, part évaluée par les pairs, en accès ouvert, avec résumé, avec texte intégral,
  répartition par année, type et langue, rétractés écartés, et conformité à la fiche de cadrage.
  À utiliser dès qu'un corpus a été constitué (par recherche dans OpenAlex ou HAL, ou fourni par
  l'utilisateur) et avant de rédiger quoi que ce soit, ou quand l'utilisateur demande de décrire,
  profiler ou évaluer un ensemble de publications.
metadata:
  version: "0.1"
  owner: "Géraldine Geoffroy"
  status: "en test"
  derived_from: "skills/kdense-scientific/literature-review (comptages et flux PRISMA) ; skills/mercanti-guerin-revues-litterature/scoping-review et revue-bibliometrique (description du corpus) ; skills/kdense-scientific/paper-lookup (signaler les résultats vides ou partiels)"
  tests: "pack literature-review, suite tests/corp-evaluation-corpus.md ; banc d'essai, suite tests/n4-skill-mcp.md"
---

# Évaluer le corpus

But : dire au lecteur **sur quoi repose la synthèse** avant de la lui donner. Le rapport se
fonde sur les éléments de la fiche de cadrage (voir la skill `qualifier-la-demande`) et ne
contient que des chiffres renvoyés par les outils.

## 1. Mesurer, source par source

Utilise exactement les filtres de la fiche de cadrage, puis mesure chaque indicateur.

**OpenAlex.**
- `analyze_works` avec `sections: ["by_year", "by_type", "open_access"]` : total, répartition par
  année et par type, part en accès ouvert.
- `group_works` avec `group_by: "language"` : répartition par langue.
- Part avec résumé : `search_works` avec `preview: true` et `raw_filter: has_abstract:true`
  (garder les autres filtres), puis rapporter au total.
- Rétractés : `search_works` avec `preview: true`, `include_retracted: true` et
  `raw_filter: is_retracted:true`. Le nombre est le nombre de rétractés **écartés**.
- Comité de lecture : OpenAlex n'a pas d'indicateur. Donner la part de `article` + `review` et la
  part de `preprint`, en l'appelant **approximation**.

**HAL** (outil `search`, `rows: 0`, un appel par indicateur, mêmes `q` et `fq` de base).
- Total.
- Évalués par les pairs : ajouter `fq: peerReviewing_s:1`.
- Accès ouvert : `fq: openAccess_bool:true`.
- Texte intégral déposé : `fq: submitType_s:file`.
- Avec résumé : `fq: abstract_s:*`.
- Par langue : `fq: language_s:fr`, puis `fq: language_s:en`.
- Rétractés : HAL ne signale pas les rétractations. Le dire.

**Corpus fourni par l'utilisateur.** Compter à partir des notices fournies. Ce qui n'est pas
renseigné est « non renseigné », jamais deviné.

## 2. Rédiger le rapport

Commence la réponse par ce bloc. Pourcentages arrondis à l'unité, toujours avec l'effectif.

```
RAPPORT D'ÉVALUATION DU CORPUS (date : AAAA-MM-JJ)
| Indicateur | OpenAlex | HAL |
|---|---|---|
| Documents retenus | n | n |
| Évalués par les pairs | ≈ x % (approximation : articles et revues de synthèse) | x % (n) |
| Accès ouvert | x % (n) | x % (n) |
| Avec résumé | x % (n) | x % (n) |
| Texte intégral déposé | — | x % (n) |
| Langues | fr x %, en x % | fr x %, en x % |
| Années (min-max, année la plus fournie) | … | … |
| Rétractés écartés | n | non signalé par HAL |

Conformité au cadrage : …
Points d'attention : …
Requêtes : OQL / reproduce_url (OpenAlex) ; requêtes Solr (HAL)
```

- **Conformité au cadrage** : pour chaque critère de la fiche (période, langues, types, comité de
  lecture, exclusions), dire s'il est respecté et comment il a été appliqué.
- **Points d'attention** : déséquilibres et limites qui pèseront sur la synthèse. Par exemple :
  langue minoritaire (moins de 10 %), année qui concentre l'essentiel du corpus, forte part sans
  résumé, corpus trop large pour une lecture complète (plus de 500 documents), corpus vide ou
  quasi vide, écart important entre les sources.
- Si le corpus est vide : le dire, proposer un élargissement précis, et **ne rien synthétiser**.

## Erreurs à éviter

- Commencer la synthèse avant le rapport, ou donner un rapport sans chiffres d'outil.
- Présenter un échantillon (les 20 premiers résultats) comme le corpus entier.
- Additionner les totaux OpenAlex et HAL : les deux sources se recouvrent.
- Présenter l'approximation OpenAlex du comité de lecture comme une mesure.

## Checklist

- [ ] Le rapport précède toute synthèse
- [ ] Chaque chiffre vient d'un appel d'outil, avec effectif et pourcentage
- [ ] Indicateurs non disponibles signalés comme tels (comité de lecture OpenAlex, rétractés HAL)
- [ ] Conformité au cadrage et points d'attention renseignés
- [ ] Requêtes rejouables fournies
