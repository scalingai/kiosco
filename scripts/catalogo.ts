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
import { and, eq, notInArray } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import {
  categorias,
  comprasItems,
  marcas,
  productos,
  proveedores,
} from "../src/db/schema.ts";
import { normalizarNombre } from "../src/lib/nombres.ts";

type Envase = "botella" | "retornable" | "lata" | "tetra" | "otro";

/**
 * Un formato de envase: cómo se llama, cuánto trae y en qué viene. `unidad` es
 * "ml" salvo que se diga: las bebidas se miden en mililitros y los snacks en
 * gramos.
 */
type Formato = {
  etiqueta: string;
  ml: number;
  envase: Envase;
  unidad?: "ml" | "gr";
};


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
  // Los isotónicos van con jugos: en la góndola están al lado y se compran al
  // mismo proveedor.
  Jugos: "Bebidas",
  Energizantes: "Bebidas",
  // Todo lo que lleva alcohol junto: cerveza y listos para tomar se venden
  // igual, se guardan igual y tienen las mismas restricciones.
  Alcohol: "Bebidas",

  Alfajores: "Golosinas",
  Chocolates: "Golosinas",
  Caramelos: "Golosinas",
  Chupetines: "Golosinas",
  Chicles: "Golosinas",
  Pastillas: "Golosinas",
  Gomitas: "Golosinas",

  "Papas fritas": "Snacks",
  "Snacks salados": "Snacks",
  Galletitas: "Snacks",

  Lácteos: "Almacén",
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
    formatos: [B600, B1500, B2250, RET_2000, LATA_CHICA, LATA_MEDIANA],
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
    rubro: "Jugos",
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
  { marca: "Brahma", rubro: "Alcohol", variantes: [""], formatos: [LATA_473] },
  {
    marca: "Isenbeck",
    rubro: "Alcohol",
    variantes: [""],
    formatos: [LATA_473],
  },
  {
    marca: "Schneider",
    rubro: "Alcohol",
    variantes: [""],
    formatos: [
      LATA_473,
      { etiqueta: "710 ml", ml: 710, envase: "botella" },
    ],
  },
  /*
   * Snacks. Los gramajes salen del catálogo del distribuidor oficial de
   * Krachitos y de las fichas de producto de los supermercados; los que no
   * pude verificar quedan en SIN_TAMANO, sin número inventado.
   *
   * Dos correcciones sobre cómo los nombraste: Chizitos y Palitos NO son
   * marcas, son productos de Krachitos. Y Rueditas es de la marca PEP, no una
   * marca propia.
   */
  {
    marca: "Smirnoff",
    rubro: "Alcohol",
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

/**
 * Productos de los que sabemos la marca y el rubro pero NO el tamaño.
 *
 * Los snacks vienen en tres o cuatro gramajes y cuál se tiene depende del
 * kiosco, así que poner un número inventado sería peor que dejarlo vacío: el
 * costo por unidad saldría mal y nadie se daría cuenta. El gramaje se completa
 * en la ficha, o aparece solo cuando se carga la primera compra.
 */
const SIN_TAMANO: { marca: string; rubro: string; nombre?: string }[] = [
  { marca: "Pringles", rubro: "Papas fritas" },
  { marca: "Twistos", rubro: "Snacks salados" },
];

/**
 * Los helados de mostrador de Arcor: los que se venden de a uno.
 *
 * NO son los que trae el importador del supermercado. Ahí lo que hay son potes,
 * multipacks y postres familiares de 637 g, que es otro negocio: el kiosco
 * vende la unidad del freezer.
 *
 * `cc` sale del catálogo del distribuidor, que lista el bulto y la unidad ("40
 * x 49 cc" es una caja de 40 palitos de 49 cc cada uno). Los que no aparecen
 * con su medida quedan sin contenido: el gramaje se completa solo cuando se
 * carga la primera compra.
 *
 * La marca es la del envoltorio —Águila, Bon o Bon, Cofler— y el proveedor es
 * Arcor, que es a quién se le compra. Son dos cosas distintas.
 */
const HELADOS_ARCOR: { marca: string; nombre: string; cc?: number }[] = [
  { marca: "Águila", nombre: "Barrita Águila", cc: 49 },
  { marca: "Mr Pop's", nombre: "Mr Pop's surtido", cc: 50 },
  { marca: "Bon o Bon", nombre: "Corazón Bon o Bon", cc: 60 },
  { marca: "Mogul", nombre: "Mogul Extreme sandía", cc: 50 },
  { marca: "Bon o Bon", nombre: "Bon o Bon Citos", cc: 180 },
  { marca: "Cofler", nombre: "Cofler Citos dulce de leche", cc: 200 },
  { marca: "Cofler", nombre: "Cofler Citos americana", cc: 200 },
  // De estos el catálogo no da la medida de la unidad.
  { marca: "Mogul", nombre: "Palito Mogul 50% jugo" },
  { marca: "Rocklets", nombre: "Palito Rocklets" },
  { marca: "Cindor", nombre: "Palito Cindor" },
  { marca: "Butter Toffee", nombre: "Palito Butter Toffee's" },
];

/**
 * Lo único que se vende de lácteos. No hay góndola de lácteos en el kiosco:
 * hay una heladera con estas dos cosas, así que el rubro tiene dos productos y
 * no cuarenta.
 */
/**
 * Las pilas: tres marcas por cuatro tamaños.
 *
 * El tamaño va en el nombre y no en `contenido` a propósito: AA y AAA no son
 * una cantidad de nada, son un formato de envase con nombre propio. Meterlos
 * como número obligaría a inventar una unidad que no existe.
 */
/**
 * Los snacks que se venden, por marca y sabor.
 *
 * `gramos` sólo va donde está verificado contra el catálogo del distribuidor;
 * el resto queda sin tamaño y lo completa la primera compra. Un gramaje
 * inventado hace que el costo por unidad salga mal sin que nadie lo note.
 */
const SNACKS: {
  marca: string;
  rubro: string;
  variantes: string[];
  gramos?: number[];
}[] = [
  {
    marca: "Lays",
    rubro: "Papas fritas",
    variantes: ["clásicas", "jamón serrano", "cebolla"],
  },
  {
    marca: "Krachitos",
    rubro: "Papas fritas",
    variantes: ["cheddar", "crema y cebolla"],
    gramos: [55, 90],
  },
  { marca: "Krachitos", rubro: "Papas fritas", variantes: ["ketchup"] },
  {
    marca: "Krachitos",
    rubro: "Snacks salados",
    variantes: ["chizitos queso"],
    gramos: [60, 125, 240],
  },
  { marca: "PEP", rubro: "Snacks salados", variantes: ["chizitos"] },
  { marca: "PEP", rubro: "Snacks salados", variantes: ["palitos"] },
  {
    marca: "PEP",
    rubro: "Snacks salados",
    variantes: ["rueditas"],
    gramos: [40, 71, 120],
  },
];

/**
 * Las maquinitas. Se compran de a tira y se venden de a una: eso NO es un
 * producto distinto, es la misma maquinita comprada por bulto, y por eso el
 * "de a cuántas viene la tira" va en la compra y no acá.
 */
/**
 * Los energizantes y los nachos, que se nombran por color o por tamaño y no por
 * el nombre comercial.
 *
 * Monster va con 473 ml, que es la única lata que se vende acá. La verde, la
 * blanca (Ultra) y Mango Loco están verificadas contra el catálogo de las
 * tiendas; la roja y la rosa no aparecen en ninguna, así que van igual pero sin
 * que nadie les invente un código.
 *
 * De Doritos sólo el de queso tiene gramaje verificado: 40 g el chico y 77 g el
 * mediano. El de jamón NO figura en ningún catálogo online —hay queso, sweet
 * chili, pizza y flamin' hot— así que va sin tamaño hasta que lo diga una
 * factura.
 */
const MONSTER: { nombre: string; ml: number }[] = [
  { nombre: "Monster común 473 ml", ml: 473 },
  { nombre: "Monster Ultra blanca 473 ml", ml: 473 },
  { nombre: "Monster Mango Loco 473 ml", ml: 473 },
  { nombre: "Monster roja 473 ml", ml: 473 },
  { nombre: "Monster rosa 473 ml", ml: 473 },
];

const DORITOS: { nombre: string; gr?: number }[] = [
  { nombre: "Doritos queso 40 g", gr: 40 },
  { nombre: "Doritos queso 77 g", gr: 77 },
  { nombre: "Doritos jamón chico" },
  { nombre: "Doritos jamón mediano" },
];

const MAQUINITAS: { marca: string; nombre: string }[] = [
  { marca: "Gillette", nombre: "Maquinita Gillette Prestobarba 3 verde" },
  { marca: "Gillette", nombre: "Maquinita Gillette Prestobarba 2" },
  { marca: "Gillette", nombre: "Maquinita Gillette mujer 3 filos" },
];

const PILAS: { marca: string; tamaños: string[] }[] = [
  { marca: "Duracell", tamaños: ["AA", "AAA", "C", "D"] },
  { marca: "Energizer", tamaños: ["AA", "AAA", "C", "D"] },
  { marca: "Eveready", tamaños: ["AA", "AAA", "C", "D"] },
];

const CHUPETINES: { marca: string; nombre: string }[] = [
  { marca: "Pop", nombre: "Chupetín Pop" },
  { marca: "Pop", nombre: "Chupetín Pop con chicle" },
  { marca: "Pico Dulce", nombre: "Chupetín Pico Dulce" },
];

const LACTEOS: { marca: string; nombre: string; gr?: number }[] = [
  { marca: "Las 3 Niñas", nombre: "Leche Las 3 Niñas" },
  { marca: "La Serenísima", nombre: "Queso rallado La Serenísima chico" },
];

/**
 * Los rubros donde este archivo es la ÚNICA verdad.
 *
 * En estos, lo que no está acá abajo no se vende, y por eso al final se borra
 * lo que sobre. Es la respuesta al problema que se repitió seis veces: el
 * importador metía marcas y formatos que el kiosco no tiene —Coca de 1,75 L,
 * veinte energizantes, cuarenta jugos— y había que podar rubro por rubro
 * después de cada corrida.
 *
 * Los rubros que NO están acá (golosinas, limpieza, librería) se llenan con lo
 * que traiga el importador, porque ahí todavía no hay nada cargado a mano.
 */
const RUBROS_PROPIOS = [
  "Gaseosas",
  "Aguas",
  "Aguas saborizadas",
  "Jugos",
  "Energizantes",
  "Alcohol",
  "Helados",
  "Lácteos",
  "Chupetines",
  "Pilas",
  "Papas fritas",
  "Snacks salados",
  "Maquinitas de afeitar",
];

/** A quién se le compran los helados y las golosinas. */
const PROVEEDOR_HELADOS = "Arcor";

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
  let actualizados = 0;
  /** Los nombres que genera este archivo: todo lo demás sobra. */
  const generados = new Set<string>();

  async function guardar(
    marcaId: string,
    rubro: string,
    marca: string,
    variante: string,
    formato: Formato,
  ) {
    const nombre = nombrar(marca, variante, formato.etiqueta);
    generados.add(normalizarNombre(nombre));
    const [producto] = await db
      .insert(productos)
      .values({
        nombre,
        nombreNormalizado: normalizarNombre(nombre),
        marcaId,
        categoriaId: idPorRubro.get(rubro) ?? null,
        contenido: formato.ml,
        contenidoUnidad: formato.unidad ?? "ml",
        envase: formato.envase,
      })
      .onConflictDoNothing({ target: productos.nombreNormalizado })
      .returning();

    if (producto) {
      creados += 1;
      return;
    }

    // Ya existía: se le corrige la clasificación, porque este archivo es la
    // fuente de verdad de eso. Cambiar un rubro acá y volver a correr tiene que
    // mover los productos, si no la única forma de reclasificar es a mano uno
    // por uno.
    //
    // Lo que NO se toca es lo que se carga desde la app: el precio de venta, la
    // marca de "falta" y el proveedor. Eso lo sabe el mostrador, no el archivo.
    await db
      .update(productos)
      .set({
        marcaId,
        categoriaId: idPorRubro.get(rubro) ?? null,
        contenido: formato.ml,
        contenidoUnidad: formato.unidad ?? "ml",
        envase: formato.envase,
      })
      .where(eq(productos.nombreNormalizado, normalizarNombre(nombre)));
    actualizados += 1;
  }

  for (const linea of CATALOGO) {
    const marcaId = await idDe(marcas, linea.marca);
    for (const variante of linea.variantes) {
      for (const formato of linea.formatos) {
        await guardar(marcaId, linea.rubro, linea.marca, variante, formato);
      }
    }
  }

  for (const item of SIN_TAMANO) {
    generados.add(normalizarNombre(item.nombre ?? item.marca));
    const marcaId = item.marca ? await idDe(marcas, item.marca) : null;
    const nombre = item.nombre ?? item.marca;
    const [producto] = await db
      .insert(productos)
      .values({
        nombre,
        nombreNormalizado: normalizarNombre(nombre),
        marcaId,
        categoriaId: idPorRubro.get(item.rubro) ?? null,
      })
      .onConflictDoNothing({ target: productos.nombreNormalizado })
      .returning();

    if (producto) {
      creados += 1;
      continue;
    }

    // Sin contenido ni envase: acá no se sabe, y pisar con null lo que alguien
    // completó a mano en la ficha sería borrarle el trabajo.
    await db
      .update(productos)
      .set({ marcaId, categoriaId: idPorRubro.get(item.rubro) ?? null })
      .where(eq(productos.nombreNormalizado, normalizarNombre(nombre)));
    actualizados += 1;
  }

  for (const linea of SNACKS) {
    const marcaId = await idDe(marcas, linea.marca);
    for (const variante of linea.variantes) {
      // Sin gramaje declarado va un solo producto; con gramajes, uno por cada.
      const medidas: (number | null)[] = linea.gramos ?? [null];
      for (const gramos of medidas) {
        const nombre = [linea.marca, variante, gramos ? `${gramos} g` : ""]
          .filter(Boolean)
          .join(" ");
        generados.add(normalizarNombre(nombre));
        const [nuevo] = await db
          .insert(productos)
          .values({
            nombre,
            nombreNormalizado: normalizarNombre(nombre),
            marcaId,
            categoriaId: idPorRubro.get(linea.rubro) ?? null,
            contenido: gramos,
            contenidoUnidad: gramos ? "gr" : null,
          })
          .onConflictDoNothing({ target: productos.nombreNormalizado })
          .returning();

        if (nuevo) creados += 1;
        else {
          await db
            .update(productos)
            .set({ marcaId, categoriaId: idPorRubro.get(linea.rubro) ?? null })
            .where(eq(productos.nombreNormalizado, normalizarNombre(nombre)));
          actualizados += 1;
        }
      }
    }
  }

  {
    const marcaMonster = await idDe(marcas, "Monster");
    for (const lata of MONSTER) {
      generados.add(normalizarNombre(lata.nombre));
      const [nueva] = await db
        .insert(productos)
        .values({
          nombre: lata.nombre,
          nombreNormalizado: normalizarNombre(lata.nombre),
          marcaId: marcaMonster,
          categoriaId: idPorRubro.get("Energizantes") ?? null,
          contenido: lata.ml,
          contenidoUnidad: "ml",
          envase: "lata",
        })
        .onConflictDoNothing({ target: productos.nombreNormalizado })
        .returning();
      if (nueva) creados += 1;
      else actualizados += 1;
    }

    const marcaDoritos = await idDe(marcas, "Doritos");
    for (const bolsa of DORITOS) {
      generados.add(normalizarNombre(bolsa.nombre));
      const [nueva] = await db
        .insert(productos)
        .values({
          nombre: bolsa.nombre,
          nombreNormalizado: normalizarNombre(bolsa.nombre),
          marcaId: marcaDoritos,
          categoriaId: idPorRubro.get("Snacks salados") ?? null,
          contenido: bolsa.gr ?? null,
          contenidoUnidad: bolsa.gr ? "gr" : null,
        })
        .onConflictDoNothing({ target: productos.nombreNormalizado })
        .returning();
      if (nueva) creados += 1;
      else actualizados += 1;
    }
  }

  for (const maquinita of MAQUINITAS) {
    generados.add(normalizarNombre(maquinita.nombre));
    const marcaId = await idDe(marcas, maquinita.marca);
    const [nueva] = await db
      .insert(productos)
      .values({
        nombre: maquinita.nombre,
        nombreNormalizado: normalizarNombre(maquinita.nombre),
        marcaId,
        categoriaId: idPorRubro.get("Maquinitas de afeitar") ?? null,
      })
      .onConflictDoNothing({ target: productos.nombreNormalizado })
      .returning();

    if (nueva) creados += 1;
    else {
      await db
        .update(productos)
        .set({
          marcaId,
          categoriaId: idPorRubro.get("Maquinitas de afeitar") ?? null,
        })
        .where(
          eq(productos.nombreNormalizado, normalizarNombre(maquinita.nombre)),
        );
      actualizados += 1;
    }
  }

  for (const linea of PILAS) {
    const marcaId = await idDe(marcas, linea.marca);
    for (const tamaño of linea.tamaños) {
      const nombre = `Pila ${linea.marca} ${tamaño}`;
      generados.add(normalizarNombre(nombre));
      const [nueva] = await db
        .insert(productos)
        .values({
          nombre,
          nombreNormalizado: normalizarNombre(nombre),
          marcaId,
          categoriaId: idPorRubro.get("Pilas") ?? null,
        })
        .onConflictDoNothing({ target: productos.nombreNormalizado })
        .returning();

      if (nueva) creados += 1;
      else {
        await db
          .update(productos)
          .set({ marcaId, categoriaId: idPorRubro.get("Pilas") ?? null })
          .where(eq(productos.nombreNormalizado, normalizarNombre(nombre)));
        actualizados += 1;
      }
    }
  }

  for (const lacteo of LACTEOS) {
    generados.add(normalizarNombre(lacteo.nombre));
    const marcaId = await idDe(marcas, lacteo.marca);
    const [nuevo] = await db
      .insert(productos)
      .values({
        nombre: lacteo.nombre,
        nombreNormalizado: normalizarNombre(lacteo.nombre),
        marcaId,
        categoriaId: idPorRubro.get("Lácteos") ?? null,
        contenido: lacteo.gr ?? null,
        contenidoUnidad: lacteo.gr ? "gr" : null,
      })
      .onConflictDoNothing({ target: productos.nombreNormalizado })
      .returning();

    if (nuevo) creados += 1;
    else {
      await db
        .update(productos)
        .set({ marcaId, categoriaId: idPorRubro.get("Lácteos") ?? null })
        .where(eq(productos.nombreNormalizado, normalizarNombre(lacteo.nombre)));
      actualizados += 1;
    }
  }

  // Helados de impulso: marca del envoltorio, proveedor Arcor.
  {
    const normalizado = normalizarNombre(PROVEEDOR_HELADOS);
    const [creado] = await db
      .insert(proveedores)
      .values({ nombre: PROVEEDOR_HELADOS, nombreNormalizado: normalizado })
      .onConflictDoNothing({ target: proveedores.nombreNormalizado })
      .returning();
    let proveedorId = creado?.id ?? null;
    if (!proveedorId) {
      const [existente] = await db
        .select()
        .from(proveedores)
        .where(eq(proveedores.nombreNormalizado, normalizado));
      proveedorId = existente?.id ?? null;
    }

    for (const chupetin of CHUPETINES) {
      generados.add(normalizarNombre(chupetin.nombre));
      const marcaId = await idDe(marcas, chupetin.marca);
      const [nuevo] = await db
        .insert(productos)
        .values({
          nombre: chupetin.nombre,
          nombreNormalizado: normalizarNombre(chupetin.nombre),
          marcaId,
          proveedorId,
          categoriaId: idPorRubro.get("Chupetines") ?? null,
        })
        .onConflictDoNothing({ target: productos.nombreNormalizado })
        .returning();

      if (nuevo) creados += 1;
      else {
        await db
          .update(productos)
          .set({ marcaId, categoriaId: idPorRubro.get("Chupetines") ?? null })
          .where(
            eq(productos.nombreNormalizado, normalizarNombre(chupetin.nombre)),
          );
        actualizados += 1;
      }
    }

    for (const helado of HELADOS_ARCOR) {
      generados.add(normalizarNombre(helado.nombre));
      const marcaId = await idDe(marcas, helado.marca);
      const [nuevo] = await db
        .insert(productos)
        .values({
          nombre: helado.nombre,
          nombreNormalizado: normalizarNombre(helado.nombre),
          marcaId,
          proveedorId,
          categoriaId: idPorRubro.get("Helados") ?? null,
          contenido: helado.cc ?? null,
          contenidoUnidad: helado.cc ? "ml" : null,
          envase: "otro",
        })
        .onConflictDoNothing({ target: productos.nombreNormalizado })
        .returning();

      if (nuevo) {
        creados += 1;
        continue;
      }
      await db
        .update(productos)
        .set({ marcaId, categoriaId: idPorRubro.get("Helados") ?? null })
        .where(eq(productos.nombreNormalizado, normalizarNombre(helado.nombre)));
      actualizados += 1;
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

  /*
   * En los rubros propios, lo que no generó este archivo se va.
   *
   * Con dos excepciones que no se tocan: si el producto tiene compras encima o
   * si alguien le puso precio de venta, es porque se usa de verdad. Borrarlo
   * seria pisarle el trabajo a quien lo cargó.
   */
  let sobrantes = 0;
  for (const rubro of RUBROS_PROPIOS) {
    const rubroId = idPorRubro.get(rubro);
    if (!rubroId) continue;

    const deMas = await db
      .select({
        id: productos.id,
        nombre: productos.nombre,
        precio: productos.precioVentaCentavos,
      })
      .from(productos)
      .where(
        and(
          eq(productos.categoriaId, rubroId),
          notInArray(productos.nombreNormalizado, [...generados]),
        ),
      );

    for (const producto of deMas) {
      if (producto.precio != null) continue;

      const [usado] = await db
        .select({ id: comprasItems.id })
        .from(comprasItems)
        .where(eq(comprasItems.productoId, producto.id))
        .limit(1);
      if (usado) continue;

      await db.delete(productos).where(eq(productos.id, producto.id));
      sobrantes += 1;
    }
  }
  if (sobrantes) {
    console.log(
      `${sobrantes} productos sobraban en los rubros propios y se sacaron.`,
    );
  }

  /*
   * Los rubros que se sacaron del archivo quedan colgados: sin productos, pero
   * apareciendo en el desplegable de la ficha. Se borran, con una condición que
   * no se negocia: SÓLO si no les quedó ningún producto adentro.
   *
   * Si todavía tienen alguno, se avisa y no se toca. Borrar un rubro con
   * productos los dejaría sin clasificar en silencio, que es peor que un ítem
   * de más en una lista.
   */
  const vivas = new Set(
    [...Object.keys(SUBCATEGORIAS), ...Object.values(SUBCATEGORIAS)].map(
      normalizarNombre,
    ),
  );

  const todas = await db.select().from(categorias);
  for (const categoria of todas) {
    if (vivas.has(categoria.nombreNormalizado)) continue;

    const usada = await db
      .select({ id: productos.id })
      .from(productos)
      .where(eq(productos.categoriaId, categoria.id))
      .limit(1);

    if (usada.length) {
      console.log(
        `"${categoria.nombre}" ya no está en el archivo pero tiene productos: se deja.`,
      );
      continue;
    }

    await db.delete(categorias).where(eq(categorias.id, categoria.id));
    console.log(`"${categoria.nombre}" quedó vacío y se sacó.`);
  }

  console.log(
    `${creados} productos nuevos, ${actualizados} actualizados.`,
  );
  await cliente.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
