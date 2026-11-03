import { Editor } from "@tiptap/core";
import { tiptapExtensions } from "../markdown/tiptap/extensions.js";
import { fromMarkdown } from "../markdown/tiptap/fromMarkdown.js";
import { toMarkdown } from "../markdown/tiptap/toMarkdown.js";
import type { TiptapDoc } from "../markdown/tiptap/types.js";
import { mountAiAssist } from "./aiAssist.js";
import {
  browserStorage,
  clearDraft,
  differsFromServer,
  loadDraft,
  saveDraft,
  type DraftFields,
} from "./draftBackup.js";
import { closeMediaPanel, openMediaPanel } from "./mediaPanel.js";

type Mode = "visual" | "raw";

const AUTOSAVE_DEBOUNCE_MS = 2000;

interface EditorElements {
  textarea: HTMLTextAreaElement;
  visual: HTMLElement;
  toggle: HTMLButtonElement;
  insertButtons: HTMLButtonElement[];
  formatButtons: HTMLButtonElement[];
  mediaPanel: HTMLElement;
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

// Las dos etiquetas ("Visual"/"Markdown") son marcado fijo del botón
// (docs/slices/11.md T6, admin.css .seg-toggle); esta función sólo mueve el
// resaltado cambiando data-mode, ya no reescribe textContent.
function setMode(mode: Mode, elements: EditorElements): void {
  const isVisual = mode === "visual";
  elements.visual.hidden = !isVisual;
  elements.textarea.hidden = isVisual;
  elements.toggle.dataset.mode = mode;
  for (const button of [...elements.insertButtons, ...elements.formatButtons]) {
    button.disabled = !isVisual;
  }
  if (!isVisual) {
    closeMediaPanel(elements.mediaPanel);
  }
}

function currentMode(toggle: HTMLButtonElement): Mode {
  return toggle.dataset.mode === "raw" ? "raw" : "visual";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "error desconocido";
}

// Los avisos viven a nivel de módulo y buscan sus elementos en cada llamada:
// así también funcionan para un error que ocurre antes de que el editor
// termine de montarse.
function showError(message: string): void {
  const banner = document.querySelector<HTMLElement>("[data-editor-error]");
  const text = document.querySelector<HTMLElement>("[data-editor-error-text]");
  const status = document.querySelector<HTMLElement>("[data-save-status]");
  if (status) {
    status.textContent = "No se guardó. Mirá el aviso rojo arriba del editor.";
  }
  if (!banner || !text) {
    return;
  }
  text.textContent = message;
  banner.hidden = false;
  banner.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function clearError(): void {
  const banner = document.querySelector<HTMLElement>("[data-editor-error]");
  if (banner) {
    banner.hidden = true;
  }
}

function showNotice(message: string): void {
  const banner = document.querySelector<HTMLElement>("[data-editor-notice]");
  const text = document.querySelector<HTMLElement>("[data-editor-notice-text]");
  if (!banner || !text) {
    return;
  }
  text.textContent = message;
  banner.hidden = false;
}

function setSaveStatus(message: string): void {
  const status = document.querySelector<HTMLElement>("[data-save-status]");
  if (status) {
    status.textContent = message;
  }
}

function clockTime(date: Date = new Date()): string {
  return date.toLocaleTimeString("es", { hour: "2-digit", minute: "2-digit" });
}

// Un error de JS que nadie atrapó nunca debe pasar en silencio: se avisa, y
// el texto sigue en pantalla (y respaldado) porque nada de esto lo toca.
function reportUnexpected(message: string): void {
  showError(
    `Ocurrió un error inesperado (${message}). Tu texto sigue en pantalla: no cierres la página, copialo o probá guardar de nuevo.`,
  );
}

function installGlobalErrorHandlers(): void {
  window.addEventListener("error", (event) => {
    if (event.message.startsWith("ResizeObserver")) {
      return;
    }
    reportUnexpected(event.message || "error desconocido");
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportUnexpected(errorMessage(event.reason));
  });
}

interface AutosaveHooks {
  onSaved: (savedRevision: number) => void;
  onError: (message: string) => void;
}

// POST/:id/autosave sólo toca body_md/body_html (docs/slices/05.md §0): acá
// no hay slug, title, status ni categorías que mandar, sólo el Markdown
// vigente en el modo que esté activo.
function scheduleAutosave(
  postId: string,
  getBodyMd: () => string,
  getRevision: () => number,
  hooks: AutosaveHooks,
): () => void {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  return () => {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      void (async () => {
        try {
          const revision = getRevision();
          const response = await fetch(`/admin/posts/${postId}/autosave`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ bodyMd: getBodyMd() }),
          });
          // Con la sesión vencida el servidor redirige al login y fetch lo
          // sigue con un 200: sin este chequeo parecería que se guardó.
          if (response.redirected) {
            throw new Error("la sesión venció; volvé a entrar en otra pestaña");
          }
          if (!response.ok) {
            throw new Error(`el servidor respondió ${String(response.status)}`);
          }
          hooks.onSaved(revision);
        } catch (error) {
          hooks.onError(
            `El autoguardado falló (${errorMessage(error)}). Tu texto sigue en pantalla y respaldado en este navegador; no cierres la página sin guardar.`,
          );
        }
      })();
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

// Botón "Imagen" (S7): panel en modo único, un sólo prompt() pide el alt
// (accesibilidad) — el alt sigue siendo por uso, no por archivo (S6 §0), así
// que no se guarda en `media`.
function insertImage(editor: Editor, mediaPanel: HTMLElement): void {
  openMediaPanel(mediaPanel, "single", (images) => {
    const image = images[0];
    if (!image) {
      return;
    }
    const alt = window.prompt("Alt de la imagen (accesibilidad):", "") ?? "";
    insertBlockAtEnd(editor, {
      type: "paragraph",
      content: [{ type: "image", attrs: { src: `/media/${image.path}`, alt } }],
    });
  });
}

// Botón "Galería" (S7): ya no pide URLs por prompt(), abre el panel en
// modo múltiple. Las imágenes elegidas entran con alt: "" — decorativas por
// defecto, el autor edita el alt a mano en crudo si quiere pie de foto
// (S6 §0: alt vacío = sin figcaption).
function insertGallery(editor: Editor, mediaPanel: HTMLElement): void {
  openMediaPanel(mediaPanel, "multi", (images) => {
    if (images.length === 0) {
      return;
    }
    const galleryImages = images.map((image) => ({ src: `/media/${image.path}`, alt: "" }));
    insertBlockAtEnd(editor, { type: "gallery", attrs: { images: galleryImages, cols: 2 } });
  });
}

function insertYoutube(editor: Editor): void {
  const raw = window.prompt("Id o URL de YouTube:", "");
  if (!raw || raw.trim().length === 0) {
    return;
  }
  const videoId = extractYoutubeId(raw);
  insertBlockAtEnd(editor, { type: "youtube", attrs: { videoId, title: "Video de YouTube" } });
}

// Sólo los formatos con ida y vuelta a Markdown (toMarkdown.ts): negrita,
// cursiva, código, enlace, títulos 2 y 3 (el 1 es el título del post),
// listas, cita y bloque de código.
type FormatKind =
  | "bold"
  | "italic"
  | "code"
  | "link"
  | "h2"
  | "h3"
  | "bulletList"
  | "orderedList"
  | "blockquote"
  | "codeBlock";

function isFormatKind(value: string | undefined): value is FormatKind {
  return (
    value === "bold" ||
    value === "italic" ||
    value === "code" ||
    value === "link" ||
    value === "h2" ||
    value === "h3" ||
    value === "bulletList" ||
    value === "orderedList" ||
    value === "blockquote" ||
    value === "codeBlock"
  );
}

function toggleLink(editor: Editor): void {
  const previous = (editor.getAttributes("link").href as string | undefined) ?? "";
  const url = window.prompt("URL del enlace (vacío para quitarlo):", previous);
  if (url === null) {
    return;
  }
  const chain = editor.chain().focus().extendMarkRange("link");
  if (url.trim().length === 0) {
    chain.unsetLink().run();
    return;
  }
  chain.setLink({ href: url.trim() }).run();
}

function applyFormat(editor: Editor, kind: FormatKind): void {
  const chain = editor.chain().focus();
  switch (kind) {
    case "bold":
      chain.toggleBold().run();
      return;
    case "italic":
      chain.toggleItalic().run();
      return;
    case "code":
      chain.toggleCode().run();
      return;
    case "link":
      toggleLink(editor);
      return;
    case "h2":
      chain.toggleHeading({ level: 2 }).run();
      return;
    case "h3":
      chain.toggleHeading({ level: 3 }).run();
      return;
    case "bulletList":
      chain.toggleBulletList().run();
      return;
    case "orderedList":
      chain.toggleOrderedList().run();
      return;
    case "blockquote":
      chain.toggleBlockquote().run();
      return;
    case "codeBlock":
      chain.toggleCodeBlock().run();
      return;
  }
}

function isFormatActive(editor: Editor, kind: FormatKind): boolean {
  switch (kind) {
    case "h2":
      return editor.isActive("heading", { level: 2 });
    case "h3":
      return editor.isActive("heading", { level: 3 });
    default:
      return editor.isActive(kind);
  }
}

function mountFormatToolbar(editor: Editor, buttons: HTMLButtonElement[]): void {
  const kinds = new Map<HTMLButtonElement, FormatKind>();
  for (const button of buttons) {
    const kind = button.dataset.format;
    if (isFormatKind(kind)) {
      kinds.set(button, kind);
    }
  }

  // mousedown con preventDefault: el botón no le quita el foco (ni la
  // selección) al editor antes de que corra el comando.
  for (const [button, kind] of kinds) {
    button.addEventListener("mousedown", (event) => {
      event.preventDefault();
    });
    button.addEventListener("click", () => {
      applyFormat(editor, kind);
    });
  }

  const refresh = (): void => {
    for (const [button, kind] of kinds) {
      button.classList.toggle("is-active", isFormatActive(editor, kind));
    }
  };
  editor.on("transaction", refresh);
  refresh();
}

function mountToolbar(editor: Editor, buttons: HTMLButtonElement[], mediaPanel: HTMLElement): void {
  const inserters: Record<string, (editor: Editor, mediaPanel: HTMLElement) => void> = {
    image: insertImage,
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
      insert(editor, mediaPanel);
    });
  }
}

