# Divermente — especificación de diseño

Multiblog: un sitio central (`divermente.com`) y un espacio por subdominio (`nutricion.`, `ideas.`, `ai.`). Dos productos visuales: el **shell central**, que presenta los espacios, y el **shell de espacio**, que es un blog completo con su propio acento.

Referencia visual: `Divermente.dc.html` (tres pantallas aprobadas, lado a lado). Sistema base: **Industry** — `_ds/industry-77f3df99-774f-4fb9-a29c-35ebe5517005/styles.css`.

---

## 1. Fundamentos

### Color

Todo sale de los tokens de Industry salvo el acento por espacio.

| Rol | Valor | Uso |
| --- | --- | --- |
| Fondo papel | `#f2f2f3` (`--color-bg`) | fondo de todas las páginas |
| Tinta | `#1d1f20` (`--color-text`) | texto |
| Fondo del lienzo | `#e4e4e6` | sólo fuera de la página (canvas de diseño) |
| Regla fuerte | `rgba(29,31,32,0.16)` | bordes de sección, cabecera, pie |
| Regla débil | `rgba(29,31,32,0.10–0.12)` | separadores entre items de lista |

**Acento por espacio.** Cada espacio define un color; toda la cromía del espacio deriva de él con tres variables CSS aplicadas en la raíz del shell:

```css
--sp:       oklch(0.55 0.075 155);                      /* base del espacio */
--sp-deep:  color-mix(in oklab, var(--sp) 72%, #101110); /* texto sobre papel, enlaces */
--sp-line:  color-mix(in oklab, var(--sp) 32%, #f2f2f3); /* reglas teñidas */
```

Acentos definidos:

| Espacio | `--sp` |
| --- | --- |
| Nutrición | `oklch(0.55 0.075 155)` (verde) |
| Ideas | `#5980a6` (el acero del sistema) |
| IA | `oklch(0.55 0.075 310)` (violeta) |

Regla de contraste: `--sp` sólo para superficies, filetes y elementos gráficos. Cualquier texto sobre papel usa `--sp-deep`. Nunca texto en `--sp` a tamaño de párrafo.

Al dar de alta un espacio nuevo basta con un valor de `--sp`: canto, filete, numeración, reglas, tags, enlaces y callout se repintan solos.

### Tipografía

| Rol | Familia | Notas |
| --- | --- | --- |
| Títulos, cabeceras, UI | Barlow Condensed (`--font-heading`) | del sistema |
| Microcopy, metadatos, tags | Barlow (`--font-body`) | del sistema |
| Cuerpo de lectura | **Literata** | sólo en cuerpo de post, entradilla y extractos de lista |

Escala usada:

| Elemento | Tamaño / interlínea |
| --- | --- |
| H1 home central | 66 / 1.02 |
| H1 espacio | 54 / 1.02 |
| H1 post | 54 / 1.02 |
| H2 dentro del post | 34 / 1.1 |
| Título en lista de espacio | 34 / 1.08 |
| Título en lista central | 23 / 1.2 |
| Entradilla del post | Literata 20 / 1.55 |
| Cuerpo del post | Literata 19 / 1.7 |
| Extracto de lista | Literata 16.5 / 1.65 |
| Metadatos, pies, urls | 12–12.5, `letter-spacing: .08em`, versalitas |
| Marca en cabecera | 15–17, `letter-spacing: .16–.18em`, versalitas |

Cualquier texto secundario sobre papel: `color-mix(in srgb, #1d1f20 N%, transparent)` con N = 50 (metadatos), 55–62 (pies y extractos cortos), 70–78 (extractos y entradilla).

### Retícula y medidas

- Página: ancho fijo del contenedor, sin tarjetas flotantes. Papel a sangre contra el borde.
- Padding lateral: **48px** en el shell central, **40px** en el shell de espacio (los 10px del canto compensan).
- Medida de lectura del post: **640px**, centrada.
- Desbordes autorizados desde la medida de lectura: galería **860px**, código **800px**. Ningún bloque llega al ancho completo.
- Lista de posts del espacio: `max-width: 800px`, alineada a la izquierda. Nunca centrada, nunca en retícula de tarjetas.

### Imágenes

Todas las fotos van en blanco y negro: `filter: grayscale(1) contrast(1.08)`, expuesto como `--ph` para poder cambiarlo globalmente. Las fotos de contenido dentro del post van enmarcadas con `.blueprint` + las cuatro `<i class="corner">`; las fotos a sangre (cabeceras, panorámica) no llevan marco.

Sobre foto siempre hay un degradado antes del texto:
`linear-gradient(180deg, rgba(15,16,17,.12) 0%, rgba(15,16,17,.78) 100%)`, y el texto encima va en `#ffffff` a opacidad completa.

---

## 2. Shell central — `divermente.com`

Estructura vertical, en orden:

