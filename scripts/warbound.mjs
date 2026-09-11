/**
 * Warbound — UI & Journal theme bootstrap
 * Foundry VTT v14
 */

const MODULE_ID = "warbound-campaign-content";

const PATHS = {
  logo: `modules/${MODULE_ID}/assets/ui/warbound-logo.png`,
  defaultActor: `modules/${MODULE_ID}/assets/ui/actor-default.png`
};

/* ==========================================================================
 * LOGO WARBOUND — UI FOUNDRY V14
 * ========================================================================== */
function installWarboundSettingsLogo() {
  if (document.querySelector("#warbound-settings-logo")) return;

  const settingsSection = document.querySelector(
    "#settings section.settings.flexcol"
  );

  if (!settingsSection) {
    console.warn(`${MODULE_ID} | Settings section introuvable`);
    return;
  }

  const logoContainer = document.createElement("div");
  logoContainer.id = "warbound-settings-logo";

  const logo = document.createElement("img");
  logo.src = PATHS.logo;
  logo.alt = "Warbound";
  logo.draggable = false;

  logoContainer.appendChild(logo);

  settingsSection.before(logoContainer);

  console.info(`${MODULE_ID} | Warbound logo added to Settings`);
}

/* ==========================================================================
 * INITIALISATION
 * ========================================================================== */

Hooks.once("init", () => {
  document.body?.classList.add("warbound-theme");
  document.documentElement?.classList.add("warbound-theme-root");

  console.info(`${MODULE_ID} | Warbound theme initialized`);
});

Hooks.once("ready", () => {
  document.body?.classList.add("warbound-theme");

  installWarboundSettingsLogo();

  console.info(`${MODULE_ID} | Warbound UI initialized`);
});

Hooks.on("preCreateActor", (actor, data) => {

  if (!game.user.isGM) return;

  const img = data.img;

  const defaultImages = [
    undefined,
    null,
    "",
    "icons/svg/mystery-man.svg",
    "icons/svg/mystery-man-black.svg",

    /*
     * Confirmé dans ton monde :
     * le nouvel Actor SWADE utilise actuellement cette image.
     */
    "systems/dnd5e/icons/svg/actors/character.svg"
  ];

  if (!defaultImages.includes(img)) return;

  actor.updateSource({
    img: PATHS.defaultActor
  });
});