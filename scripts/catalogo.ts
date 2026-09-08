/**
 * Carga el catálogo real del kiosco: categorías, marcas y productos.
 *
 *   npm run db:catalogo
 *
 * NO es la semilla. `db:semilla` inventa clientes y compras para poder mirar la
 * app con algo adentro; esto es el listado de verdad de lo que se vende, y por
 * eso no trae costos ni proveedores: esos los escribe la primera compra que se
 * cargue de cada cosa.
 *
 * Se puede correr las veces que haga falta: lo que ya existe no se duplica ni
 * se pisa, así que agregar productos es agregarlos acá abajo y volver a
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
import { categorias, marcas, productos } from "../src/db/schema.ts";
import { normalizarNombre } from "../src/lib/nombres.ts";

type Envase = "botella" | "retornable" | "lata" | "tetra" | "otro";

/** Un formato de envase: cómo se llama, cuántos ml trae y en qué viene. */
type Formato = { etiqueta: string; ml: number; envase: Envase };

/**
 * Una línea de productos: una marca, su rubro, sus variantes y sus formatos.
 * El catálogo sale de multiplicar variantes por formatos, que es exactamente
 * como está armada una góndola de bebidas.
 */
type Linea = {
  marca: string;
  /** la subcategoría; su categoría padre sale de SUBCATEGORIAS */
  rubro: string;
  /** "" cuando la marca tiene una sola variante (Fanta es naranja y listo) */
  variantes: string[];
  formatos: Formato[];
};

/**
 * El árbol de rubros: la categoría es lo que separa una góndola de otra, y la
 * subcategoría es lo que se mira para reponer.
 *
 * Están todos, aunque hoy sólo las bebidas tengan productos cargados. Ese es el
 * punto: el árbol es el esquema con el que se clasifica lo que va entrando, y
 * si no existe antes, cada producto nuevo se carga sin rubro y después nadie
 * vuelve a ponérselo.
 */
const SUBCATEGORIAS: Record<string, string> = {
  // Bebidas: lo único que ya tiene productos cargados.
  Gaseosas: "Bebidas",
  Aguas: "Bebidas",
  "Aguas saborizadas": "Bebidas",
  Jugos: "Bebidas",
  Isotónicas: "Bebidas",
  Energizantes: "Bebidas",
  Cervezas: "Bebidas",
  "Listos para tomar": "Bebidas",

  Alfajores: "Golosinas",
  Chocolates: "Golosinas",
  Caramelos: "Golosinas",
  Chupetines: "Golosinas",
  Chicles: "Golosinas",
  Pastillas: "Golosinas",
  Gomitas: "Golosinas",

  "Papas fritas": "Snacks",
  Galletitas: "Snacks",

  Leche: "Almacén",
  // Atún y paté van juntos: son la misma góndola y el mismo proveedor.
  Conservas: "Almacén",
  Helados: "Almacén",

  Cigarrillos: "Tabaquería",
  Tabaco: "Tabaquería",
  Papelillos: "Tabaquería",
  Filtros: "Tabaquería",

  Desodorantes: "Perfumería",
  "Jabón de cuerpo": "Perfumería",
  "Maquinitas de afeitar": "Perfumería",
  Perfumes: "Perfumería",

  // El papel higiénico va acá y no en perfumería: se compra al mismo
  // distribuidor que el jabón de la ropa.
  "Papel higiénico": "Limpieza",
  "Jabón para la ropa": "Limpieza",
  Suavizante: "Limpieza",

  Cuadernos: "Librería",

  Pilas: "Varios",
};

const B600: Formato = { etiqueta: "600 ml", ml: 600, envase: "botella" };
const B1500: Formato = { etiqueta: "1,5 L", ml: 1500, envase: "botella" };
const B2000: Formato = { etiqueta: "2 L", ml: 2000, envase: "botella" };
const B2250: Formato = { etiqueta: "2,25 L", ml: 2250, envase: "botella" };
const B500: Formato = { etiqueta: "500 ml", ml: 500, envase: "botella" };

