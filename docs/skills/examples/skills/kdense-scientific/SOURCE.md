---
type: source
collection: kdense-scientific
title: "Scientific Agent Skills (sélection de 10 skills)"
author: K-Dense Inc.
author_url: https://www.k-dense.ai
source_page: https://github.com/K-Dense-AI/scientific-agent-skills/tree/main/skills
source_repository: https://github.com/K-Dense-AI/scientific-agent-skills
source_commit: 5f2bc0341354fd5590aef76a533ada1e1e5b4e62
source_commit_date: 2026-10-26
retrieved: 2026-10-26
retrieved_by: Géraldine Geoffroy
license: "MIT (dépôt) ; liteparse déclare Apache-2.0 dans son front matter — voir LICENSE.md"
format_original: "dossier de skill au standard Agent Skills : <nom>/SKILL.md + references/ + scripts/ + assets/"
nombre_skills: 10
langue: anglais
---

# Source — Scientific Agent Skills (K-Dense Inc.) — sélection

Sélection de 10 skills issues d'une bibliothèque ouverte de skills scientifiques au standard
Agent Skills (compatible Claude et autres agents). Contrairement à la collection
`skills-revues-litterature`, ces skills ne sont pas de simples fichiers markdown : elles
embarquent des références, des gabarits (`assets/`) et des scripts Python. Elles sont donc
conservées **en dossiers complets, sans modification**, pour rester installables telles quelles.

## Provenance et méthode d'extraction

- Clone du dépôt (`git clone --depth 1`, branche `main`) le 2026-10-26, commit ci-dessus.
- Copie à l'identique des dossiers `skills/<nom>/` ; seul `LICENSE.md` du dépôt a été ajouté
  à la racine de cette collection.
- Pour retrouver exactement cette version :
  `https://github.com/K-Dense-AI/scientific-agent-skills/tree/5f2bc0341354fd5590aef76a533ada1e1e5b4e62/skills`
- Note : la skill demandée sous le nom « scientific-criticial-thinking » s'appelle
  `scientific-critical-thinking` dans le dépôt.

## Contenu

| Skill | Version | Licence | Dépendances externes notables |
|---|---|---|---|
| exploratory-data-analysis | 1.4 | MIT | Python 3.11+, local, sans réseau |
| hypothesis-generation | 2.4 | MIT | Python 3.11+, local, sans réseau |
| paper-lookup | 2.4 | MIT | Réseau ; 18 API publiques (OpenAlex, Crossref, PubMed, arXiv, CORE…), pas de HAL ; clés optionnelles |
| liteparse | 1.6 | Apache-2.0 | Python 3.10+, bibliothèque liteparse 2.15.0, LibreOffice pour formats Office |
| literature-review | 1.11 | MIT | Réseau ; schémas IA via OpenRouter (clé requise) ; Pandoc/XeLaTeX pour PDF |
| research-grants | 1.5 | MIT | Réseau ; orienté financeurs US (NIH, NSF, DOE, DARPA) + NSTC |
| research-lookup | 1.7 | MIT | Réseau ; **service commercial Parallel** (clé `PARALLEL_API_KEY`) ; Perplexity via OpenRouter en option |
| scientific-brainstorming | 1.4 | MIT | Python 3.11+, local, sans réseau |
| scientific-critical-thinking | 1.5 | MIT | Aucune (schémas via OpenRouter en option) |
| scientific-writing | 2.3 | MIT | Python 3.11+, local, sans réseau |

Versions et compatibilités relevées dans le front matter de chaque `SKILL.md`.

## Citation

Le fichier `CITATION.cff` du dépôt demande de citer le dépôt et de consigner le commit
utilisé (ici `5f2bc03`).

## Réutilisation

Licence MIT (et Apache-2.0 pour liteparse) : réutilisation, modification et rediffusion
autorisées, à condition de conserver la mention de copyright et le texte de licence.
