/**
 * Trae productos reales —con su código de barras— desde el catálogo público de
 * Jumbo, y los cruza contra los que ya están cargados.
 *
 *   npm run db:importar              # muestra qué haría, no toca nada
 *   npm run db:importar -- --aplicar # lo escribe
 *
 * De dónde salen los datos: los sitios de Cencosud (Jumbo, Disco, Vea) corren
 * sobre VTEX, que expone el catálogo en `/api/catalog_system/pub/products/
 * search`. Ahí viene el EAN de verdad de cada envase, la marca y el nombre con
 * el gramaje adentro. NO es el "SKU" que se ve en la ficha del producto: ese es
 * el id interno de Cencosud y no sirve para escanear.
 *
 * Qué hace con cada producto que baja, en este orden:
 *
 * 1. Si ya hay UN producto de esa marca con ese mismo contenido, se le completa
 *    el código de barras y listo. Así los que cargamos a mano se enriquecen en
 *    vez de duplicarse.
 * 2. Si no hay ninguno, se crea con el nombre que usa el super.
 * 3. Si hay VARIOS candidatos —la Coca común y la zero son las dos de 2,25 L—
 *    no se elige ninguno: se reporta y se sigue de largo. Adivinar acá es
 *    ponerle a un producto el código de barras de otro.
 */
import fs from "node:fs";
import path from "node:path";
import { and, eq, isNull } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { categorias, marcas, productos } from "../src/db/schema.ts";
import { normalizarNombre } from "../src/lib/nombres.ts";

const TIENDA = "https://www.jumbo.com.ar";

/** Cuántos productos traer por búsqueda. Más que esto es más ruido que datos. */
const POR_BUSQUEDA = 24;

/** Qué buscar y en qué rubro cae lo que venga. */
const BUSQUEDAS: { termino: string; rubro: string }[] = [
  { termino: "gaseosa", rubro: "Gaseosas" },
  { termino: "agua saborizada", rubro: "Aguas saborizadas" },
  { termino: "agua mineral", rubro: "Aguas" },
  { termino: "jugo", rubro: "Jugos" },
  { termino: "cerveza lata", rubro: "Alcohol" },
  { termino: "energizante", rubro: "Energizantes" },
  { termino: "papas fritas", rubro: "Papas fritas" },
  { termino: "palitos snack", rubro: "Snacks salados" },
  { termino: "galletitas", rubro: "Galletitas" },
  { termino: "alfajor", rubro: "Alfajores" },
  { termino: "chocolate", rubro: "Chocolates" },
  { termino: "caramelos", rubro: "Caramelos" },
  { termino: "chupetines", rubro: "Chupetines" },
  { termino: "chicles", rubro: "Chicles" },
  { termino: "pastillas", rubro: "Pastillas" },
  { termino: "gomitas", rubro: "Gomitas" },
  { termino: "leche", rubro: "Leche" },
  { termino: "atun lata", rubro: "Conservas" },
  { termino: "pate lata", rubro: "Conservas" },
  { termino: "helado", rubro: "Helados" },
  { termino: "papel higienico", rubro: "Papel higiénico" },
  { termino: "jabon en polvo", rubro: "Jabón para la ropa" },
  { termino: "suavizante", rubro: "Suavizante" },
  { termino: "desodorante", rubro: "Desodorantes" },
  { termino: "jabon de tocador", rubro: "Jabón de cuerpo" },
  { termino: "afeitadora descartable", rubro: "Maquinitas de afeitar" },
  { termino: "perfume", rubro: "Perfumes" },
  { termino: "cuaderno", rubro: "Cuadernos" },
  { termino: "pilas", rubro: "Pilas" },
];

type ItemVtex = { ean?: string; images?: { imageUrl?: string }[] };
type ProductoVtex = {
  productName?: string;
  brand?: string;
  items?: ItemVtex[];
};

type Traido = {
  nombre: string;
  marca: string;
  ean: string;
  contenido: number | null;
  unidad: "ml" | "gr" | null;
  envase: "botella" | "retornable" | "lata" | "tetra" | "otro" | null;
  imagen: string | null;
  rubro: string;
};

/**
 * El dígito verificador del EAN. Existe justo para detectar un dígito mal
 * leído, y acá es la última barrera antes de guardar algo que después va a
 * escanear mal.
 */
