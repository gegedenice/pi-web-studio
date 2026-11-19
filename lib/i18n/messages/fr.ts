import { studioFrMessages } from "../../studio/i18n/fr";
import type { LocalePlugin } from "../types";

/**
 * French, PI Studio fork. Partial: only the Studio's own keys (`studio.*`) are
 * translated; the rest of pi-web falls back to English, so pi-web does not
 * offer this language in its menu (see `partialLocalePlugins` in the registry).
 */
export const frLocale: LocalePlugin = {
  id: "fr",
  label: "Français",
  messages: studioFrMessages,
};
