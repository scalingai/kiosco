/**
 * Carga el catálogo real del kiosco: marcas y productos con su contenido.
 *
 *   npm run db:catalogo
 *
 * NO es la semilla. `db:semilla` inventa clientes y compras para poder mirar la
 * app con algo adentro; esto es el listado de verdad de lo que se vende, y por
 * eso no trae costos ni proveedores: esos los escribe la primera compra que se
 * cargue de cada cosa.
 *
 * Se puede correr las veces que haga falta: lo que ya existe no se duplica ni
 * se pisa, así que agregar productos nuevos es agregarlos acá abajo y volver a
 * correrlo.
 *
 * Convención de nombres: `Marca variante formato`, con la marca adelante.
 * Es redundante con la columna de marca en pantalla, pero el nombre tiene que
 * ser único en toda la app y sobre todo tiene que poder tipearse en la carga de
 * una compra, donde no hay marca que ayude a desambiguar.
 */
import fs from "node:fs";
import path from "node:path";
import { eq } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { marcas, productos } from "../src/db/schema.ts";
import { normalizarNombre } from "../src/lib/nombres.ts";

/** Un formato de envase: cómo se llama y cuántos ml trae. */
type Formato = { etiqueta: string; ml: number };

/**
 * Una línea de productos: una marca, sus variantes y sus formatos. El catálogo
 * sale de multiplicar variantes por formatos, que es exactamente como está
 * armada una góndola de bebidas.
 */
type Linea = {
  marca: string;
  /** "" cuando la marca tiene una sola variante (Fanta es naranja y listo) */
  variantes: string[];
  formatos: Formato[];
};

const BOTELLA_600: Formato = { etiqueta: "600 ml", ml: 600 };
const BOTELLA_1500: Formato = { etiqueta: "1,5 L", ml: 1500 };
const BOTELLA_2000: Formato = { etiqueta: "2 L", ml: 2000 };
const RETORNABLE_2000: Formato = { etiqueta: "2 L retornable", ml: 2000 };
const BOTELLA_2250: Formato = { etiqueta: "2,25 L", ml: 2250 };
/** La chiquita de 220 y la de siempre de 354. */
const LATA_CHICA: Formato = { etiqueta: "lata 220 ml", ml: 220 };
const LATA_MEDIANA: Formato = { etiqueta: "lata 354 ml", ml: 354 };
/** La lata de cerveza: son 473 ml, aunque en el mostrador se diga "474". */
const LATA_473: Formato = { etiqueta: "lata 473 ml", ml: 473 };