function codigoValido(codigo: string): boolean {
  if (!/^\d+$/.test(codigo)) return false;
  if (codigo.length !== 8 && codigo.length !== 13) return false;
  const digitos = [...codigo].map(Number);
  const verificador = digitos.pop()!;
  const suma = digitos
    .reverse()
    .reduce((total, d, i) => total + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (suma % 10)) % 10 === verificador;
}

/**
 * Saca el contenido del nombre: "2.25 Lts" → 2250 ml, "330 G" → 330 gr.
 * Si no hay nada reconocible devuelve null en vez de suponer un tamaño.
 */
function leerContenido(nombre: string): {
  contenido: number;
  unidad: "ml" | "gr";
} | null {
  const match = nombre.match(
    /(\d+(?:[.,]\d+)?)\s*(lts?|litros?|l|ml|cc|kg|kilos?|grs?|gr|g)\b/i,
  );
  if (!match) return null;

  const numero = Number(match[1].replace(",", "."));
  if (!Number.isFinite(numero) || numero <= 0) return null;

  const unidad = match[2].toLowerCase();
  if (/^(lts?|litros?|l)$/.test(unidad)) {
    return { contenido: Math.round(numero * 1000), unidad: "ml" };
  }
  if (/^(ml|cc)$/.test(unidad)) {
    return { contenido: Math.round(numero), unidad: "ml" };
  }
  if (/^(kg|kilos?)$/.test(unidad)) {
    return { contenido: Math.round(numero * 1000), unidad: "gr" };
  }
  return { contenido: Math.round(numero), unidad: "gr" };
}

/** El envase, cuando el nombre lo dice. Si no lo dice, se deja sin definir. */
function leerEnvase(nombre: string): Traido["envase"] {
  const texto = nombre.toLowerCase();
  if (texto.includes("retornable")) return "retornable";
  if (texto.includes("lata")) return "lata";
  if (texto.includes("tetra") || texto.includes("brik")) return "tetra";
  if (texto.includes("botella") || texto.includes("descartable")) {
    return "botella";
  }
  return null;
}

/** "COCA COLA" → "Coca Cola"; "LAY´S" → "Lay's". */
function acomodarMarca(marca: string): string {
  return marca
    .replace(/´/g, "'")
    .toLowerCase()
    .split(/\s+/)
    .map((palabra) => palabra.charAt(0).toUpperCase() + palabra.slice(1))
    .join(" ")
    .trim();
}

async function bajar(termino: string, rubro: string): Promise<Traido[]> {
  const url =
    `${TIENDA}/api/catalog_system/pub/products/search` +
    `?ft=${encodeURIComponent(termino)}&_from=0&_to=${POR_BUSQUEDA - 1}`;

  const respuesta = await fetch(url, {
    headers: { accept: "application/json" },
  });
  if (!respuesta.ok) {
    console.log(`  "${termino}": la tienda contestó ${respuesta.status}`);
    return [];
  }

  const crudos: ProductoVtex[] = await respuesta.json();
  const traidos: Traido[] = [];

  for (const crudo of crudos) {
    const nombre = crudo.productName?.trim();
    const marca = crudo.brand?.trim();
    const ean = crudo.items?.[0]?.ean?.trim();
    if (!nombre || !marca || !ean) continue;
    // Un EAN que no cierra es un dato roto, no un dato incompleto.
    if (!codigoValido(ean)) continue;

    const medida = leerContenido(nombre);
    traidos.push({
      nombre,
      marca: acomodarMarca(marca),
      ean,
      imagen: crudo.items?.[0]?.images?.[0]?.imageUrl?.trim() ?? null,
      contenido: medida?.contenido ?? null,
      unidad: medida?.unidad ?? null,
      envase: leerEnvase(nombre),
      rubro,
    });
  }

  return traidos;
}

