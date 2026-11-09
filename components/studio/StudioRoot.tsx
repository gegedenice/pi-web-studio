"use client";

import { Suspense } from "react";
import { I18nProvider } from "@/hooks/useI18n";
import { studioEnMessages } from "@/lib/studio/i18n/en";
import { PackWorkshop } from "./PackWorkshop";
import { StudioHome } from "./StudioHome";

// French unless the user picked a language in pi-web; the Studio's English
// keys back any language that does not translate them.
const EXTRA_MESSAGES = { en: studioEnMessages };

export function StudioRoot({ packId }: { packId?: string }) {
  return (
    <Suspense>
      <I18nProvider defaultLocale="fr" extraMessages={EXTRA_MESSAGES}>
        {packId ? <PackWorkshop packId={packId} /> : <StudioHome />}
      </I18nProvider>
    </Suspense>
  );
}
