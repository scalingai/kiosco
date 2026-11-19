/**
 * Le busca la FOTO a los productos que no tienen, en los catálogos públicos de
 * los supermercados (los mismos que usa `db:importar`).
 *
 * Sólo la foto: no toca el código de barras ni el nombre. Un EAN equivocado
 * escanea y trae otro producto —el peor error posible— y para eso ya está
 * `db:importar`, que exige que la marca y el contenido coincidan. Acá el daño
 * de equivocarse es cosmético, pero igual se exige coincidencia de marca y de
 * contenido: una foto equivocada en la góndola digital hace dudar de todo lo
 * demás.
 *
 *   node --experimental-strip-types scripts/buscar-fotos.ts              # qué haría
 *   node --experimental-strip-types scripts/buscar-fotos.ts --aplicar --prod
 */
import { abrirBase } from "./lib/base.ts";
import { and, eq, isNull, sql } from "drizzle-orm";
import { categorias, marcas, productos } from "../src/db/schema.ts";
import { normalizarNombre } from "../src/lib/nombres.ts";

const APLICAR = process.argv.includes("--aplicar");

const TIENDAS = [
  { nombre: "Jumbo", base: "https://www.jumbo.com.ar" },
  { nombre: "Carrefour", base: "https://www.carrefour.com.ar" },
  { nombre: "ChangoMas", base: "https://www.masonline.com.ar" },
  { nombre: "Disco", base: "https://www.disco.com.ar" },
];

type ProductoVtex = {
  productName?: string;
  brand?: string;
  items?: { images?: { imageUrl?: string }[] }[];
};

/** Palabras que no distinguen nada y arruinan la comparación. */
const RUIDO = new Set([
  "de", "del", "la", "el", "los", "las", "con", "sin", "y", "x", "un", "una",
  "por", "para", "en", "sabor", "grs", "gr", "g", "ml", "cc", "lt", "l", "kg",
  "mts", "m", "uni", "u", "unidades",
]);

function fichas(nombre: string): Set<string> {
  return new Set(
    normalizarNombre(nombre)
      .split(" ")
      .filter((p) => p.length > 1 && !RUIDO.has(p)),
  );
}

/** Cuánto de lo nuestro aparece en el nombre del super. */
function parecido(nuestro: string, delSuper: string): number {
  const a = fichas(nuestro);
  const b = fichas(delSuper);
  if (!a.size) return 0;
  let juntas = 0;
  for (const palabra of a) if (b.has(palabra)) juntas++;
  return juntas / a.size;
}

async function buscar(
  tienda: { nombre: string; base: string },
  texto: string,
): Promise<ProductoVtex[]> {
  const url =
    `${tienda.base}/api/catalog_system/pub/products/search` +
    `?ft=${encodeURIComponent(texto)}&_from=0&_to=9`;
  try {
    const r = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (!r.ok) return [];
    return (await r.json()) as ProductoVtex[];
  } catch {
    return [];
  }
}

const { db, cerrar } = await abrirBase(APLICAR);

const sinFoto = await db
  .select({
    id: productos.id,
    nombre: productos.nombre,
    marca: marcas.nombre,
    rubro: categorias.nombre,
  })
  .from(productos)
  .leftJoin(marcas, eq(marcas.id, productos.marcaId))
  .leftJoin(categorias, eq(categorias.id, productos.categoriaId))
  .where(and(isNull(productos.imagenUrl), isNull(productos.archivadoEn)))
  .orderBy(productos.nombre);

console.log(`Sin foto: ${sinFoto.length} productos\n`);

/** Lo que no tiene sentido buscar en el super. */
const NO_BUSCAR = /cigarrill|marlboro|lucky strike|philip morris|chesterfield|red point|camel|rochester|melbourne|dolchester|golden|kiel|master|tabaco|papelillo|filtro/i;

let puestas = 0;
const sinSuerte: string[] = [];

for (const p of sinFoto) {
  // Los cigarrillos no están en el catálogo de ningún super: por ley no se
  // pueden exhibir ni vender ahí. Buscarlos es gastar llamadas al vacío.
  if (NO_BUSCAR.test(p.nombre)) {
    sinSuerte.push(p.nombre);
    continue;
  }

  const texto = p.marca && !normalizarNombre(p.nombre).includes(normalizarNombre(p.marca))
    ? `${p.nombre} ${p.marca}`
    : p.nombre;

  let mejor: { imagen: string; puntaje: number; tienda: string } | null = null;

  for (const tienda of TIENDAS) {
    for (const crudo of await buscar(tienda, texto)) {
      const nombreVtex = crudo.productName?.trim();
      const imagen = crudo.items?.[0]?.images?.[0]?.imageUrl?.trim();
      if (!nombreVtex || !imagen) continue;

      // Si nuestro producto tiene marca, la del super tiene que ser la misma.
      if (p.marca) {
        const suya = normalizarNombre(crudo.brand ?? "");
        const nuestra = normalizarNombre(p.marca);
        if (suya && suya !== nuestra && !suya.includes(nuestra) && !nuestra.includes(suya)) {
          continue;
        }
      }

      const puntaje = parecido(p.nombre, nombreVtex);
      if (puntaje >= 0.7 && (!mejor || puntaje > mejor.puntaje)) {
        mejor = { imagen, puntaje, tienda: tienda.nombre };
      }
    }
    if (mejor && mejor.puntaje === 1) break;
    // Son catálogos ajenos: una pausa entre tiendas.
    await new Promise((seguir) => setTimeout(seguir, 200));
  }

  if (!mejor) {
    sinSuerte.push(p.nombre);
    continue;
  }

  console.log(
    `✓ ${p.nombre}  ←  ${mejor.tienda} (${Math.round(mejor.puntaje * 100)}%)`,
  );
  if (APLICAR) {
    await db
      .update(productos)
      .set({ imagenUrl: mejor.imagen })
      .where(eq(productos.id, p.id));
  }
  puestas++;
}

console.log(`\nFotos ${APLICAR ? "puestas" : "que se pondrían"}: ${puestas}`);
console.log(`Sin foto todavía: ${sinSuerte.length}`);
console.log(sinSuerte.join("\n"));

const [total] = await db
  .select({
    con: sql<string>`count(imagen_url)`,
    todos: sql<string>`count(*)`,
  })
  .from(productos)
  .where(isNull(productos.archivadoEn));
console.log(`\nCatálogo: ${total?.con} de ${total?.todos} con foto`);

await cerrar();
