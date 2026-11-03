export interface DraftFields {
  title: string;
  excerpt: string;
  bodyMd: string;
}

export interface StoredDraft extends DraftFields {
  savedAt: number;
}

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const KEY_PREFIX = "multiblog:draft:";

function keyFor(postId: string): string {
  return `${KEY_PREFIX}${postId}`;
}

// El acceso a localStorage puede tirar (modo privado, datos bloqueados): el
// respaldo es un seguro extra y nunca debe romper el guardado de verdad.
export function browserStorage(): DraftStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isStoredDraft(value: unknown): value is StoredDraft {
  return (
    typeof value === "object" &&
    value !== null &&
    "title" in value &&
    typeof value.title === "string" &&
    "excerpt" in value &&
    typeof value.excerpt === "string" &&
    "bodyMd" in value &&
    typeof value.bodyMd === "string" &&
    "savedAt" in value &&
    typeof value.savedAt === "number"
  );
}

export function saveDraft(storage: DraftStorage, postId: string, fields: DraftFields, now: number = Date.now()): boolean {
  try {
    const draft: StoredDraft = { ...fields, savedAt: now };
    storage.setItem(keyFor(postId), JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function loadDraft(storage: DraftStorage, postId: string): StoredDraft | null {
  try {
    const raw = storage.getItem(keyFor(postId));
    if (raw === null) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    return isStoredDraft(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function clearDraft(storage: DraftStorage, postId: string): void {
  try {
    storage.removeItem(keyFor(postId));
  } catch {
    // Sin acceso al almacenamiento no hay nada que limpiar.
  }
}

export function differsFromServer(draft: DraftFields, server: DraftFields): boolean {
  return draft.title !== server.title || draft.excerpt !== server.excerpt || draft.bodyMd !== server.bodyMd;
}
