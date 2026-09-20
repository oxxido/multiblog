export type Lang = "es" | "en";

export interface Dictionary {
  htmlLang: string;
  backToAll: string;
  categoriesLink: string;
  readingMinutesSuffix: string;
  paginationPrev: string;
  paginationOf: string;
  rssOfSpace: string;
  spacesNavLabel: string;
  tagsNavLabel: string;
  rssNavLabel: string;
  activeCountLabel: string;
  publishedCountLabel: string;
  latestSectionTitle: string;
  crossTagsSectionTitle: string;
  rssAggregatedLabel: string;
  archiveLabel: string;
  allCategoryLabel: string;
  centralHeadline: string;
  centralLeadSuffix: string;
}

export const dictionary: Record<Lang, Dictionary> = {
  es: {
    htmlLang: "es",
    backToAll: "← todo",
    categoriesLink: "Categorías",
    readingMinutesSuffix: "min",
    paginationPrev: "Posts anteriores",
    paginationOf: "de",
    rssOfSpace: "RSS del espacio",
    spacesNavLabel: "Espacios",
    tagsNavLabel: "Tags",
    rssNavLabel: "RSS",
    activeCountLabel: "activos",
    publishedCountLabel: "publicados",
    latestSectionTitle: "Último",
    crossTagsSectionTitle: "Tags que cruzan",
    rssAggregatedLabel: "RSS agregado",
    archiveLabel: "Archivo",
    allCategoryLabel: "Todo",
    centralHeadline: "Un solo sitio,<br />varios espacios.",
    centralLeadSuffix: "Cada uno vive en su propio subdominio y escribe a su ritmo; acá se ven todos juntos.",
  },
  en: {
    htmlLang: "en",
    backToAll: "← all",
    categoriesLink: "Categories",
    readingMinutesSuffix: "min",
    paginationPrev: "Previous posts",
    paginationOf: "of",
    rssOfSpace: "Space RSS",
    spacesNavLabel: "Spaces",
    tagsNavLabel: "Tags",
    rssNavLabel: "RSS",
    activeCountLabel: "active",
    publishedCountLabel: "published",
    latestSectionTitle: "Latest",
    crossTagsSectionTitle: "Tags that cross over",
    rssAggregatedLabel: "Aggregated RSS",
    archiveLabel: "Archive",
    allCategoryLabel: "All",
    centralHeadline: "One site,<br />many spaces.",
    centralLeadSuffix: "Each one lives on its own subdomain and writes at its own pace; here they all show up together.",
  },
};

export function stringsFor(lang: Lang): Dictionary {
  return dictionary[lang];
}
