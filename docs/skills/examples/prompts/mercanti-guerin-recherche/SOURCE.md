---
type: source
collection: mercanti-guerin-recherche
title: "Prompts en recherche"
author: Maria Mercanti-Guérin
author_affiliation: Maître de conférences HDR, Marketing digital & IA (Université Paris 1 Panthéon-Sorbonne / IAE Paris)
source_page: https://mariamercantiguerin.com/prompts-en-recherche/
source_export: "https://r.jina.ai/https://mariamercantiguerin.com/prompts-en-recherche/"
source_export_sha256: df12b7f2baf7192b1b971000ae035e44b2414629174a41c7cb1df83c1f4cfbd1
published: 2026-06-01
retrieved: 2026-10-26
retrieved_by: Géraldine Geoffroy
license: "Non précisée — mention « Tous droits réservés » sur le site ; prompts publiés en accès libre pour copier-coller"
outil_cible: assistant conversationnel généraliste (Claude, ChatGPT…)
nombre_prompts: 50
---

# Source — Prompts en recherche (Maria Mercanti-Guérin)

Bibliothèque de prompts pour enseignants-chercheurs et doctorants, principalement en
sciences de gestion : jeux de rôle (reviewer, directeur de thèse, méthodologues), revue de
littérature, problématisation, méthodologie, analyse, rédaction, révision, rigueur des
citations, encadrement, et techniques de prompting avancées.

## Provenance et méthode d'extraction

- Export markdown de la page via r.jina.ai, fourni par Géraldine Geoffroy le 2026-10-26
  (SHA-256 de l'export ci-dessus).
- Découpage **par script**, sans retouche du texte des prompts : un sous-dossier par catégorie
  (dans l'ordre de la page), un fichier `.md` par prompt, texte du prompt dans un bloc `text`.
- Métadonnées reprises de la page dans le front matter de chaque fichier :
  `sous_type` (étiquette de la carte), `tags`, `selection` (`true` si la carte porte « ★ Sélection »).

## Anomalie connue de l'export

Deux prompts de « Méthodes avancées » contiennent « Réponds à , » / « Pour répondre à , » :
un champ à remplir (probablement `[tâche]` ou `[question]`) a sans doute été perdu à la
conversion HTML → markdown. Les fichiers concernés portent un avertissement ; à corriger
après vérification sur la page source.

- `10-methodes-avancees/02-raisonner-puis-verifier-react.md`
- `10-methodes-avancees/05-controle-d-incertitude-sense-check.md`

## Organisation

| Dossier | Catégorie sur la page | Prompts |
|---|---|---|
| 01-role | Rôle | 4 |
| 02-revue-de-litterature | Revue de littérature | 6 |
| 03-problematisation | Problématisation | 5 |
| 04-methodologie | Méthodologie | 6 |
| 05-analyse | Analyse | 5 |
| 06-redaction | Rédaction | 6 |
| 07-revision | Révision | 4 |
| 08-citations-rigueur | Citations & rigueur | 4 |
| 09-encadrement | Encadrement | 4 |
| 10-methodes-avancees | Méthodes avancées | 6 |

## Réutilisation

Aucune licence ouverte n'est indiquée. Usage interne / de travail ; pour toute rediffusion
ou adaptation publique, demander l'accord de l'autrice.