const CATALOGO: Linea[] = [
  {
    marca: "Coca-Cola",
    variantes: ["común", "zero"],
    formatos: [
      BOTELLA_600,
      BOTELLA_1500,
      BOTELLA_2250,
      RETORNABLE_2000,
      LATA_CHICA,
      LATA_MEDIANA,
    ],
  },
  {
    marca: "Sprite",
    variantes: ["común", "zero"],
    // Sin 1,5 L: en la lista venía un hueco y no lo completo por mi cuenta.
    formatos: [
      BOTELLA_600,
      BOTELLA_2250,
      RETORNABLE_2000,
      LATA_CHICA,
      LATA_MEDIANA,
    ],
  },
  {
    marca: "Fanta",
    variantes: [""],
    formatos: [BOTELLA_600, LATA_MEDIANA, BOTELLA_2000],
  },
  {
    marca: "Pepsi",
    variantes: [""],
    formatos: [BOTELLA_600, LATA_MEDIANA, BOTELLA_2000],
  },
  {
    marca: "7up",
    variantes: [""],
    formatos: [BOTELLA_600, LATA_MEDIANA, BOTELLA_2000],
  },
  {
    marca: "Manaos",
    variantes: [
      "cola",
      "cola sin azúcar",
      "lima limón",
      "naranja",
      "pomelo rosado",
      "tónica",
    ],
    formatos: [BOTELLA_2250],
  },
  {
    marca: "Cunnington",
    variantes: ["cola", "cola zero", "lima limón", "tónica"],
    formatos: [BOTELLA_2250],
  },
  {
    marca: "Levite",
    variantes: ["pomelo", "pera", "manzana", "naranja"],
    formatos: [
      { etiqueta: "500 ml", ml: 500 },
      BOTELLA_1500,
      BOTELLA_2000,
    ],
  },
  {
    marca: "Aquarius",
    variantes: ["pomelo", "pera", "manzana"],
    formatos: [BOTELLA_2000],
  },
  {
    marca: "Placer",
    variantes: ["pomelo", "pera", "manzana", "ananá", "naranja"],
    formatos: [{ etiqueta: "500 ml", ml: 500 }, BOTELLA_1500],
  },
  {
    marca: "Powerade",
    // Los colores son como se piden en el mostrador; el sabor va al lado para
    // que se entienda cuál es cuando llega la factura del proveedor.
    variantes: ["azul (mountain blast)", "rojo (frutas tropicales)", "manzana"],
    formatos: [{ etiqueta: "500 ml", ml: 500 }],
  },
  {
    marca: "Baggio",
    variantes: ["manzana", "naranja", "multifruta"],
    formatos: [
      { etiqueta: "200 ml", ml: 200 },
      { etiqueta: "1 L", ml: 1000 },
    ],
  },
  {
    marca: "Villa Manaos",
    variantes: ["agua"],
    formatos: [{ etiqueta: "500 ml", ml: 500 }, BOTELLA_2000],
  },
  {
    marca: "Speed",
    variantes: [""],
    formatos: [{ etiqueta: "lata 250 ml", ml: 250 }, LATA_473],
  },
  { marca: "Brahma", variantes: [""], formatos: [LATA_473] },
  { marca: "Isenbeck", variantes: [""], formatos: [LATA_473] },
  {
    marca: "Schneider",
    variantes: [""],
    formatos: [LATA_473, { etiqueta: "710 ml", ml: 710 }],
  },
  {
    marca: "Smirnoff",
    variantes: ["ice manzana", "ice cherry"],
    formatos: [LATA_473],
  },
];

/** "Coca-Cola" + "zero" + "600 ml" → "Coca-Cola zero 600 ml" */
function nombrar(marca: string, variante: string, formato: string): string {
  return [marca, variante, formato].filter(Boolean).join(" ");
}

async function main() {
  const directorio = path.join(process.cwd(), ".data", "pg");
  fs.mkdirSync(directorio, { recursive: true });
  const cliente = new PGlite(directorio);
  const db = drizzle(cliente);
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });

  let creados = 0;
  let existentes = 0;

  for (const linea of CATALOGO) {
    const normalizada = normalizarNombre(linea.marca);
    let marcaId: string | null = null;

    const [creada] = await db
      .insert(marcas)
      .values({ nombre: linea.marca, nombreNormalizado: normalizada })
      .onConflictDoNothing({ target: marcas.nombreNormalizado })
      .returning();

    if (creada) {
      marcaId = creada.id;
    } else {
      const [existente] = await db
        .select()
        .from(marcas)
        .where(eq(marcas.nombreNormalizado, normalizada));
      marcaId = existente?.id ?? null;
    }

    for (const variante of linea.variantes) {
      for (const formato of linea.formatos) {
        const nombre = nombrar(linea.marca, variante, formato.etiqueta);
        const [producto] = await db
          .insert(productos)
          .values({
            nombre,
            nombreNormalizado: normalizarNombre(nombre),
            marcaId,
            contenido: formato.ml,
            contenidoUnidad: "ml",
          })
          .onConflictDoNothing({ target: productos.nombreNormalizado })
          .returning();

        if (producto) creados += 1;
        else existentes += 1;
      }
    }

    console.log(
      `${linea.marca}: ${linea.variantes.length * linea.formatos.length} productos`,
    );
  }

  console.log(`\n${creados} productos nuevos, ${existentes} que ya estaban.`);
  await cliente.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
