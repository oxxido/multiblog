import { MEDIA_PICKED_MESSAGE, type MediaPickedMessage, type PickedImage } from "./picker.js";

export type { PickedImage };

// Botón "Imagen"/"Galería" del editor (T9) y el selector de portada (T8)
// comparten este helper: abren /admin/media/picker con window.open() y
// esperan el postMessage que picker.ts (T4) manda al elegir
// (docs/slices/07.md §0).
export function openMediaPicker(mode: "single" | "multi", onPicked: (images: PickedImage[]) => void): void {
  const popup = window.open(`/admin/media/picker?mode=${mode}`, "media-picker", "width=760,height=640");
  if (!popup) {
    return;
  }

  function handleMessage(event: MessageEvent): void {
    if (event.source !== popup || event.origin !== window.location.origin) {
      return;
    }
    const data = event.data as MediaPickedMessage | undefined;
    if (data?.type !== MEDIA_PICKED_MESSAGE) {
      return;
    }
    window.removeEventListener("message", handleMessage);
    onPicked(data.images);
  }

  window.addEventListener("message", handleMessage);
}
