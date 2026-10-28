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

function pad2(value: number): string {
  return value.toString().padStart(2, "0");
}

// Para el admin, que escribe en español: con año y hora, a diferencia de
// formatDateLong, porque ahí se distinguen cambios hechos el mismo día. Usa
// la hora del servidor, igual que el campo datetime-local de "Programar".
export function formatDateTime(date: Date): string {
  const month = MONTHS_SHORT.es[date.getMonth()] ?? "";
  return `${date.getDate().toString()} ${month} ${date.getFullYear().toString()}, ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}
