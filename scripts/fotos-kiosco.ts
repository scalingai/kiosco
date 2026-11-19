/**
 * Re-fotografía cada producto ADENTRO del kiosco.
 *
 *   npm run db:fotos                      # dice qué haría, no toca nada
 *   npm run db:fotos -- --aplicar --prod  # genera y guarda
 *   npm run db:fotos -- --aplicar --prod --solo "Oreo,Coca-Cola"
 *   npm run db:fotos -- --aplicar --prod --rehacer   # incluso las ya hechas
 *
 * ── De qué se trata ───────────────────────────────────────────────────────
 * La foto que trae `db:importar` es el recorte de prensa de la marca sobre
 * fondo blanco. Sirve para reconocer el envase y se ve como lo que es: un
 * archivo de catálogo ajeno, con cada producto flotando en un blanco distinto.
 * Treinta de esas juntas no son una góndola, son una planilla.
 *
 * Esto agarra ESA foto —la de verdad— y la manda a editar: el mismo envase,
 * el mismo logo, el mismo texto, pero apoyado en el mostrador del kiosco, con
 * la luz del local y la estantería desenfocada atrás.
 *
 * Es importante que sea una EDICIÓN y no una generación desde cero. Pedirle a
 * un modelo "dibujame un paquete de Krachitos" devuelve un paquete que no
 * existe: el logo sale parecido y mal, el gramaje inventado, los octógonos en
 * cualquier lado. Partiendo de la foto real, el envase es el real; lo único
 * que se inventa es dónde está apoyado.
 *
 * Por eso sólo se les hace a los productos que YA tienen foto. Al que no la
 * tiene no hay nada que re-fotografiar, y se queda con la imagen de su rubro.
 *
 * El link original se guarda en `imagen_origen_url`: permite volver a generar
 * con un prompt mejor, o volver atrás, sin salir a buscar de nuevo.
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { and, eq, isNotNull, isNull, like, or, sql } from "drizzle-orm";
import { abrirBase } from "./lib/base.ts";
import { categorias, marcas, productos } from "../src/db/schema.ts";

const APLICAR = process.argv.includes("--aplicar");
const REHACER = process.argv.includes("--rehacer");
const soloArg = process.argv.indexOf("--solo");
const SOLO =
  soloArg > -1 && process.argv[soloArg + 1]
    ? process.argv[soloArg + 1]
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    : null;

const CLAVE = process.env.OPENAI_API_KEY;

/**
 * La variante más realista de las dos. La otra (`flare`) es tres veces más
 * rápida y queda bien, pero `sunburst` es la que da profundidad de campo de
 * cámara de verdad en vez de un desenfoque parejo — y es lo único que separa
 * "foto adentro del kiosco" de "recorte pegado sobre un fondo".
 */
const MODELO = "gpt-image-2.6-sunburst";

/** Cuántas a la vez. Más que esto y la API empieza a devolver 429. */
const EN_PARALELO = 6;

const CARPETA = path.join(process.cwd(), "public", "productos");

/**
 * Lo que NO se puede tocar, dicho de todas las formas posibles.
 *
 * El modelo tiende a "mejorar" el envase: endereza el logo, re-tipografía el
 * gramaje, corre los octógonos. Cualquiera de esas tres cosas convierte la
 * foto en la de un producto que no existe, y en una góndola eso se nota al
 * toque. De ahí la insistencia.
 */
const FIEL =
  "Keep the product itself completely identical to the input image:" +
  " same packaging, same artwork, same logo, same typography, same colours," +
  " same text, same net weight, same warning octagons in the same place," +
  " same proportions. Do not redraw, restyle, translate or re-typeset anything" +
  " printed on it. Do not add text, prices, stickers or graphics.";

/** Cómo se ve la foto, igual en todas: es lo que hace que parezcan una serie. */
const CAMARA =
  " Realistic 50mm photograph, shallow depth of field, warm natural shop light" +
  " coming from the side, soft shadow under the product, the product sharp and" +
  " fully in frame, centred, nothing cropped.";