const SAVED_FLAG_PREFIX = "multiblog:saved:";
const CAPTURE_DEBOUNCE_MS = 400;

function markSavedFlag(postId: string): void {
  try {
    window.sessionStorage.setItem(`${SAVED_FLAG_PREFIX}${postId}`, "1");
  } catch {
    // Sin sessionStorage sólo se pierde el cartel "Guardado" tras la recarga.
  }
}

function consumeSavedFlag(postId: string): boolean {
  try {
    const key = `${SAVED_FLAG_PREFIX}${postId}`;
    const saved = window.sessionStorage.getItem(key) !== null;
    window.sessionStorage.removeItem(key);
    return saved;
  } catch {
    return false;
  }
}

function formParams(form: HTMLFormElement): URLSearchParams {
  const params = new URLSearchParams();
  for (const [name, value] of new FormData(form)) {
    if (typeof value === "string") {
      params.append(name, value);
    }
  }
  return params;
}

async function describeFailure(response: Response): Promise<string> {
  const text = (await response.text()).trim();
  return text.length === 0 || text.startsWith("<") ? "sin detalle" : text.slice(0, 300);
}

// Si el editor visual no arranca, el campo Markdown pasa a ser el editor:
// el formulario nativo lo envía igual y la persona puede seguir escribiendo.
function revealMarkdownFallback(): void {
  const textarea = document.querySelector<HTMLTextAreaElement>('textarea[name="bodyMd"]');
  const visual = document.getElementById("editor-visual");
  if (textarea) {
    textarea.hidden = false;
  }
  if (visual) {
    visual.hidden = true;
  }
}

