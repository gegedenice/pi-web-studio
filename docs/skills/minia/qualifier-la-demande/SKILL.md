---
name: qualifier-la-demande
description: >
  Qualifie une demande de revue de littérature, d'état de l'art ou de synthèse bibliographique
  AVANT toute recherche : pose au plus 5 questions regroupées, chacune avec une valeur par défaut
  (type de revue, période, langues, types de documents, comité de lecture, sources, exclusions),
  puis produit une fiche de cadrage traduite en filtres OpenAlex et HAL. À utiliser dès qu'une
  demande porte sur « la littérature », « l'état de l'art », « une revue », « que sait-on de… »,
  ou qu'un périmètre manque. Ne pas utiliser pour une recherche ciblée (un article, un DOI, un auteur).
metadata:
  version: "0.1"
  owner: "Géraldine Geoffroy"
  status: "en test"
  derived_from: "skills/claude-science/literature-review ; skills/kdense-scientific/paper-lookup (contrat de récupération) ; skills/mercanti-guerin-revues-litterature/INDEX-revues-litterature.md, rapid-review, revue-narrative (mandat)"
  tests: "pack literature-review, suite tests/qual-qualification.md"
---

# Qualifier la demande

But : savoir **exactement** quoi chercher avant de lancer le moindre outil de recherche. Une
question ne se pose que si sa réponse change ce que tu vas faire.

## 1. Décider s'il faut qualifier

- **Ne qualifie pas** une recherche ciblée : un article précis, « l'article fondateur de X », un
  DOI, un auteur. Cherche directement.
- **Ne qualifie pas** si la demande précise déjà type de revue, période, langues, types de
  documents et sources. Restitue la fiche de cadrage et continue.
- **Ne qualifie pas** si l'utilisateur demande d'avancer « sans questions » : applique les valeurs
  par défaut ci-dessous et annonce-les en tête de réponse.
- Sinon : **qualifie, et n'appelle aucun outil de recherche dans ce tour.**

## 2. Poser les questions (une seule fois, 5 au maximum)

Regroupe les questions dans un seul message, numérotées. Chaque question propose sa valeur par
défaut, que l'utilisateur confirme ou corrige. Ne pose que celles dont la réponse manque.

| Dimension | Question type | Valeur par défaut proposée |
|---|---|---|
| Livrable et type de revue | « Pour quel usage : note rapide, section d'article, revue complète ? » | État de l'art synthétique (revue narrative) |
| Période | « Quelle période ? » | Les 5 dernières années complètes |
| Langues | « Quelles langues ? » | Français et anglais |
| Types de documents et **comité de lecture** | « Articles évalués par les pairs seulement, ou aussi preprints, thèses, communications, rapports ? » | Articles évalués par les pairs (et revues de synthèse) ; preprints exclus |
| Sources | « Quelles sources ? » | OpenAlex et HAL |
| Exclusions | « Faut-il exclure certains contenus ? » | Rétractés exclus ; autres exclusions à préciser (disciplines, pays, accès ouvert seulement…) |

Si le type de revue est incertain, propose le plus probable selon la question : « que sait-on de
l'effet de X » → revue systématique ou rapide ; « qu'est-ce qui existe sur X » → revue de portée
(scoping) ; « section théorique d'un article » → revue narrative.

## 3. Produire la fiche de cadrage

Dès que le cadrage est connu (réponses de l'utilisateur, demande déjà précise ou valeurs par
défaut), restitue-la sous cette forme exacte :

```
FICHE DE CADRAGE
- Question : …
- Livrable / type de revue : …
- Concepts : …
- Période : AAAA-AAAA
- Langues : …
- Types de documents : …
- Comité de lecture : oui (évalués par les pairs seulement) | non (preprints et autres inclus)
- Sources : …
- Exclusions : …
- Valeurs par défaut appliquées : … (ou « aucune »)
```

## 4. Traduire la fiche en filtres

| Fiche | OpenAlex | HAL (outil `search`, dans `fq`) |
|---|---|---|
| Période | `from_year`, `to_year` | `producedDateY_i:[AAAA TO AAAA]` |
| Langues | `raw_filter: language:en\|fr` | `language_s:(fr OR en)` |
| Articles | `types: ["article", "review"]` | `docType_s:ART` |
| Comité de lecture | **Pas d'indicateur direct** : types `article`/`review` sans `preprint`, éventuellement `core_sources_only: true`. **Dire que c'est une approximation.** | `peerReviewing_s:1` |
| Rétractés exclus | Par défaut (ne pas mettre `include_retracted`) | HAL ne signale pas les rétractations : le dire |
| Accès ouvert seulement | `open_access_only: true` | `openAccess_bool:true` |

## Erreurs à éviter

- Poser des questions sur une recherche ciblée, ou des questions sans valeur par défaut.
- Poser les questions puis lancer quand même la recherche dans le même tour.
- Oublier la question du comité de lecture, ou affirmer qu'OpenAlex filtre le comité de lecture.
- Inventer une préférence que l'utilisateur n'a pas exprimée : ce qui n'est pas dit est une
  valeur par défaut, et se déclare comme telle.

## Checklist

- [ ] Qualifier ou non : décision conforme à la section 1
- [ ] Au plus 5 questions, regroupées, chacune avec sa valeur par défaut
- [ ] Comité de lecture et preprints traités explicitement
- [ ] Fiche de cadrage au format exact
- [ ] Filtres traduits par source, approximations déclarées
