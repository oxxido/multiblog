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

// Alternar no cambia qué envía el <form>: el textarea con name="bodyMd"
// sigue siendo el campo real (docs/slices/05.md §0). Este módulo sólo lo
// mantiene sincronizado con lo que la persona ve.
function mountEditor(): void {
  const textarea = document.querySelector<HTMLTextAreaElement>('textarea[name="bodyMd"]');
  const visual = document.getElementById("editor-visual");
  const toggle = document.querySelector<HTMLButtonElement>("[data-editor-toggle]");
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

  const elements: EditorElements = { textarea, visual, toggle };

  const editor = new Editor({
    element: visual,
    extensions: tiptapExtensions,
    content: readInitialDoc(visual),
  });

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
