/**
 * Résolution du type d'une attaque (melee/ranged/magical) via le référentiel d'armes du système COF2 (Issue #29) :
 * nom d'attaque → groupe d'arme COF2 (`martialTrainingsWeapons`) → équipement COF2 (`martialCategory`) → action
 * COF2 (`action.type`). Le résultat de cette chaîne est fourni ici sous forme d'un index déjà construit
 * (`weaponTypeByName`, nom normalisé → type) : ce module ne connaît aucune API Foundry, il ne fait qu'y chercher.
 *
 * L'information explicite du statblock (portée, préfixe « attaque à distance »/« attaque magique », déjà traitée
 * par `parseAttackLine`) reste prioritaire : ce resolver ne comble que le fallback `melee` par défaut, jamais une
 * classification déjà déterminée explicitement.
 *
 * Module pur : aucun appel `game`/`Actor`/`Item`/`foundry.*`.
 */

/**
 * @param {string} value
 * @returns {string}
 */
function normalizeWeaponName(value) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Construit le resolver de type d'attaque à partir d'un index déjà chargé (`cof2Adapter.mjs`/`encounterFactory.mjs`,
 * qui seuls connaissent `game.system.CONST.martialTrainingsWeapons` et le compendium d'équipement).
 * @param {{weaponTypeByName: Map<string,("melee"|"ranged"|"magical")>, aliases?: Record<string,string>}} index
 * @returns {(name:string) => ("melee"|"ranged"|"magical"|null)}
 */
function makeAttackTypeResolver({ weaponTypeByName, aliases = {} }) {
  return (name) => {
    const normalized = normalizeWeaponName(name);
    const canonical = aliases[normalized] ? normalizeWeaponName(aliases[normalized]) : normalized;
    return weaponTypeByName.get(canonical) ?? null;
  };
}

/**
 * Applique le resolver à une attaque déjà parsée : ne touche jamais un `kind` explicitement déterminé par le
 * statblock (`ranged`/`magical`), ne comble que le fallback conservateur `melee`. Si le resolver ne trouve rien
 * (arme inconnue du référentiel, attaque naturelle), le fallback `melee` est conservé tel quel.
 * @param {{name:string, kind:("melee"|"ranged"|"magical")}} attack
 * @param {((name:string) => ("melee"|"ranged"|"magical"|null))|null|undefined} resolve
 * @returns {"melee"|"ranged"|"magical"}
 */
function resolveAttackKind(attack, resolve) {
  if (attack.kind !== "melee") return attack.kind;
  return resolve?.(attack.name) ?? attack.kind;
}

export { normalizeWeaponName, makeAttackTypeResolver, resolveAttackKind };
