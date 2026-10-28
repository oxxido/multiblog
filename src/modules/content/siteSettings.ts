import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { siteSettings } from "../../db/schema.js";

const SITE_SETTINGS_ID = 1;

export interface HeroTexts {
  headlineEs: string | null;
  headlineEn: string | null;
  leadEs: string | null;
  leadEn: string | null;
}

export async function getHeroTexts(): Promise<HeroTexts> {
  const [row] = await db
    .select({
      headlineEs: siteSettings.headlineEs,
      headlineEn: siteSettings.headlineEn,
      leadEs: siteSettings.leadEs,
      leadEn: siteSettings.leadEn,
    })
    .from(siteSettings)
    .where(eq(siteSettings.id, SITE_SETTINGS_ID))
    .limit(1);
  return row ?? { headlineEs: null, headlineEn: null, leadEs: null, leadEn: null };
}

export async function setHeroTexts(texts: HeroTexts): Promise<void> {
  await db.update(siteSettings).set(texts).where(eq(siteSettings.id, SITE_SETTINGS_ID));
}
