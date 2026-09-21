// Formato propio, no YAML: sólo lo escribe y lo lee esta herramienta
// (docs/slices/10.md §0), así que no hace falta un parser general. Puro
// texto adentro, puro texto afuera, sin I/O ni dependencia de la base, para
// poder testearlo sin Postgres (mismo motivo que derivatives.ts en S7).

export interface FrontMatterFile {
  data: Record<string, string>;
  bodyMd: string;
}

const DELIMITER = "---";

export function parseFrontMatterFile(raw: string): FrontMatterFile {
  const lines = raw.split("\n");

  if (lines[0] !== DELIMITER) {
    throw new Error("El archivo no empieza con el delimitador de front-matter (---)");
  }

  const closingIndex = lines.indexOf(DELIMITER, 1);
  if (closingIndex === -1) {
    throw new Error("El archivo no tiene delimitador de cierre de front-matter (---)");
  }

  const data: Record<string, string> = {};
  for (const line of lines.slice(1, closingIndex)) {
    if (line.trim().length === 0) {
      continue;
    }
    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      throw new Error(`Línea de front-matter sin ":": ${line}`);
    }
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim();
    data[key] = value;
  }

  const bodyMd = lines.slice(closingIndex + 1).join("\n").replace(/^\n+/, "");

  return { data, bodyMd };
}

// Mismo orden siempre, para que un export→import→export sea estable.
const FIELD_ORDER = [
  "title",
  "slug",
  "status",
  "published_at",
  "excerpt",
  "categories",
  "tags",
  "translation_of",
] as const;

export function serializeFrontMatterFile(data: Record<string, string | undefined>, bodyMd: string): string {
  const lines = [DELIMITER];

  for (const key of FIELD_ORDER) {
    const value = data[key];
    if (value === undefined) {
      continue;
    }
    lines.push(`${key}: ${value}`);
  }

  lines.push(DELIMITER, "", bodyMd);

  return lines.join("\n");
}
