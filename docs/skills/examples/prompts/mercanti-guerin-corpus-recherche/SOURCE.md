---
type: source
collection: mercanti-guerin-corpus-recherche
title: "NotebookLM — Prompts pour la recherche"
author: Maria Mercanti-Guérin
author_affiliation: Maître de conférences HDR, Marketing digital & IA (Université Paris 1 Panthéon-Sorbonne / IAE Paris)
source_page: https://mariamercantiguerin.com/outils-pedagogiques-recherche/notebooklm-prompts-recherche/
source_export: "https://r.jina.ai/https://mariamercantiguerin.com/outils-pedagogiques-recherche/notebooklm-prompts-recherche/"
source_export_sha256: dd78702d0c03806128527746102be73496e406fefb8d51e7830389e126e39285
published: 2026-06-29
modified: 2026-09-30
retrieved: 2026-10-26
retrieved_by: Géraldine Geoffroy
license: "Non précisée — mention « Tous droits réservés » sur le site ; prompts publiés en accès libre pour copier-coller"
outil_cible: NotebookLM (Google), sauf catégorie ⑤ (Claude) et ⑥ (texte pour article)
nombre_prompts: 17
---

# Source — NotebookLM : prompts pour la recherche (Maria Mercanti-Guérin)

Bibliothèque de prompts à copier-coller dans la fenêtre Chat de NotebookLM, pour construire
un corpus, cartographier un débat, bâtir un cadre théorique, formuler des hypothèses et
produire une revue de littérature aux références vérifiables. Guide présenté par l'autrice
comme réalisé avec l'assistance de NotebookLM et de Claude.

## Provenance et méthode d'extraction

- Export markdown de la page via r.jina.ai, fourni par Géraldine Geoffroy le 2026-10-26
  (SHA-256 de l'export ci-dessus).
- Découpage **par script**, sans retouche du texte des prompts : un sous-dossier par catégorie
  (dans l'ordre de la page), un fichier `.md` par prompt, texte du prompt dans un bloc `text`.
- Le `README.md` de chaque catégorie reprend la consigne d'usage qui précède les prompts sur la page.
- **Titres des prompts** : l'export markdown ne contient pas les intitulés (sous-titres H4 au-dessus
  des boutons « Copier »). Ils ont été repris de la page en ligne, consultée le 2026-10-26.
- Non repris (hors périmètre « prompts ») : sommaire des 14 tutoriels, présentation de l'interface,
  plan de travail en 12 jours, règle d'or, ressources.

## Organisation

| Dossier | Catégorie sur la page | Prompts |
|---|---|---|
| 01-diagnostic-exploration-du-corpus | ① Diagnostic & exploration du corpus | 3 |
| 02-revue-de-litterature-avec-references-fiables | ② Revue de littérature avec références fiables | 4 |
| 03-cadre-theorique-modele-conceptuel | ③ Cadre théorique & modèle conceptuel | 4 |
| 04-hypotheses-a-partir-de-la-litterature | ④ Hypothèses à partir de la littérature | 4 |
| 05-le-prompt-de-transfert-vers-claude | ⑤ Le prompt de transfert vers Claude | 1 |
| 06-declaration-dusage-ia-section-methode | ⑥ Déclaration d'usage IA (section méthode) | 1 |

## Réutilisation

Aucune licence ouverte n'est indiquée. Usage interne / de travail ; pour toute rediffusion
ou adaptation publique, demander l'accord de l'autrice.
