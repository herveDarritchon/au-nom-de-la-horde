#!/usr/bin/env bash
# Détecte le HTML inline dans les template literals JS (backtick strings).
# Exceptions légitimes listées explicitement ci-dessous.
# Pour ajouter une exception : référencer "chemin/relatif/depuis/scripts/:numéro_de_ligne"
# et documenter pourquoi cette exception existe.
#
# Exceptions DOM hors périmètre de ce contrôle (innerHTML en guillemets simples,
# donc jamais détecté ici) — documentées pour traçabilité :
#   - scripts/importers/cof2ImportWizard.mjs         : bouton FontAwesome injecté dans l'annuaire des acteurs
#   - scripts/importers/warbound-markdown/WarboundMarkdownImporterApp.mjs : bouton FontAwesome injecté dans l'annuaire des journaux
# Ces deux points d'injection créent le bouton via document.createElement + innerHTML ;
# les migrer exigerait de refondre le point d'injection lui-même.

EXCEPTIONS=(
  # paragraph() dans itemFactory.mjs construit du HTML Foundry pour les descriptions d'items — usage légitime
  "scripts/importers/cof2/itemFactory.mjs:11"
)

FOUND=0

while IFS= read -r match; do
  file=$(echo "$match" | cut -d: -f1)
  line=$(echo "$match" | cut -d: -f2)
  ref="${file}:${line}"
  skip=0
  for exc in "${EXCEPTIONS[@]}"; do
    [[ "$exc" == "$ref" ]] && skip=1 && break
  done
  if [[ $skip -eq 0 ]]; then
    echo "ERREUR HTML inline détecté : $match"
    FOUND=1
  fi
done < <(grep -rn --include="*.mjs" -E '[`][^`]*<(div|section|form|button|ul|ol|li|p|h[1-6]|table|span|article|header|footer|nav|main)' scripts/ 2>/dev/null | grep -v '\.test\.mjs:')

if [[ $FOUND -eq 1 ]]; then
  echo ""
  echo "Corrigez le HTML inline (migrer vers un template HBS) ou ajoutez une exception documentée dans tools/check-inline-html.sh"
  exit 1
fi
echo "OK — aucun HTML inline non autorisé détecté."
