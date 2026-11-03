import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { Eta } from "eta";

const eta = new Eta({ views: path.resolve("src/views") });

// El campo de portada del post vive en la barra lateral, fuera del <form>, y
// se asocia con form="post-form". Si el atributo sale escapado el navegador
// lo ignora, coverMediaId no viaja y cada guardado borra la portada.
test("el input de portada se asocia al formulario con un atributo form real", () => {
  const html = eta.render("partials/cover-field", { cover: null, value: "abc", formId: "post-form" });
  assert.match(html, /<input[^>]*\sform="post-form"/);
  assert.doesNotMatch(html, /&quot;/);
});

test("sin formId el input no lleva atributo form", () => {
  const html = eta.render("partials/cover-field", { cover: null, value: null });
  assert.doesNotMatch(html, /\sform=/);
});
