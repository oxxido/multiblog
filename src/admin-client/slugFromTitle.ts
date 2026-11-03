// El slug sigue al título mientras el autor no lo toque; si lo borra, vuelve
// a seguirlo. Mismo criterio que slugifyTagName, que no se puede importar
// acá porque arrastra la conexión a la base.
function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function mount(): void {
  const title = document.querySelector<HTMLInputElement>("input[name='title']");
  const slug = document.querySelector<HTMLInputElement>("input[name='slug']");
  if (!title || !slug) {
    return;
  }

  let follow = slug.value === "";
  slug.addEventListener("input", () => {
    follow = slug.value === "";
  });
  title.addEventListener("input", () => {
    if (follow) {
      slug.value = slugify(title.value);
    }
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount);
} else {
  mount();
}
