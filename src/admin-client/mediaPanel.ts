export interface PickedImage {
  id: string;
  // "{id}.{ext}" real en MEDIA_DIR: lo que arma /media/{path} para insertar
  // en el cuerpo (imagen suelta o gallery) — filename es sólo para UI.
  path: string;
  width: number;
  height: number;
  filename: string;
  thumbnail: string;
}

type PanelMode = "single" | "multi";

const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp";

function isPickedImage(value: unknown): value is PickedImage {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  return (
    "id" in value &&
    typeof value.id === "string" &&
    "path" in value &&
    typeof value.path === "string" &&
    "width" in value &&
    typeof value.width === "number" &&
    "height" in value &&
    typeof value.height === "number" &&
    "filename" in value &&
    typeof value.filename === "string" &&
    "thumbnail" in value &&
    typeof value.thumbnail === "string"
  );
}

function isPickedImageList(value: unknown): value is PickedImage[] {
  return Array.isArray(value) && value.every(isPickedImage);
}

function create<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (text !== undefined) {
    element.textContent = text;
  }
  return element;
}

function createCorners(): HTMLElement[] {
  return ["tl", "tr", "bl", "br"].map((position) => create("i", `corner ${position}`));
}

function createThumb(image: PickedImage): HTMLElement {
  const thumb = create("div", "thumb");
  const img = create("img");
  img.src = image.thumbnail;
  img.alt = "";
  thumb.append(img);
  return thumb;
}

export function closeMediaPanel(host: HTMLElement): void {
  host.hidden = true;
  host.replaceChildren();
}

// Panel de selección dentro de la misma página (reemplaza la ventana propia
// de S7, D20): grilla de la biblioteca más un botón para subir. En modo único
// subir una imagen la elige de inmediato; en modo múltiple la deja marcada.
export function openMediaPanel(host: HTMLElement, mode: PanelMode, onPicked: (images: PickedImage[]) => void): void {
  const heading = create("h3", "media-panel__title", mode === "multi" ? "Elegir imágenes" : "Elegir una imagen");

  const uploadInput = create("input");
  uploadInput.type = "file";
  uploadInput.accept = ACCEPTED_TYPES;
  uploadInput.hidden = true;
  const uploadButton = create("button", "btn btn-secondary", "Subir imagen");
  uploadButton.type = "button";

  const closeButton = create("button", "btn-ghost", "Cerrar");
  closeButton.type = "button";

  const insertButton = create("button", "btn btn-primary", "Insertar 0 imágenes");
  insertButton.type = "button";
  insertButton.hidden = mode !== "multi";

  const status = create("p", "media-panel__status");
  status.setAttribute("role", "status");

  const grid = create("div", "picker-grid");

  const toolbar = create("div", "media-panel__toolbar");
  toolbar.append(heading, uploadButton, uploadInput, insertButton, closeButton);

  const checked = new Map<string, { image: PickedImage; checkbox: HTMLInputElement }>();

  function updateInsertLabel(): void {
    const count = [...checked.values()].filter((entry) => entry.checkbox.checked).length;
    insertButton.textContent = `Insertar ${String(count)} imágenes`;
    insertButton.disabled = count === 0;
  }

  function pick(images: PickedImage[]): void {
    closeMediaPanel(host);
    onPicked(images);
  }

  function renderItem(image: PickedImage): HTMLElement {
    if (mode === "single") {
      const item = create("button", "picker-item blueprint");
      item.type = "button";
      item.append(...createCorners(), createThumb(image), create("div", "filename", image.filename));
      item.addEventListener("click", () => {
        pick([image]);
      });
      return item;
    }

    const item = create("label", "picker-item blueprint");
    const checkbox = create("input");
    checkbox.type = "checkbox";
    checkbox.addEventListener("change", updateInsertLabel);
    checked.set(image.id, { image, checkbox });
    item.append(...createCorners(), checkbox, createThumb(image), create("div", "filename", image.filename));
    return item;
  }

  async function loadItems(): Promise<void> {
    status.textContent = "Cargando…";
    const response = await fetch("/admin/media/items");
    const data: unknown = await response.json();
    if (!response.ok || !isPickedImageList(data)) {
      status.textContent = "No se pudieron cargar las imágenes";
      return;
    }
    status.textContent = data.length === 0 ? "Todavía no hay imágenes. Subí la primera." : "";
    grid.replaceChildren(...data.map(renderItem));
  }

  async function upload(file: File): Promise<void> {
    status.textContent = `Subiendo ${file.name}…`;
    uploadButton.disabled = true;
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch("/admin/media", {
        method: "POST",
        headers: { accept: "application/json" },
        body,
      });
      if (!response.ok) {
        status.textContent = await response.text();
        return;
      }
      const data: unknown = await response.json();
      if (!isPickedImage(data)) {
        status.textContent = "Respuesta inesperada del servidor";
        return;
      }
      if (mode === "single") {
        pick([data]);
        return;
      }
      status.textContent = "";
      grid.prepend(renderItem(data));
      const entry = checked.get(data.id);
      if (entry) {
        entry.checkbox.checked = true;
      }
      updateInsertLabel();
    } finally {
      uploadButton.disabled = false;
      uploadInput.value = "";
    }
  }

  uploadButton.addEventListener("click", () => {
    uploadInput.click();
  });
  uploadInput.addEventListener("change", () => {
    const file = uploadInput.files?.[0];
    if (file) {
      void upload(file);
    }
  });
  closeButton.addEventListener("click", () => {
    closeMediaPanel(host);
  });
  insertButton.addEventListener("click", () => {
    const images = [...checked.values()].filter((entry) => entry.checkbox.checked).map((entry) => entry.image);
    if (images.length > 0) {
      pick(images);
    }
  });

  host.replaceChildren(toolbar, status, grid);
  host.hidden = false;
  host.scrollIntoView({ block: "nearest", behavior: "smooth" });
  updateInsertLabel();
  void loadItems().catch(() => {
    status.textContent = "No se pudieron cargar las imágenes";
  });
}