1. **Cabecera a sangre, 520px.** Foto en blanco y negro, degradado en dos extremos (oscuro arriba para la barra de navegación, oscuro abajo para el titular). Dentro: la marca `DIVERMENTE` arriba a la izquierda, navegación arriba a la derecha (Espacios / Tags / RSS), y abajo el H1 a 66px más una bajada de una o dos líneas. Toda la navegación en blanco.
2. **Espacios.** Encabezado de sección en versalitas + recuento a la derecha. Retícula de tres columnas (`repeat(3, minmax(0,1fr))`, gap 24px) con tarjetas `.blueprint` completas: cuadrado de 9px con el acento del espacio, nombre en Barlow Condensed 22, descripción de dos líneas y un pie con subdominio y número de posts separado por una regla. Escalar a más de tres espacios: la misma retícula envuelve.
3. **Último.** Lista cronológica cruzada de todos los espacios. Cada fila es `grid-template-columns: 18px 1fr 92px` — punto del color del espacio, título + extracto, fecha a la derecha. Es el único lugar donde conviven los tres acentos.
4. **Tags que cruzan.** Etiqueta de sección a la izquierda y `.tag.tag-outline` con recuento, en fila que envuelve.
5. **Pie.** Dominio a la izquierda, RSS y archivo a la derecha, ambos en 12px atenuado.

---

## 3. Shell de espacio — `nutricion.divermente.com`

El identificador del espacio es estructural, no decorativo. Tres marcas siempre presentes:

- **Canto**: columna de **10px** con `--sp` en todo el borde izquierdo de la página (`grid-template-columns: 10px minmax(0,1fr)`).
- **Filete**: `border-bottom: 2px solid var(--sp)` bajo la barra de cabecera.
- **Reglas teñidas**: los separadores de la lista usan `--sp-line`, no gris.

### Home del espacio

1. **Barra de cabecera.** Nombre del espacio en versalitas a la izquierda; a la derecha "Categorías" y "← todo" (el enlace de vuelta al sitio central, en `--sp-deep`). Siempre presente, en todas las páginas del espacio.
2. **Cabecera con foto, 320px.** Filete de 64×5px con el acento sobre el título, H1 a 54, bajada en Literata. Variante sin foto: misma altura, fondo papel, el filete y el H1 en tinta.
3. **Barra de categorías.** Fila de celdas iguales (`flex: 1`), divididas por hairlines verticales, en versalitas 12.5. La activa lleva `border-bottom: 3px solid var(--sp)` y tinta plena; las demás al 65%.
4. **Lista de posts.** Cada item es `grid-template-columns: 54px 1fr`: número de orden (01, 02, 03…) en el acento, y a la derecha línea de metadatos (categoría en `--sp-deep` · fecha · minutos de lectura), título a 34 y extracto en Literata. Separados por `--sp-line`.
5. **Paginación.** `.btn.btn-secondary` "Posts anteriores" y contador "1 de 3".
6. **Pie.** Subdominio a la izquierda, RSS del espacio y "← todo" a la derecha.

### Página de post

1. Barra de cabecera idéntica a la home del espacio.
2. **Panorámica, 248px** a todo el ancho, en blanco y negro, cerrada por abajo con una franja de **5px** en `--sp`. Sin texto encima: el recorte es libre.
3. **Línea de contexto** inmediatamente bajo la franja: a la izquierda categoría (`--sp-deep`) · fecha · lectura; a la derecha el pie de foto, alineado a la derecha, máximo 40ch.
4. **Título y entradilla** en la columna de 640px, sobre papel.
5. **Cuerpo** en Literata 19/1.7, párrafos con `margin-bottom: 24px`, H2 a 34 con `margin-top: 48px`.
6. **Bloques ricos.** El ritmo visual del artículo es el ancho de cada bloque, no el color:
   - `callout` — dentro de la columna, `border-left: 4px solid var(--sp)` y fondo `color-mix(in srgb, var(--sp) 9%, transparent)`, con etiqueta en versalitas 11.
   - `gallery` — 860px, retícula de N columnas de marcos `.blueprint` en 4:3, con pie debajo.
   - `code` — 800px, fondo `#e9e9ea`, borde hairline, monoespaciada 14/1.65.
7. **Cierre.** Tags del post sobre una regla en `--sp-line`, y navegación anterior/siguiente en `--sp-deep`, a 44% de ancho cada una.
8. Pie con la url completa del post.

---

## 4. Reglas que no se rompen

- Los espacios no comparten cabecera con el sitio central: cada uno se ve como un blog propio, y el único vínculo visible es "← todo".
- Ningún espacio usa tarjetas para listar sus posts. Listas con regla; las tarjetas son sólo del índice central.
- Un acento por espacio. No hay un segundo color decorativo dentro de un espacio.
- Los marcos `.blueprint` no pierden nunca sus cuatro marcas de registro, y no se redondean.
- La medida de lectura no cambia entre posts; lo que cambia es cuánto desborda cada bloque.

---

## 5. Pendiente de diseñar

Home de espacio sin imagen, página de categoría, 404 del espacio, modo oscuro, y estados límite (espacio con cero o un solo post, post muy largo).
