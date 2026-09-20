import { Editor } from "@tiptap/core";
import { tiptapExtensions } from "../markdown/tiptap/extensions.js";
import { fromMarkdown } from "../markdown/tiptap/fromMarkdown.js";
import { toMarkdown } from "../markdown/tiptap/toMarkdown.js";
import type { TiptapDoc } from "../markdown/tiptap/types.js";

type Mode = "visual" | "raw";

const AUTOSAVE_DEBOUNCE_MS = 2000;

interface EditorElements {
  textarea: HTMLTextAreaElement;
  visual: HTMLElement;
  toggle: HTMLButtonElement;
  insertButtons: HTMLButtonElement[];
}

function readInitialDoc(visual: HTMLElement): TiptapDoc {
  const raw = visual.dataset.initialDoc;
  if (!raw) {
    throw new Error("Falta el documento inicial del editor visual");
  }
  return JSON.parse(raw) as TiptapDoc;
}

// editor.getJSON() tipa sus atributos como `Record<string, any> | undefined`
// en una clave siempre presente; TiptapDoc los tipa como clave opcional
// (`exactOptionalPropertyTypes`). Ida y vuelta por JSON hace que las dos
// formas coincidan en tiempo de ejecución, no sólo en el tipo.
function toTiptapDoc(json: ReturnType<Editor["getJSON"]>): TiptapDoc {
  return JSON.parse(JSON.stringify(json)) as TiptapDoc;
}

function setMode(mode: Mode, elements: EditorElements): void {
  const isVisual = mode === "visual";
  elements.visual.hidden = !isVisual;
  elements.textarea.hidden = isVisual;
  elements.toggle.textContent = isVisual ? "Ver Markdown" : "Ver editor visual";
  elements.toggle.dataset.mode = mode;
  for (const button of elements.insertButtons) {
    button.disabled = !isVisual;
  }
}

function currentMode(toggle: HTMLButtonElement): Mode {
  return toggle.dataset.mode === "raw" ? "raw" : "visual";
}

// POST/:id/autosave sólo toca body_md/body_html (docs/slices/05.md §0): acá
// no hay slug, title, status ni categorías que mandar, sólo el Markdown
// vigente en el modo que esté activo.
function scheduleAutosave(postId: string, getBodyMd: () => string): () => void {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  return () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      void fetch(`/admin/posts/${postId}/autosave`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ bodyMd: getBodyMd() }),
      });
    }, AUTOSAVE_DEBOUNCE_MS);
  };
}

// Extrae el id de video de un id suelto o de las formas de URL más comunes
// de YouTube — el autor puede pegar cualquiera de las dos (docs/slices/06.md
// §0). Si no matchea ningún patrón conocido, se asume que ya es el id.
function extractYoutubeId(input: string): string {
  const trimmed = input.trim();
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube(?:-nocookie)?\.com\/embed\/)([\w-]+)/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(trimmed);
    if (match?.[1]) {
      return match[1];
    }
  }
  return trimmed;
}

interface PromptImage {
  src: string;
  alt: string;
}

// Una URL por línea, `alt` opcional separado por `|` (docs/slices/06.md §0):
// `https://.../a.jpg|Un gato`. Líneas vacías se ignoran.
function parseGalleryPrompt(input: string): PromptImage[] {
  return input
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const [src, alt] = line.split("|");
      return { src: (src ?? "").trim(), alt: (alt ?? "").trim() };
    })
    .filter((image) => image.src.length > 0);
}

// Insertar siempre al final del documento, no en la posición del cursor:
// `callout` acepta sólo `paragraph+` adentro, así que insertarlo dentro de
// otro callout (o con el cursor todavía posicionado ahí después de una
// inserción anterior) no encaja en ese esquema y TipTap lo descarta en
// silencio. Insertar al final es siempre una posición de bloque válida.
function insertBlockAtEnd(editor: Editor, node: Record<string, unknown>): void {
  editor.chain().focus().insertContentAt(editor.state.doc.content.size, node).run();
}

// La validación real de los atributos es la de Zod en el registro, del lado
// servidor, al guardar (docs/slices/06.md §0) — acá sólo se evita insertar
// nada si el prompt vuelve vacío o cancelado.
function insertCallout(editor: Editor): void {
  const type = window.prompt("Tipo de callout (info, warning o success):", "info");
  if (!type || type.trim().length === 0) {
    return;
  }
  insertBlockAtEnd(editor, {
    type: "callout",
    attrs: { type: type.trim() },
    content: [{ type: "paragraph" }],
  });
}

function insertGallery(editor: Editor): void {
  const raw = window.prompt("Una URL de imagen por línea (alt opcional después de '|'):", "");
  if (!raw) {
    return;
  }
  const images = parseGalleryPrompt(raw);
  if (images.length === 0) {
    return;
  }
  insertBlockAtEnd(editor, { type: "gallery", attrs: { images, cols: 2 } });
}

function insertYoutube(editor: Editor): void {
  const raw = window.prompt("Id o URL de YouTube:", "");
  if (!raw || raw.trim().length === 0) {
    return;
  }
  const videoId = extractYoutubeId(raw);
  insertBlockAtEnd(editor, { type: "youtube", attrs: { videoId, title: "Video de YouTube" } });
}

function mountToolbar(editor: Editor, buttons: HTMLButtonElement[]): void {
  const inserters: Record<string, (editor: Editor) => void> = {
    callout: insertCallout,
    gallery: insertGallery,
    youtube: insertYoutube,
  };
  for (const button of buttons) {
    const kind = button.dataset.insertBlock;
    const insert = kind ? inserters[kind] : undefined;
    if (!insert) {
      continue;
    }
    button.addEventListener("click", () => {
      insert(editor);
    });
  }
}

// Alternar no cambia qué envía el <form>: el textarea con name="bodyMd"
// sigue siendo el campo real (docs/slices/05.md §0). Este módulo sólo lo
// mantiene sincronizado con lo que la persona ve.
function mountEditor(): void {
  const textarea = document.querySelector<HTMLTextAreaElement>('textarea[name="bodyMd"]');
  const visual = document.getElementById("editor-visual");
  const toggle = document.querySelector<HTMLButtonElement>("[data-editor-toggle]");
  const insertButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-insert-block]")];
  const postId = textarea?.form?.dataset.postId;
  if (
    !(textarea instanceof HTMLTextAreaElement) ||
    !visual ||
    !(toggle instanceof HTMLButtonElement) ||
    !textarea.form ||
    !postId
  ) {
    return;
  }

  const elements: EditorElements = { textarea, visual, toggle, insertButtons };

  const editor = new Editor({
    element: visual,
    extensions: tiptapExtensions,
    content: readInitialDoc(visual),
  });

  mountToolbar(editor, insertButtons);
  setMode("visual", elements);

  const autosave = scheduleAutosave(postId, () =>
    currentMode(toggle) === "visual" ? toMarkdown(toTiptapDoc(editor.getJSON())) : textarea.value,
  );
  editor.on("update", autosave);
  textarea.addEventListener("input", autosave);

  toggle.addEventListener("click", () => {
    if (currentMode(toggle) === "visual") {
      textarea.value = toMarkdown(toTiptapDoc(editor.getJSON()));
      setMode("raw", elements);
    } else {
      editor.commands.setContent(fromMarkdown(textarea.value));
      setMode("visual", elements);
    }
  });

  textarea.form.addEventListener("submit", () => {
    if (currentMode(toggle) === "visual") {
      textarea.value = toMarkdown(toTiptapDoc(editor.getJSON()));
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountEditor);
} else {
  mountEditor();
}