/**
 * Dónde está apoyado, según el rubro.
 *
 * No es decoración: la gaseosa va en la heladera y el cigarrillo atrás del
 * mostrador porque es donde están de verdad, y una foto que lo respeta se lee
 * como una foto del local. Todas comparten el local, así que la serie sigue
 * siendo una sola.
 */
const ESCENA: Record<string, string> = {
  Bebidas:
    "standing on the glass shelf of a lit beverage cooler in a small Buenos Aires kiosk," +
    " cold condensation on the glass, other bottles and cans softly blurred behind",
  Golosinas:
    "standing on the wooden counter of a small Buenos Aires kiosk," +
    " a glass jar of colourful candy and a blurred rack of sweets behind",
  Snacks:
    "standing on the wooden counter of a small Buenos Aires kiosk," +
    " a blurred rack of hanging snack bags behind",
  Tabaquería:
    "standing on the wooden counter of a small Buenos Aires kiosk," +
    " the blurred wooden cigarette drawer and shelving behind",
  Almacén:
    "standing on a wooden shelf of a small Buenos Aires grocery kiosk," +
    " blurred rows of pantry goods behind",
  Limpieza:
    "standing on a wooden shelf of a small Buenos Aires grocery kiosk," +
    " blurred cleaning bottles and paper rolls behind",
  Perfumería:
    "standing on a clean shelf of a small Buenos Aires kiosk," +
    " blurred toiletries and a small mirror behind",
  Librería:
    "standing on the wooden counter of a small Buenos Aires kiosk," +
    " a blurred cup of pens and a stack of notebooks behind",
  Varios:
    "standing on the wooden counter of a small Buenos Aires kiosk," +
    " blurred shelves of assorted goods behind",
};

const ESCENA_POR_DEFECTO =
  "standing on the wooden counter of a small Buenos Aires kiosk," +
  " blurred shelves of assorted products behind";

/** `Coca-Cola común 2,25 L` → `coca-cola-comun-2-25-l` */
function slug(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

type Fila = {
  id: string;
  nombre: string;
  rubro: string | null;
  origen: string;
};

async function bajar(url: string): Promise<Buffer | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch {
    return null;
  }
}

