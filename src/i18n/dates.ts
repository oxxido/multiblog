import type { Lang } from "./dictionary.js";

const MONTHS: Record<Lang, string[]> = {
  es: [
    "enero",
    "febrero",
    "marzo",
    "abril",
    "mayo",
    "junio",
    "julio",
    "agosto",
    "septiembre",
    "octubre",
    "noviembre",
    "diciembre",
  ],
  en: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ],
};

const MONTHS_SHORT: Record<Lang, string[]> = {
  es: ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"],
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
};

export function formatDateLong(date: Date, lang: Lang): string {
  const months = MONTHS[lang];
  if (lang === "en") {
    return `${months[date.getMonth()] ?? ""} ${date.getDate().toString()}`;
  }
  return `${date.getDate().toString()} de ${months[date.getMonth()] ?? ""}`;
}

export function formatDateShort(date: Date, lang: Lang): string {
  return `${date.getDate().toString()} ${MONTHS_SHORT[lang][date.getMonth()] ?? ""}`;
}