const RET_2000: Formato = {
  etiqueta: "2 L retornable",
  ml: 2000,
  envase: "retornable",
};
/** El litro de vidrio va y vuelve, igual que el retornable de 2 L. */
const VIDRIO_1000: Formato = {
  etiqueta: "1 L vidrio",
  ml: 1000,
  envase: "retornable",
};

/** La chiquita de 220 y la de siempre de 354. */
const LATA_CHICA: Formato = {
  etiqueta: "lata 220 ml",
  ml: 220,
  envase: "lata",
};
const LATA_MEDIANA: Formato = {
  etiqueta: "lata 354 ml",
  ml: 354,
  envase: "lata",
};
/** La lata de cerveza: son 473 ml, aunque en el mostrador se diga "474". */
const LATA_473: Formato = {
  etiqueta: "lata 473 ml",
  ml: 473,
  envase: "lata",
};

const CATALOGO: Linea[] = [
  {
    marca: "Coca-Cola",
    rubro: "Gaseosas",
    variantes: ["común", "zero"],
    formatos: [
      B600,
      B1500,
      B2250,
      RET_2000,
      VIDRIO_1000,
      LATA_CHICA,
      LATA_MEDIANA,
    ],
  },
  {
    marca: "Sprite",
    rubro: "Gaseosas",
    variantes: ["común", "zero"],
    formatos: [B600, B2250, RET_2000, LATA_CHICA, LATA_MEDIANA],
  },
  {
    marca: "Fanta",
    rubro: "Gaseosas",
    variantes: [""],
    // Sin lata chica: Fanta no viene en ese formato.
    formatos: [B600, LATA_MEDIANA, B2000, RET_2000],
  },
  {
    marca: "Pepsi",
    rubro: "Gaseosas",
    variantes: [""],
    formatos: [B600, LATA_MEDIANA, B2000],
  },
  {
    marca: "7up",
    rubro: "Gaseosas",
    variantes: [""],
    // El sin azúcar existe sólo en 2 L, así que va en SUELTOS.
    formatos: [B600, LATA_MEDIANA, B2000],
  },
  {
    marca: "Manaos",
    rubro: "Gaseosas",
    variantes: [
      "cola",
      "cola sin azúcar",
      "lima limón",
      "naranja",
      "pomelo rosado",
      "tónica",
    ],
    formatos: [B2250],
  },
  {
    marca: "Cunnington",
    rubro: "Gaseosas",
    variantes: ["cola", "cola zero", "lima limón", "tónica"],
    formatos: [B2250],
  },
  {
    marca: "Levite",
    rubro: "Aguas saborizadas",
    variantes: ["pomelo", "pera", "manzana", "naranja"],
    formatos: [B500, B1500, B2000],
  },
  {
    marca: "Aquarius",
    rubro: "Aguas saborizadas",
    variantes: ["pomelo", "pera", "manzana"],
    formatos: [B1500, B2000],
  },
  {
    marca: "Placer",
    rubro: "Aguas saborizadas",
    variantes: ["pomelo", "pera", "manzana", "ananá", "naranja"],
    formatos: [B500, B1500],
  },
  {
    marca: "Villa Manaos",
    rubro: "Aguas",
    variantes: ["agua"],
    formatos: [B500, B2000],
  },
  {
    marca: "Baggio",
    rubro: "Jugos",
    variantes: ["manzana", "naranja", "multifruta"],
    formatos: [
      { etiqueta: "200 ml", ml: 200, envase: "tetra" },
      { etiqueta: "1 L", ml: 1000, envase: "tetra" },
    ],
  },
  {
    marca: "Powerade",
    rubro: "Isotónicas",
    // Los colores son como se piden en el mostrador; el sabor va al lado para
    // que se entienda cuál es cuando llega la factura del proveedor.
    variantes: ["azul (mountain blast)", "rojo (frutas tropicales)", "manzana"],
    formatos: [B500],
  },
  {
    marca: "Speed",
    rubro: "Energizantes",
    variantes: [""],
    formatos: [
      { etiqueta: "lata 250 ml", ml: 250, envase: "lata" },
      LATA_473,
    ],
  },
  { marca: "Brahma", rubro: "Cervezas", variantes: [""], formatos: [LATA_473] },
  {
    marca: "Isenbeck",
    rubro: "Cervezas",
    variantes: [""],
    formatos: [LATA_473],
  },
  {
    marca: "Schneider",
    rubro: "Cervezas",
    variantes: [""],
    formatos: [
      LATA_473,
      { etiqueta: "710 ml", ml: 710, envase: "botella" },
    ],
  },
  {
    marca: "Smirnoff",
    rubro: "Listos para tomar",
    variantes: ["ice manzana", "ice cherry"],
    formatos: [LATA_473],
  },
];