async function main() {
  const aplicar = process.argv.includes("--aplicar");

  const directorio = path.join(process.cwd(), ".data", "pg");
  fs.mkdirSync(directorio, { recursive: true });
  const cliente = new PGlite(directorio);
  const db = drizzle(cliente);
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });

  console.log(
    aplicar
      ? "Importando de verdad.\n"
      : "Mostrando qué haría. Para escribirlo: npm run db:importar -- --aplicar\n",
  );

  const rubros = await db.select().from(categorias);
  const idPorRubro = new Map(
    rubros.map((r) => [normalizarNombre(r.nombre), r.id]),
  );

  let enriquecidos = 0;
  let nuevos = 0;
  let ambiguos = 0;
  let sinRubro = 0;

  for (const busqueda of BUSQUEDAS) {
    const traidos = await bajar(busqueda.termino, busqueda.rubro);
    const rubroId = idPorRubro.get(normalizarNombre(busqueda.rubro)) ?? null;
    if (!rubroId) {
      console.log(`  El rubro "${busqueda.rubro}" no existe todavía.`);
      sinRubro += 1;
      continue;
    }

    let enriquecidosAca = 0;
    let nuevosAca = 0;

    for (const traido of traidos) {
      // ¿Ya está el código en otro producto? Entonces este ya lo importamos.
      const [conEseCodigo] = await db
        .select({ id: productos.id })
        .from(productos)
        .where(eq(productos.codigoBarras, traido.ean))
        .limit(1);
      if (conEseCodigo) continue;

      const marcaNormalizada = normalizarNombre(traido.marca);
      const [marcaFila] = await db
        .select()
        .from(marcas)
        .where(eq(marcas.nombreNormalizado, marcaNormalizada));

      // Candidatos: misma marca, mismo contenido, y todavía sin código.
      const candidatos =
        marcaFila && traido.contenido != null && traido.unidad
          ? await db
              .select({ id: productos.id, nombre: productos.nombre })
              .from(productos)
              .where(
                and(
                  eq(productos.marcaId, marcaFila.id),
                  eq(productos.contenido, traido.contenido),
                  eq(productos.contenidoUnidad, traido.unidad),
                  isNull(productos.codigoBarras),
                  isNull(productos.archivadoEn),
                ),
              )
          : [];

      if (candidatos.length === 1) {
        enriquecidos += 1;
        enriquecidosAca += 1;
        if (aplicar) {
          await db
            .update(productos)
            .set({ codigoBarras: traido.ean, imagenUrl: traido.imagen })
            .where(eq(productos.id, candidatos[0].id));
        }
        continue;
      }

      if (candidatos.length > 1) {
        // Varios del mismo tamaño y marca: la Coca común y la zero son las dos
        // de 2,25 L. Elegir una sería ponerle el código de la otra.
        ambiguos += 1;
        console.log(
          `  ambiguo: "${traido.nombre}" podría ser ${candidatos
            .map((c) => `"${c.nombre}"`)
            .join(" o ")}`,
        );
        continue;
      }

      nuevos += 1;
      nuevosAca += 1;
      if (!aplicar) continue;

      let marcaId = marcaFila?.id ?? null;
      if (!marcaId) {
        const [creada] = await db
          .insert(marcas)
          .values({
            nombre: traido.marca,
            nombreNormalizado: marcaNormalizada,
          })
          .onConflictDoNothing({ target: marcas.nombreNormalizado })
          .returning();
        marcaId = creada?.id ?? null;
      }

      await db
        .insert(productos)
        .values({
          nombre: traido.nombre,
          nombreNormalizado: normalizarNombre(traido.nombre),
          marcaId,
          categoriaId: rubroId,
          contenido: traido.contenido,
          contenidoUnidad: traido.unidad,
          envase: traido.envase,
          codigoBarras: traido.ean,
          imagenUrl: traido.imagen,
        })
        .onConflictDoNothing({ target: productos.nombreNormalizado });
    }

    console.log(
      `${busqueda.termino} → ${busqueda.rubro}: ${traidos.length} bajados, ` +
        `${nuevosAca} nuevos, ${enriquecidosAca} con código completado`,
    );

    // Una pausa entre pedidos: es el catálogo de otro, no hay que martillarlo.
    await new Promise((seguir) => setTimeout(seguir, 400));
  }

  console.log(
    `\n${nuevos} productos nuevos, ${enriquecidos} a los que se les completó ` +
      `el código, ${ambiguos} que no se pudieron decidir solos` +
      (sinRubro ? `, ${sinRubro} búsquedas sin rubro` : "") +
      ".",
  );
  if (!aplicar) console.log("No se escribió nada.");

  await cliente.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
