import { closeMediaPanel, openMediaPanel } from "./mediaPanel.js";

// Un campo `[data-cover-field]` por formulario (post, espacio, sitio):
// botón que abre el panel de selección en la misma página, input oculto con
// el id elegido, miniatura de vista previa.
function mountCoverField(field: HTMLElement): void {
  const button = field.querySelector<HTMLButtonElement>("[data-cover-picker]");
  const input = field.querySelector<HTMLInputElement>("[data-cover-input]");
  const preview = field.querySelector<HTMLImageElement>("[data-cover-preview]");
  const panel = field.querySelector<HTMLElement>("[data-cover-panel]");
  if (!button || !input || !panel) {
    return;
  }

  button.addEventListener("click", () => {
    if (!panel.hidden) {
      closeMediaPanel(panel);
      return;
    }
    openMediaPanel(panel, "single", (images) => {
      const image = images[0];
      if (!image) {
        return;
      }
      input.value = image.id;
      if (preview) {
        preview.src = image.thumbnail;
        preview.hidden = false;
      }
    });
  });
}

function mountAll(): void {
  for (const field of document.querySelectorAll<HTMLElement>("[data-cover-field]")) {
    mountCoverField(field);
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mountAll);
} else {
  mountAll();
}
