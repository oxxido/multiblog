import { z } from "zod";

type Mode = "improve" | "review";

export interface AiAssistHost {
  getBodyMd: () => string;
  setBodyMd: (markdown: string) => void;
}

const TITLES: Record<Mode, string> = { improve: "Mejorar post", review: "Revisar este texto" };
const RUN_LABELS: Record<Mode, string> = { improve: "Mejorar", review: "Revisar" };

const responseSchema = z.object({ bodyMd: z.string().optional(), error: z.string().optional() });

function query<T extends HTMLElement>(root: HTMLElement, selector: string, type: new () => T): T {
  const element = root.querySelector(selector);
  if (!(element instanceof type)) {
    throw new Error(`Falta ${selector} en el panel de IA`);
  }
  return element;
}

export function mountAiAssist(host: AiAssistHost): void {
  const root = document.querySelector<HTMLElement>("[data-ai-assist]");
  if (!root) {
    return;
  }

  const panel = query(root, "[data-ai-panel]", HTMLElement);
  const title = query(root, "[data-ai-title]", HTMLElement);
  const promptField = query(root, "[data-ai-prompt]", HTMLTextAreaElement);
  const runButton = query(root, "[data-ai-run]", HTMLButtonElement);
  const status = query(root, "[data-ai-status]", HTMLElement);
  const result = query(root, "[data-ai-result]", HTMLElement);
  const output = query(root, "[data-ai-output]", HTMLTextAreaElement);
  const replaceButton = query(root, "[data-ai-replace]", HTMLButtonElement);
  const undoButton = query(root, "[data-ai-undo]", HTMLButtonElement);

  // Cada modo conserva el prompt que el autor dejó editado, para que alternar
  // entre "mejorar" y "revisar" no le haga perder el suyo.
  const prompts: Record<Mode, string> = {
    improve: root.dataset.promptImprove ?? "",
    review: root.dataset.promptReview ?? "",
  };
  let mode: Mode | null = null;
  let previousBodyMd: string | null = null;

  function setStatus(message: string, busy = false): void {
    status.textContent = message;
    status.classList.toggle("is-busy", busy);
  }

  function resetResult(): void {
    result.hidden = true;
    output.value = "";
    undoButton.hidden = true;
    previousBodyMd = null;
    setStatus("");
  }

  function open(next: Mode): void {
    if (mode !== null) {
      prompts[mode] = promptField.value;
    }
    if (mode !== next) {
      resetResult();
    }
    mode = next;
    title.textContent = TITLES[next];
    runButton.textContent = RUN_LABELS[next];
    promptField.value = prompts[next];
    panel.hidden = false;
    promptField.focus();
  }

  for (const button of root.querySelectorAll<HTMLButtonElement>("[data-ai-open]")) {
    button.addEventListener("click", () => {
      const requested = button.dataset.aiOpen;
      if (requested === "improve" || requested === "review") {
        open(requested);
      }
    });
  }

  query(root, "[data-ai-close]", HTMLButtonElement).addEventListener("click", () => {
    if (mode !== null) {
      prompts[mode] = promptField.value;
    }
    panel.hidden = true;
  });

  runButton.addEventListener("click", () => {
    void run();
  });

  async function run(): Promise<void> {
    runButton.disabled = true;
    replaceButton.disabled = true;
    undoButton.hidden = true;
    setStatus("Trabajando… puede tardar un rato en posts largos", true);
    try {
      const response = await fetch("/admin/posts/assist", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: promptField.value, bodyMd: host.getBodyMd() }),
      });
      const payload = responseSchema.parse(await response.json());
      if (!response.ok || payload.bodyMd === undefined) {
        throw new Error(payload.error ?? "No se pudo procesar el texto");
      }
      output.value = payload.bodyMd;
      result.hidden = false;
      setStatus("Listo. Revisá el resultado antes de reemplazar.");
    } catch (error) {
      result.hidden = true;
      setStatus(error instanceof Error ? error.message : "No se pudo procesar el texto");
    } finally {
      runButton.disabled = false;
      replaceButton.disabled = false;
    }
  }

  replaceButton.addEventListener("click", () => {
    previousBodyMd = host.getBodyMd();
    host.setBodyMd(output.value);
    undoButton.hidden = false;
    setStatus("Texto reemplazado.");
  });

  undoButton.addEventListener("click", () => {
    if (previousBodyMd === null) {
      return;
    }
    host.setBodyMd(previousBodyMd);
    previousBodyMd = null;
    undoButton.hidden = true;
    setStatus("Reemplazo deshecho.");
  });
}