// Alternar no cambia qué envía el <form>: el textarea con name="bodyMd"
// sigue siendo el campo real (docs/slices/05.md §0). Este módulo lo mantiene
// sincronizado con lo que la persona ve y respalda el borrador en el
// navegador: lo escrito nunca depende de que el servidor o este script
// respondan bien.
function mountEditor(): void {
  const textarea = document.querySelector<HTMLTextAreaElement>('textarea[name="bodyMd"]');
  const visual = document.getElementById("editor-visual");
  const toggle = document.querySelector<HTMLButtonElement>("[data-editor-toggle]");
  const insertButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-insert-block]")];
  const formatButtons = [...document.querySelectorAll<HTMLButtonElement>("[data-format]")];
  const mediaPanel = document.querySelector<HTMLElement>("[data-editor-media-panel]");
  const form = textarea?.form;
  const postId = form?.dataset.postId;
  const titleInput = form?.querySelector<HTMLInputElement>('input[name="title"]');
  const excerptInput = form?.querySelector<HTMLTextAreaElement>('textarea[name="excerpt"]');
  if (
    !(textarea instanceof HTMLTextAreaElement) ||
    !visual ||
    !mediaPanel ||
    !(toggle instanceof HTMLButtonElement) ||
    !form ||
    !postId ||
    !titleInput ||
    !excerptInput
  ) {
    return;
  }

  const saveButton = document.querySelector<HTMLButtonElement>("[data-save-button]");
  const elements: EditorElements = { textarea, visual, toggle, insertButtons, formatButtons, mediaPanel };
  const storage = browserStorage();
  const serverFields: DraftFields = { title: titleInput.value, excerpt: excerptInput.value, bodyMd: textarea.value };

  const editor = new Editor({
    element: visual,
    extensions: tiptapExtensions,
    content: readInitialDoc(visual),
  });

  mountToolbar(editor, insertButtons, mediaPanel);
  mountFormatToolbar(editor, formatButtons);
  setMode("visual", elements);

  const readMarkdown = (): string =>
    currentMode(toggle) === "visual" ? toMarkdown(toTiptapDoc(editor.getJSON())) : textarea.value;

  let revision = 0;
  let bodyDirty = false;
  let metaDirty = false;
  let saving = false;
  let restorePending = false;
  let serializationFailed = false;
  let autosaveFailed = false;

  // Mantiene el textarea al día para que ni el envío nativo ni un fallo del
  // script puedan mandar un texto viejo. Si no se puede serializar, avisa y
  // no toca nada: lo escrito queda en el editor.
  const syncTextarea = (context: string): string | null => {
    try {
      const bodyMd = readMarkdown();
      if (textarea.value !== bodyMd) {
        textarea.value = bodyMd;
      }
      if (serializationFailed) {
        serializationFailed = false;
        clearError();
      }
      return bodyMd;
    } catch (error) {
      serializationFailed = true;
      showError(`${context}: ${errorMessage(error)}. Tu texto sigue en el editor; copialo antes de cerrar la página.`);
      return null;
    }
  };

  // Mientras haya un respaldo sin resolver no se pisa: es justamente lo que
  // la persona todavía no recuperó.
  const persistDraft = (): void => {
    const bodyMd = syncTextarea("No se pudo pasar el texto a Markdown para respaldarlo");
    if (bodyMd === null || !storage || restorePending) {
      return;
    }
    saveDraft(storage, postId, { title: titleInput.value, excerpt: excerptInput.value, bodyMd });
  };

  let captureTimeout: ReturnType<typeof setTimeout> | undefined;
  const scheduleCapture = (): void => {
    if (captureTimeout !== undefined) {
      clearTimeout(captureTimeout);
    }
    captureTimeout = setTimeout(persistDraft, CAPTURE_DEBOUNCE_MS);
  };

  const autosave = scheduleAutosave(postId, readMarkdown, () => revision, {
    onSaved: (savedRevision) => {
      if (savedRevision === revision) {
        bodyDirty = false;
      }
      setSaveStatus(`Autoguardado a las ${clockTime()}`);
      if (autosaveFailed) {
        autosaveFailed = false;
        clearError();
      }
    },
    onError: (message) => {
      autosaveFailed = true;
      showError(message);
    },
  });

  const markChanged = (kind: "body" | "meta"): void => {
    revision += 1;
    if (kind === "body") {
      bodyDirty = true;
      autosave();
    } else {
      metaDirty = true;
    }
    scheduleCapture();
  };

  editor.on("update", () => {
    markChanged("body");
  });

  // Los campos de la barra lateral (etiquetas, categorías, portada) están
  // fuera del <form> y asociados con form="post-form": sus eventos no pasan
  // por el formulario, por eso se escucha en el documento.
  const onFieldEvent = (event: Event): void => {
    const target = event.target;
    if (
      !(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) ||
      target.form !== form ||
      target.name === ""
    ) {
      return;
    }
    markChanged(target === textarea ? "body" : "meta");
  };
  document.addEventListener("input", onFieldEvent);
  document.addEventListener("change", onFieldEvent);

  mountAiAssist({
    getBodyMd: readMarkdown,
    setBodyMd: (markdown) => {
      if (currentMode(toggle) === "visual") {
        editor.commands.setContent(fromMarkdown(markdown), { emitUpdate: true });
      } else {
        textarea.value = markdown;
        markChanged("body");
      }
    },
  });

  toggle.addEventListener("click", () => {
    if (currentMode(toggle) === "visual") {
      if (syncTextarea("No se pudo pasar el texto a Markdown") === null) {
        return;
      }
      clearError();
      setMode("raw", elements);
    } else {
      try {
        editor.commands.setContent(fromMarkdown(textarea.value));
      } catch (error) {
        showError(`El editor visual no puede abrir este Markdown: ${errorMessage(error)}`);
        return;
      }
      clearError();
      setMode("visual", elements);
    }
  });

  const setBusy = (busy: boolean): void => {
    saving = busy;
    if (saveButton) {
      saveButton.disabled = busy;
      saveButton.textContent = busy ? "Guardando…" : "Guardar";
    }
    if (busy) {
      setSaveStatus("Guardando…");
    }
  };

  // El guardado va por fetch y no por la navegación nativa del formulario:
  // si el servidor rechaza el envío o la red falla, la página no cambia y el
  // texto sigue donde estaba, con el motivo a la vista. Devuelve la URL a la
  // que ir cuando el servidor confirmó el guardado, o null si falló (el aviso
  // ya está en pantalla).
  const persistForm = async (): Promise<string | null> => {
    if (!form.reportValidity()) {
      return null;
    }
    const bodyMd = syncTextarea("No se guardó");
    if (bodyMd === null) {
      return null;
    }
    persistDraft();
    clearError();
    try {
      const response = await fetch(form.action, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: formParams(form),
      });
      if (response.ok && new URL(response.url).pathname === `/admin/posts/${postId}`) {
        if (storage && !restorePending) {
          clearDraft(storage, postId);
        }
        bodyDirty = false;
        metaDirty = false;
        return response.url;
      }
      if (response.ok) {
        showError(
          "NO SE GUARDÓ. El servidor no confirmó el guardado (la sesión pudo haber vencido). Tu texto sigue acá y respaldado en este navegador: volvé a entrar en otra pestaña y guardá de nuevo.",
        );
        return null;
      }
      showError(
        `NO SE GUARDÓ. El servidor rechazó el guardado (${String(response.status)}): ${await describeFailure(response)}. Tu texto sigue acá; no se perdió nada.`,
      );
    } catch (error) {
      showError(`NO SE GUARDÓ. No se pudo contactar al servidor (${errorMessage(error)}). Tu texto sigue acá y respaldado en este navegador.`);
    }
    return null;
  };

  const saveForm = async (): Promise<void> => {
    if (saving) {
      return;
    }
    setBusy(true);
    const url = await persistForm();
    if (url === null) {
      setBusy(false);
      return;
    }
    markSavedFlag(postId);
    window.location.assign(url);
  };

  // Publicar, programar, despublicar y traducir son formularios aparte: si
  // navegaran directo, lo escrito y no guardado se perdería (y la traducción
  // saldría del texto viejo). Primero se guarda, y recién con el guardado
  // confirmado se envía la acción; mientras tanto el botón queda deshabilitado
  // y dice qué está pasando.
  const resetters: Array<() => void> = [];
  for (const actionForm of document.querySelectorAll<HTMLFormElement>("[data-action-form]")) {
    const button = actionForm.querySelector<HTMLButtonElement>('button[type="submit"]');
    const hint = actionForm.querySelector<HTMLElement>("[data-busy-hint]");
    if (!button) {
      continue;
    }
    const idleLabel = button.textContent;
    const reset = (): void => {
      button.disabled = false;
      button.textContent = idleLabel;
      if (hint) {
        hint.hidden = true;
      }
    };
    resetters.push(reset);
    actionForm.addEventListener("submit", (event) => {
      event.preventDefault();
      if (saving) {
        return;
      }
      saving = true;
      button.disabled = true;
      button.textContent = actionForm.dataset.busyLabel ?? "Procesando…";
      if (hint) {
        hint.hidden = false;
      }
      void (async () => {
        const url = await persistForm();
        if (url === null) {
          saving = false;
          reset();
          return;
        }
        actionForm.submit();
      })();
    });
  }
  // Al volver con "atrás" el navegador puede restaurar la página con los
  // botones todavía deshabilitados.
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      saving = false;
      setBusy(false);
      setSaveStatus("");
      for (const reset of resetters) {
        reset();
      }
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void saveForm();
  });

  const flushIfDirty = (): void => {
    if (bodyDirty || metaDirty) {
      persistDraft();
    }
  };
  window.addEventListener("beforeunload", (event) => {
    if (!bodyDirty && !metaDirty) {
      return;
    }
    flushIfDirty();
    event.preventDefault();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      flushIfDirty();
    }
  });

  const mountRestoreBar = (): void => {
    const draft = storage ? loadDraft(storage, postId) : null;
    const bar = document.querySelector<HTMLElement>("[data-editor-restore]");
    const text = document.querySelector<HTMLElement>("[data-editor-restore-text]");
    const apply = document.querySelector<HTMLButtonElement>("[data-restore-apply]");
    const discard = document.querySelector<HTMLButtonElement>("[data-restore-discard]");
    if (!storage || !draft || !bar || !text || !apply || !discard || !differsFromServer(draft, serverFields)) {
      return;
    }

    restorePending = true;
    text.textContent = `Hay una versión de este post respaldada en este navegador (${clockTime(new Date(draft.savedAt))}) que no coincide con la guardada.`;
    bar.hidden = false;

    apply.addEventListener("click", () => {
      titleInput.value = draft.title;
      excerptInput.value = draft.excerpt;
      textarea.value = draft.bodyMd;
      if (currentMode(toggle) === "visual") {
        try {
          editor.commands.setContent(fromMarkdown(draft.bodyMd));
        } catch (error) {
          setMode("raw", elements);
          showError(`El editor visual no pudo abrir el respaldo (${errorMessage(error)}); está en el campo Markdown.`);
        }
      }
      restorePending = false;
      bar.hidden = true;
      markChanged("body");
      markChanged("meta");
    });
    discard.addEventListener("click", () => {
      clearDraft(storage, postId);
      restorePending = false;
      bar.hidden = true;
    });
  };

  mountRestoreBar();
  if (consumeSavedFlag(postId)) {
    showNotice(`✓ Post guardado correctamente a las ${clockTime()}.`);
    setSaveStatus(`Guardado a las ${clockTime()}`);
    setTimeout(() => {
      document.querySelector<HTMLElement>("[data-editor-notice]")?.setAttribute("hidden", "");
    }, 10000);
  }
}

function mountEditorSafely(): void {
  try {
    mountEditor();
  } catch (error) {
    revealMarkdownFallback();
    showError(
      `El editor visual no pudo iniciar (${errorMessage(error)}). Podés seguir escribiendo en el campo Markdown: se guarda igual.`,
    );
  }
}

installGlobalErrorHandlers();
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountEditorSafely);
} else {
  mountEditorSafely();
}
