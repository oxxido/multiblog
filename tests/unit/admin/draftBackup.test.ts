import { test } from "node:test";
import assert from "node:assert/strict";
import { clearDraft, differsFromServer, loadDraft, saveDraft } from "../../../src/admin-client/draftBackup.js";

function memoryStorage(): Pick<Storage, "getItem" | "setItem" | "removeItem"> {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

const fields = { title: "Título", excerpt: "Resumen", bodyMd: "# Hola\n\nTexto largo." };

test("un borrador respaldado se recupera igual", () => {
  const storage = memoryStorage();
  assert.equal(saveDraft(storage, "post-1", fields, 1234), true);
  assert.deepEqual(loadDraft(storage, "post-1"), { ...fields, savedAt: 1234 });
});

test("el respaldo de un post no se mezcla con el de otro", () => {
  const storage = memoryStorage();
  saveDraft(storage, "post-1", fields);
  assert.equal(loadDraft(storage, "post-2"), null);
});

test("limpiar el respaldo lo borra", () => {
  const storage = memoryStorage();
  saveDraft(storage, "post-1", fields);
  clearDraft(storage, "post-1");
  assert.equal(loadDraft(storage, "post-1"), null);
});

test("un respaldo corrupto se ignora en vez de romper la carga", () => {
  const storage = memoryStorage();
  storage.setItem("multiblog:draft:post-1", "{no es json");
  assert.equal(loadDraft(storage, "post-1"), null);
  storage.setItem("multiblog:draft:post-1", JSON.stringify({ title: 1 }));
  assert.equal(loadDraft(storage, "post-1"), null);
});

test("si el almacenamiento falla (cuota llena, modo privado) guardar no tira", () => {
  const failing = {
    getItem: () => {
      throw new Error("bloqueado");
    },
    setItem: () => {
      throw new Error("cuota");
    },
    removeItem: () => {
      throw new Error("bloqueado");
    },
  };
  assert.equal(saveDraft(failing, "post-1", fields), false);
  assert.equal(loadDraft(failing, "post-1"), null);
  assert.doesNotThrow(() => {
    clearDraft(failing, "post-1");
  });
});

test("differsFromServer detecta cambios en cualquier campo", () => {
  assert.equal(differsFromServer(fields, fields), false);
  assert.equal(differsFromServer({ ...fields, title: "Otro" }, fields), true);
  assert.equal(differsFromServer({ ...fields, excerpt: "" }, fields), true);
  assert.equal(differsFromServer({ ...fields, bodyMd: "# Hola" }, fields), true);
});
