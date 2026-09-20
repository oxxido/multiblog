import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableHeader from "@tiptap/extension-table-header";
import TableCell from "@tiptap/extension-table-cell";
import { blockTiptapNodes } from "../blocks/index.js";

// Único lugar donde se listan los nodos/marcas del editor visual (párrafo,
// encabezado, lista, enlace, código, cita, tabla — docs/slices/05.md §0; más
// los bloques ricos de S6). El cliente (src/admin-client/editor.ts) y el
// conversor (fromMarkdown/toMarkdown) importan esta misma lista: un nombre
// de nodo que no coincide entre los dos lados falla acá, en un solo lugar,
// en vez de producir un documento que un lado entiende y el otro no. Un
// bloque nuevo no toca este archivo: sale de `blockTiptapNodes`, que crece
// en src/markdown/blocks/index.ts.
export const tiptapExtensions = [
  StarterKit.configure({ link: false }),
  Link.configure({ openOnClick: false, autolink: false }),
  Table,
  TableRow,
  TableHeader,
  TableCell,
  ...blockTiptapNodes,
];

export const tiptapSchema = getSchema(tiptapExtensions);
