import { tiptapSchema } from "./extensions.js";
import type { TiptapDoc } from "./types.js";

// prosemirror-model tipa Schema#nodeFromJSON/Node#toJSON como `any` — es la
// superficie de esa librería, no algo que el resto del conversor deba
// tolerar. Se aísla acá: valida que el documento sea válido contra
// `tiptapExtensions` (mismo esquema que usa el cliente en T4) y devuelve la
// forma canónica que produce el propio ProseMirror, para que fromMarkdown y
// `editor.getJSON()` en el cliente nunca puedan divergir en formato.
export function normalizeTiptapDoc(doc: TiptapDoc): TiptapDoc {
  const node = tiptapSchema.nodeFromJSON(doc);
  return node.toJSON() as TiptapDoc;
}
