---
type: source
collection: claude-science
title: "Skills de Claude Science (Anthropic)"
author: Anthropic
source_page: "À COMPLÉTER — URL ou lieu de récupération"
retrieved: "À COMPLÉTER"
retrieved_by: Géraldine Geoffroy
license: "Apache-2.0 (déclarée dans le front matter de literature-review/SKILL.md)"
format_original: "dossier de skill : <nom>/SKILL.md + kernel.py"
nombre_skills: 1
langue: anglais
---

# Source — Skills de Claude Science (Anthropic)

Skills issues de Claude Science, l'environnement de recherche d'Anthropic. Conservées en
dossiers complets, sans modification.

## Contenu

| Skill | Fichiers | SHA-256 de SKILL.md (2026-10-26) |
|---|---|---|
| literature-review | SKILL.md, kernel.py | 88d86b884e1aba99aaf69d3f5c636e78935d91a1b0d690d5e3ed483d4c8d42f6 |

## Points d'attention

- `kernel.py` est conçu pour être chargé automatiquement par l'hôte Claude Science
  (« auto-loaded into the python kernel by the host ») et s'appuie sur son runtime : la
  skill n'est **pas portable telle quelle** dans un autre agent. Le `SKILL.md` reste
  lisible et réutilisable comme méthode.
- Services tiers appelés : Crossref et OpenAlex (clé API OpenAlex requise depuis le
  13 février 2026, d'après le front matter).

## Provenance

À compléter : URL ou procédure de récupération, date, version éventuelle.
