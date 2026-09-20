export interface PickedImage {
  id: string;
  // "{id}.{ext}" real en MEDIA_DIR: lo que arma /media/{path} para insertar
  // en el cuerpo (imagen suelta o gallery, T9) — filename es sólo para UI.
  path: string;
  width: number;
  height: number;
  filename: string;
}

export const MEDIA_PICKED_MESSAGE = "media-picked";

export interface MediaPickedMessage {
  type: typeof MEDIA_PICKED_MESSAGE;
  images: PickedImage[];
}

function readImage(el: HTMLElement): PickedImage {
  return {
    id: el.dataset.mediaId ?? "",
    path: el.dataset.path ?? "",
    width: Number(el.dataset.width ?? "0"),
    height: Number(el.dataset.height ?? "0"),
    filename: el.dataset.filename ?? "",
  };
}

function sendAndClose(images: PickedImage[]): void {
  const message: MediaPickedMessage = { type: MEDIA_PICKED_MESSAGE, images };
  const opener = window.opener as Window | null;
  opener?.postMessage(message, window.location.origin);
  window.close();
}

function mountSingle(items: HTMLElement[]): void {
  for (const item of items) {
    item.addEventListener("click", () => {
      sendAndClose([readImage(item)]);
    });
  }
}

function mountMulti(items: HTMLElement[], insertButton: HTMLButtonElement): void {
  function selected(): HTMLElement[] {
    return items.filter((item) => item.querySelector<HTMLInputElement>('input[type="checkbox"]')?.checked);
  }

  function updateLabel(): void {
    insertButton.textContent = `Insertar ${String(selected().length)} imágenes`;
  }

  for (const item of items) {
    item.querySelector('input[type="checkbox"]')?.addEventListener("change", updateLabel);
  }

  insertButton.addEventListener("click", () => {
    const images = selected();
    if (images.length === 0) {
      return;
    }
    sendAndClose(images.map(readImage));
  });
}

function mountPicker(): void {
  const items = [...document.querySelectorAll<HTMLElement>("[data-media-id]")];
  const mode = document.body.dataset.mode === "multi" ? "multi" : "single";

  if (mode === "single") {
    mountSingle(items);
    return;
  }

  const insertButton = document.querySelector<HTMLButtonElement>("[data-insert-selected]");
  if (insertButton) {
    mountMulti(items, insertButton);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountPicker);
} else {
  mountPicker();
}
