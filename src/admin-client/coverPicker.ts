import { buildThumbnail } from "../modules/media/derivatives.js";
import { openMediaPicker } from "./mediaPicker.js";

// Un campo `[data-cover-field]` por formulario (post, espacio, sitio, T8):
// botón que abre el picker en modo único, input oculto con el id elegido,
// miniatura de vista previa.
function mountCoverField(field: HTMLElement): void {
  const button = field.querySelector<HTMLButtonElement>("[data-cover-picker]");
  const input = field.querySelector<HTMLInputElement>("[data-cover-input]");
  const preview = field.querySelector<HTMLImageElement>("[data-cover-preview]");
  if (!button || !input) {
    return;
  }

  button.addEventListener("click", () => {
    openMediaPicker("single", (images) => {
      const image = images[0];
      if (!image) {
        return;
      }
      input.value = image.id;
      if (preview) {
        preview.src = buildThumbnail(image.id, image.width);
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