async function reFotografiar(
  original: Buffer,
  escena: string,
): Promise<Buffer | string> {
  const form = new FormData();
  form.append("model", MODELO);
  form.append(
    "prompt",
    `Re-photograph this exact product ${escena}. ${FIEL}${CAMARA}`,
  );
  form.append("size", "1024x1024");
  form.append("output_format", "webp");
  form.append("output_compression", "85");
  form.append("quality", "high");
  form.append(
    "image",
    new Blob([new Uint8Array(original)], { type: "image/jpeg" }),
    "producto.jpg",
  );

  try {
    const r = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${CLAVE}` },
      body: form,
      signal: AbortSignal.timeout(300_000),
    });
    const j = (await r.json()) as {
      error?: { message?: string };
      data?: { b64_json?: string }[];
    };
    if (j.error) return j.error.message ?? "error sin mensaje";
    const b64 = j.data?.[0]?.b64_json;
    if (!b64) return "la API no devolvió imagen";
    return Buffer.from(b64, "base64");
  } catch (e) {
    return e instanceof Error ? e.message : "falló la llamada";
  }
}

/* ── Arranque ─────────────────────────────────────────────────────────── */

if (APLICAR && !CLAVE) {
  console.error("Falta OPENAI_API_KEY en el entorno.");
  process.exit(1);
}

const { db, cerrar } = await abrirBase(APLICAR);

fs.mkdirSync(CARPETA, { recursive: true });

const padre = sql`(select c2.nombre from categorias c2 where c2.id = ${categorias.padreId})`;

const todos = (await db
  .select({
    id: productos.id,
    nombre: productos.nombre,
    rubro: sql<string | null>`coalesce(${padre}, ${categorias.nombre})`,
    // La foto de origen es la que se guardó aparte, y si no hay, la actual
    // (todavía no se le hizo la nuestra).
    origen: sql<string>`coalesce(${productos.imagenOrigenUrl}, ${productos.imagenUrl})`,
  })
  .from(productos)
  .leftJoin(marcas, eq(marcas.id, productos.marcaId))
  .leftJoin(categorias, eq(categorias.id, productos.categoriaId))
  .where(
    and(
      isNull(productos.archivadoEn),
      isNotNull(productos.imagenUrl),
      // Sólo las que son un link de afuera: las nuestras ya están hechas.
      or(
        like(productos.imagenUrl, "http%"),
        isNotNull(productos.imagenOrigenUrl),
      ),
    ),
  )
  .orderBy(productos.nombre)) as Fila[];

const pendientes = todos.filter((p) => {
  if (!p.origen?.startsWith("http")) return false;
  if (SOLO && !SOLO.some((t) => p.nombre.toLowerCase().includes(t))) return false;
  if (!REHACER && fs.existsSync(path.join(CARPETA, `${slug(p.nombre)}.webp`))) {
    return false;
  }
  return true;
});

console.log(
  `Con foto de catálogo: ${todos.length} · a re-fotografiar: ${pendientes.length}` +
    `\nModelo: ${MODELO} · de a ${EN_PARALELO}\n`,
);

if (!APLICAR) {
  console.log(pendientes.map((p) => `  ${p.nombre}`).join("\n"));
  console.log("\nCorrelo con --aplicar --prod para que lo haga.");
  await cerrar();
  process.exit(0);
}

let hechas = 0;
let fallaron = 0;
const problemas: string[] = [];
const arranque = Date.now();

async function trabajar(p: Fila) {
  const archivo = path.join(CARPETA, `${slug(p.nombre)}.webp`);
  const publica = `/productos/${slug(p.nombre)}.webp`;

  const original = await bajar(p.origen);
  if (!original) {
    problemas.push(`${p.nombre}: no se pudo bajar la foto original`);
    fallaron++;
    return;
  }

  const escena = (p.rubro && ESCENA[p.rubro]) || ESCENA_POR_DEFECTO;
  const salida = await reFotografiar(original, escena);
  if (typeof salida === "string") {
    problemas.push(`${p.nombre}: ${salida}`);
    fallaron++;
    return;
  }

  // 640 px alcanza y sobra: la vidriera la dibuja en una tarjeta cuadrada y el
  // stock en una miniatura de 28. A 1024 el repo se iba a 60 MB para que nadie
  // vea la diferencia.
  const chica = await sharp(salida)
    .resize(640, 640, { fit: "cover" })
    .webp({ quality: 80 })
    .toBuffer();

  fs.writeFileSync(archivo, chica);
  await db
    .update(productos)
    .set({
      imagenUrl: publica,
      // Sólo la primera vez: después ya quedó guardada y no hay que pisarla
      // con la nuestra.
      imagenOrigenUrl: sql`coalesce(${productos.imagenOrigenUrl}, ${p.origen})`,
    })
    .where(eq(productos.id, p.id));

  hechas++;
  const seg = Math.round((Date.now() - arranque) / 1000);
  console.log(
    `✓ [${hechas + fallaron}/${pendientes.length}] ${p.nombre}` +
      ` (${Math.round(chica.length / 1024)} kB · ${seg}s)`,
  );
}

// De a tandas: el modelo tarda ~40 s por imagen y de a una serían horas.
for (let i = 0; i < pendientes.length; i += EN_PARALELO) {
  await Promise.all(pendientes.slice(i, i + EN_PARALELO).map(trabajar));
}

console.log(`\nListas: ${hechas} · fallaron: ${fallaron}`);
if (problemas.length) console.log("\n" + problemas.join("\n"));

await cerrar();