/**
 * Los que no salen de multiplicar variantes por formatos: una variante que
 * existe en un solo tamaño. Meterlos en la grilla de arriba obligaría a crear
 * productos que no se venden.
 */
const SUELTOS: {
  marca: string;
  rubro: string;
  variante: string;
  formato: Formato;
}[] = [
  {
    marca: "7up",
    rubro: "Gaseosas",
    variante: "sin azúcar",
    formato: B2000,
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

  /** Crea si no está, devuelve el id igual. Sirve para marcas y categorías. */
  async function idDe(
    tabla: typeof marcas | typeof categorias,
    nombre: string,
    padreId?: string | null,
  ): Promise<string> {
    const normalizado = normalizarNombre(nombre);
    const valores =
      tabla === categorias
        ? { nombre, nombreNormalizado: normalizado, padreId: padreId ?? null }
        : { nombre, nombreNormalizado: normalizado };

    const [creada] = await db
      .insert(tabla)
      .values(valores as never)
      .onConflictDoNothing({ target: tabla.nombreNormalizado })
      .returning();
    if (creada) return creada.id;

    const [existente] = await db
      .select()
      .from(tabla)
      .where(eq(tabla.nombreNormalizado, normalizado));
    return existente.id;
  }

  // Primero el árbol de rubros, que es de lo que cuelgan los productos.
  const idPorRubro = new Map<string, string>();
  for (const [sub, padre] of Object.entries(SUBCATEGORIAS)) {
    const padreId = await idDe(categorias, padre, null);
    idPorRubro.set(sub, await idDe(categorias, sub, padreId));
  }

  let creados = 0;
  let existentes = 0;

  async function guardar(
    marcaId: string,
    rubro: string,
    marca: string,
    variante: string,
    formato: Formato,
  ) {
    const nombre = nombrar(marca, variante, formato.etiqueta);
    const [producto] = await db
      .insert(productos)
      .values({
        nombre,
        nombreNormalizado: normalizarNombre(nombre),
        marcaId,
        categoriaId: idPorRubro.get(rubro) ?? null,
        contenido: formato.ml,
        contenidoUnidad: "ml",
        envase: formato.envase,
      })
      .onConflictDoNothing({ target: productos.nombreNormalizado })
      .returning();

    if (producto) creados += 1;
    else existentes += 1;
  }

  for (const linea of CATALOGO) {
    const marcaId = await idDe(marcas, linea.marca);
    for (const variante of linea.variantes) {
      for (const formato of linea.formatos) {
        await guardar(marcaId, linea.rubro, linea.marca, variante, formato);
      }
    }
  }

  for (const suelto of SUELTOS) {
    const marcaId = await idDe(marcas, suelto.marca);
    await guardar(
      marcaId,
      suelto.rubro,
      suelto.marca,
      suelto.variante,
      suelto.formato,
    );
  }

  console.log(`${creados} productos nuevos, ${existentes} que ya estaban.`);
  await cliente.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
