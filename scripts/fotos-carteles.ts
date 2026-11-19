/**
 * Encuentra las fotos que no son una foto: el cartel de "imagen no disponible"
 * que devuelven los catálogos cuando no tienen el producto.
 *
 * No se detecta por el link —cada tienda usa el suyo y cambia— sino por la
 * imagen: un cartel es casi todo del mismo gris clarito, así que el desvío
 * estándar de sus colores es ínfimo comparado con el de una foto de verdad.
 *
 *   node --experimental-strip-types scripts/fotos-carteles.ts
 *   node --experimental-strip-types scripts/fotos-carteles.ts --aplicar --prod
 */
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { and, eq, isNotNull, isNull, like, or, sql } from "drizzle-orm";
import { abrirBase } from "./lib/base.ts";
import { productos } from "../src/db/schema.ts";

const APLICAR = process.argv.includes("--aplicar");
/** Debajo de esto la imagen es un cartel, no una foto. */
const UMBRAL = 18;

const { db, cerrar } = await abrirBase(APLICAR);

const filas = await db
  .select({
    id: productos.id,
    nombre: productos.nombre,
    url: sql<string>`coalesce(${productos.imagenOrigenUrl}, ${productos.imagenUrl})`,
    propia: productos.imagenUrl,
  })
  .from(productos)
  .where(
    and(
      isNull(productos.archivadoEn),
      isNotNull(productos.imagenUrl),
      or(
        like(productos.imagenUrl, "http%"),
        isNotNull(productos.imagenOrigenUrl),
      ),
    ),
  )
  .orderBy(productos.nombre);

console.log(`Mirando ${filas.length} fotos…\n`);

const sospechosas: typeof filas = [];
let revisadas = 0;

async function mirar(p: (typeof filas)[number]) {
  try {
    const r = await fetch(p.url, { signal: AbortSignal.timeout(25_000) });
    if (!r.ok) return;
    const buf = Buffer.from(await r.arrayBuffer());
    const { channels } = await sharp(buf).stats();
    // El promedio de los desvíos de los canales de color.
    const desvio =
      channels.slice(0, 3).reduce((t, c) => t + c.stdev, 0) /
      Math.min(3, channels.length);
    if (desvio < UMBRAL) sospechosas.push(p);
  } catch {
    /* una que no baja no se juzga */
  } finally {
    revisadas++;
    if (revisadas % 50 === 0) console.log(`  …${revisadas}/${filas.length}`);
  }
}

for (let i = 0; i < filas.length; i += 12) {
  await Promise.all(filas.slice(i, i + 12).map(mirar));
}

console.log(`\nCarteles encontrados: ${sospechosas.length}`);
for (const p of sospechosas) console.log(`  ${p.nombre}`);

if (APLICAR) {
  for (const p of sospechosas) {
    // Se le saca la foto: con `imagen_url` en null, la pantalla cae en la del
    // rubro, que dice de qué se trata. Un cartel de "no disponible" no dice
    // nada y encima ocupa el lugar de la foto buena del día que aparezca.
    await db
      .update(productos)
      .set({ imagenUrl: null, imagenOrigenUrl: null })
      .where(eq(productos.id, p.id));

    // Y si ya se había re-fotografiado el cartel, el archivo también se va.
    if (p.propia?.startsWith("/productos/")) {
      const archivo = path.join(process.cwd(), "public", p.propia.slice(1));
      if (fs.existsSync(archivo)) fs.rmSync(archivo);
    }
  }
  console.log(`\nLimpiadas: ${sospechosas.length}`);
} else if (sospechosas.length) {
  console.log("\nCorrelo con --aplicar --prod para sacarlas.");
}

await cerrar();
