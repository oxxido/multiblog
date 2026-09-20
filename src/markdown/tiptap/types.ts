export interface TiptapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface TiptapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TiptapNode[];
  text?: string;
  marks?: TiptapMark[];
}

export interface TiptapDoc extends TiptapNode {
  type: "doc";
  // Un documento vacío (post recién creado, T5) serializa sin `content`: la
  // clave falta, no es un array vacío (así serializa Node#toJSON en
  // prosemirror-model). Nunca asumir que está presente.
  content?: TiptapNode[];
}
