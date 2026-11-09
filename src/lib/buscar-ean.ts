import "server-only";

import { eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { marcas, productos } from "@/db/schema";
import { codigoValido } from "@/lib/codigos";
import { normalizarNombre } from "@/lib/nombres";

/**
 * Identificar un código de barras que el kiosco todavía no tiene cargado.
 *
 * ── Por qué existe ────────────────────────────────────────────────────────
 * De los productos del catálogo, una parte no tiene `codigo_barras`. Cuando
 * alguien escanea uno de ésos, el mostrador no lo encuentra y hay que cargarlo
 * a mano con el cliente esperando. Esto resuelve el caso en un toque: se le
 * pregunta a los catálogos de los supermercados qué producto es ese EAN, y con
 * eso se da de alta con nombre, marca y foto.
 *
 * ── De dónde sale el dato ─────────────────────────────────────────────────
 * Los cuatro supermercados grandes de Argentina corren sobre VTEX, que expone
 * el catálogo sin clave en `/api/catalog_system/pub/products/search`. El filtro
 * `fq=alternateIds_Ean:` busca por código exacto. Son las mismas tiendas que ya
 * usa `scripts/importar.ts`, elegidas por lo mismo: es catálogo ARGENTINO, con
 * los envases y formatos que de verdad se venden acá. Una base internacional
 * de EAN no tiene la mitad de esto.
 *
 * ── La regla que no se negocia ────────────────────────────────────────────
 * `CLAUDE.md`: «el código de barras no se adivina». Un código equivocado no
 * falla ruidosamente —escanea y trae otro producto, que es peor que no
 * tenerlo—, así que acá:
 *
 *  1. El EAN que contesta la tienda tiene que ser EXACTAMENTE el que se
 *     escaneó. Sin eso, la búsqueda por código podría caer en la búsqueda por
 *     texto de VTEX y devolver un pariente.
 *  2. Si una tienda devuelve más de un producto para un código, esa tienda se
 *     descarta entera. Igual que el importador: ante la duda no elige ninguno.
 *  3. El dígito verificador se chequea ANTES de salir a la red. Un código mal
 *     leído no se busca.
 *
 * ── Y lo que no hace ──────────────────────────────────────────────────────
 * No escribe nada. Devuelve un candidato para que una persona lo confirme. El
 * alta la hace `identificarCodigo` en `acciones.ts`, después del toque.
 */

/** Las mismas que usa el importador, en el orden en que se les pregunta. */
const TIENDAS = [
  { nombre: "Jumbo", base: "https://www.jumbo.com.ar" },
  { nombre: "Carrefour", base: "https://www.carrefour.com.ar" },
  { nombre: "ChangoMas", base: "https://www.masonline.com.ar" },
  { nombre: "Disco", base: "https://www.disco.com.ar" },
] as const;

/**
 * Cuánto se espera a cada tienda.
 *
 * Corto a propósito: hay un cliente en el mostrador. Si la tienda no contesta
 * en ese tiempo, se pasa a la siguiente y, si no contesta ninguna, se carga a
 * mano. La venta nunca espera a un catálogo ajeno.
 */
const ESPERA_MS = 4000;

type ProductoVtex = {
  productName?: string;
  brand?: string;
  items?: {
    ean?: string;
    images?: { imageUrl?: string }[];
  }[];
};

export type CandidatoEan = {
  codigo: string;
  nombre: string;
  marca: string | null;
  imagenUrl: string | null;
  /** qué catálogo lo reconoció, para poder mostrarlo y que se entienda */
  fuente: string;
};

/**
 * "Gaseosa Coca-cola Sabor Original 354 Ml" → "Coca-cola Sabor Original 354 ml"
 *
 * Los nombres de góndola del supermercado arrancan con el tipo de producto en
 * mayúscula y repiten la marca. Se limpia lo mínimo para que el renglón del
 * carrito se lea; el nombre se puede corregir después desde Stock.
 */
function acomodarNombre(crudo: string, marca: string | null): string {
  let nombre = crudo.replace(/\s+/g, " ").trim();

  /*
   * La marca viene repetida adentro del nombre, y escrita distinto de como
   * viene en el campo `brand`: el nombre dice "Coca-cola" y la marca dice
   * "COCA COLA". Comparar el texto tal cual deja la marca dos veces
   * ("Coca Cola Gaseosa Sabor Original 600 ml Coca-cola"), así que se comparan
   * palabras sin acentos, sin guiones y en minúscula.
   *
   * Sólo se saca lo que es la marca: para "Gaseosa Cola 500 Ml Pepsi" la marca
   * es "Pepsi" y "Cola" se queda, porque ahí describe el sabor.
   */
  if (marca) {
    const formas = new Set(
      [marca, ...marca.split(/\s+/)].map(aplanar).filter(Boolean),
    );
    const sinMarca = nombre
      .split(/\s+/)
      .filter((palabra) => !formas.has(aplanar(palabra)))
      .join(" ")
      .trim();
    // "Schneider" solo tiene que seguir siendo "Schneider", no quedar vacío.
    if (sinMarca.length >= 4) nombre = `${marca} ${sinMarca}`;
  }

  // "354 Ml" → "354 ml", "1,5 Lts" → "1,5 L": las unidades van en minúscula y
  // abreviadas igual que en el resto del catálogo.
  nombre = nombre
    .replace(/(\d)\s*(?:ml|mL|Ml|ML)\b/g, "$1 ml")
    .replace(/(\d)\s*(?:lts?|Lts?|LTS?|L)\b/g, "$1 L")
    .replace(/(\d)\s*(?:grs?|Grs?|GRS?|G)\b/g, "$1 g")
    .replace(/(\d)\s*(?:kgs?|Kgs?|KGS?)\b/g, "$1 kg")
    .replace(/(\d)\s*(?:cc|Cc|CC)\b/g, "$1 cc");

  return nombre.replace(/\s+/g, " ").trim();
}

/** "Coca-cola" y "COCA COLA" caen las dos en "cocacola". */
function aplanar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** "COCA COLA" → "Coca Cola" (igual que el importador). */
function acomodarMarca(marca: string): string {
  return marca
    .replace(/´/g, "'")
    .toLowerCase()
    .split(/\s+/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ")
    .trim();
}

async function preguntarA(
  tienda: (typeof TIENDAS)[number],
  codigo: string,
): Promise<CandidatoEan | null> {
  const url =
    `${tienda.base}/api/catalog_system/pub/products/search` +
    `?fq=alternateIds_Ean:${encodeURIComponent(codigo)}&_from=0&_to=4`;

  let crudos: ProductoVtex[];
  try {
    const respuesta = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(ESPERA_MS),
      cache: "no-store",
    });
    if (!respuesta.ok) return null;
    const cuerpo: unknown = await respuesta.json();
    if (!Array.isArray(cuerpo)) return null;
    crudos = cuerpo as ProductoVtex[];
  } catch {
    // Tienda caída, lenta o que cambió la API: se prueba la que sigue.
    return null;
  }

  // Más de un producto para un mismo código: no se elige ninguno.
  const exactos = crudos.filter((c) =>
    c.items?.some((i) => i.ean?.trim() === codigo),
  );
  if (exactos.length !== 1) return null;

  const crudo = exactos[0];
  const nombreCrudo = crudo.productName?.trim();
  if (!nombreCrudo) return null;

  const marca = crudo.brand?.trim() ? acomodarMarca(crudo.brand.trim()) : null;
  const item = crudo.items?.find((i) => i.ean?.trim() === codigo);
  const imagen = item?.images?.[0]?.imageUrl?.trim() || null;

  return {
    codigo,
    nombre: acomodarNombre(nombreCrudo, marca),
    marca,
    imagenUrl: imagen,
    fuente: tienda.nombre,
  };
}

/**
 * Le pregunta a las tiendas, en orden, hasta que una reconozca el código.
 *
 * Se para en la PRIMERA que contesta bien en vez de preguntarle a todas y
 * comparar: cuatro consultas en serie son cuatro veces la espera, y el que
 * atiende no puede quedarse mirando la pantalla. Las cuatro tiendas devuelven
 * el mismo producto para el mismo EAN —está probado— así que la segunda
 * opinión no agrega nada y sí cuesta segundos.
 */
export async function identificarEan(
  codigo: string,
): Promise<CandidatoEan | null> {
  const limpio = codigo.trim();
  if (!codigoValido(limpio)) return null;

  for (const tienda of TIENDAS) {
    const candidato = await preguntarA(tienda, limpio);
    if (candidato) return candidato;
  }
  return null;
}

/**
 * "600 ml" / "1,5 L" / "500 Grs" → { contenido: 600, unidad: "ml" }
 *
 * Todo se lleva a ml o gr, que es como lo guarda `productos.contenido`: así
 * "1,5 L" y "1500 ml" son el mismo envase y no dos.
 */
function leerContenido(
  nombre: string,
): { contenido: number; unidad: "ml" | "gr" } | null {
  const m = nombre.match(
    /(\d+(?:[.,]\d+)?)\s*(lts?|litros?|l|ml|cc|kg|kilos?|grs?|gr|g)\b/i,
  );
  if (!m) return null;
  const numero = Number(m[1].replace(",", "."));
  if (!Number.isFinite(numero) || numero <= 0) return null;

  const u = m[2].toLowerCase();
  if (/^(lts?|litros?|l)$/.test(u))
    return { contenido: Math.round(numero * 1000), unidad: "ml" };
  if (/^(ml|cc)$/.test(u))
    return { contenido: Math.round(numero), unidad: "ml" };
  if (/^(kg|kilos?)$/.test(u))
    return { contenido: Math.round(numero * 1000), unidad: "gr" };
  return { contenido: Math.round(numero), unidad: "gr" };
}

export type Parecido = {
  id: string;
  nombre: string;
  marca: string | null;
  imagenUrl: string | null;
  /** si ya tiene OTRO código, pegarle éste sería pisarlo */
  codigoBarras: string | null;
  /** por qué se parece, para poder decirlo en pantalla */
  porque: "mismo nombre" | "misma marca y tamaño";
};

/**
 * ¿Este producto ya está en el catálogo, con otro nombre y sin su código?
 *
 * ── El duplicado que esto evita ───────────────────────────────────────────
 * De los 418 productos del catálogo, una parte no tiene código. Si alguien
 * escanea uno de ésos, el supermercado lo identifica y —sin este paso— se
 * daría de alta UNO NUEVO: quedarían "Coca-Cola común 600 ml" (la del
 * catálogo, con su historial de compras) y "Coca Cola Gaseosa Sabor Original
 * 600 ml" (la recién creada, con el código). Dos filas para la misma botella,
 * el costo partido al medio y las ventas repartidas. Y no se nota: las dos
 * funcionan.
 *
 * ── Por qué con reglas y no con un modelo ─────────────────────────────────
 * Esto es comparar strings con una respuesta exacta, no una decisión de
 * criterio. `normalizarNombre()` es LA MISMA función que usa el índice único
 * de la base, así que lo que decide la pantalla es lo que va a decidir el
 * servidor. Un modelo acá sería peor en las tres cosas que importan: tarda
 * segundos con un cliente en el mostrador, para el mismo par de nombres puede
 * contestar distinto dos veces, y cuando se equivoca pega dos historiales de
 * costos que después nadie sabe desarmar.
 *
 * ── Y ante la duda, nada ──────────────────────────────────────────────────
 * Devuelve lo que se PARECE para que una persona elija. No fusiona solo.
 */
export async function buscarParecidos(
  candidato: CandidatoEan,
): Promise<Parecido[]> {
  const db = await getDb();
  const medida = leerContenido(candidato.nombre);
  const marcaNormal = candidato.marca
    ? normalizarNombre(candidato.marca)
    : null;

  const filas = await db
    .select({
      id: productos.id,
      nombre: productos.nombre,
      nombreNormalizado: productos.nombreNormalizado,
      marca: marcas.nombre,
      imagenUrl: productos.imagenUrl,
      codigoBarras: productos.codigoBarras,
      contenido: productos.contenido,
      contenidoUnidad: productos.contenidoUnidad,
    })
    .from(productos)
    .leftJoin(marcas, eq(marcas.id, productos.marcaId))
    .where(isNull(productos.archivadoEn));

  const buscado = normalizarNombre(candidato.nombre);
  const encontrados: Parecido[] = [];

  for (const f of filas) {
    const mismoNombre = f.nombreNormalizado === buscado;

    const mismaMarcaYTamano =
      !!marcaNormal &&
      !!f.marca &&
      normalizarNombre(f.marca) === marcaNormal &&
      !!medida &&
      f.contenido === medida.contenido &&
      f.contenidoUnidad === medida.unidad;

    if (!mismoNombre && !mismaMarcaYTamano) continue;

    encontrados.push({
      id: f.id,
      nombre: f.nombre,
      marca: f.marca,
      imagenUrl: f.imagenUrl,
      codigoBarras: f.codigoBarras,
      porque: mismoNombre ? "mismo nombre" : "misma marca y tamaño",
    });
  }

  /*
   * Marca y tamaño aciertan el GRUPO, no la variante: "Monster 473 ml" da los
   * cinco Monster que hay de 473, y "Coca Cola 600" da la común y la zero. Por
   * eso lo que sigue ordena por sabor en vez de filtrar — el sabor se decide
   * con un toque, pero el que más probablemente sea va primero.
   */
  encontrados.sort((a, b) => {
    const fuerte = (p: Parecido) => (p.porque === "mismo nombre" ? 1 : 0);
    const dif = fuerte(b) - fuerte(a);
    if (dif) return dif;
    return puntajeDeVariante(candidato.nombre, b.nombre) -
      puntajeDeVariante(candidato.nombre, a.nombre);
  });
  return encontrados.slice(0, 5);
}

/**
 * Familias de palabras que nombran la MISMA variante de las dos maneras.
 *
 * El supermercado escribe "Sabor Original" y acá se le dice "común"; escribe
 * "Sin Azúcar" y acá es "zero". Sin esta tabla las dos coincidencias valen
 * igual y el orden lo decide el alfabeto, que no sabe nada.
 *
 * Son las que de verdad aparecen en un kiosco. Es a propósito que sea corta y
 * escrita a mano: cada línea es una decisión que se puede leer y discutir, y
 * agregar una no puede romper las otras.
 */
const VARIANTES: string[][] = [
  ["original", "comun", "clasica", "clasico", "regular", "roja"],
  ["sinazucar", "zero", "light", "cero", "diet"],
  ["blanca", "ultra", "white"],
  ["pomelo", "grapefruit"],
  ["naranja", "orange"],
  ["limon", "lima", "lemon"],
  ["pera"],
  ["mango", "mangoloco"],
  ["manzana"],
  ["uva"],
  ["durazno"],
  ["rubia", "lager"],
  ["negra", "stout", "porter"],
  ["retornable"],
  ["lata"],
];

/**
 * Cuántas familias de variante comparten los dos nombres.
 *
 * Suma, no filtra: un cero acá no descarta nada, sólo lo manda más abajo en la
 * lista. Que la variante no se pueda deducir es un resultado válido —el sabor
 * lo sabe quien tiene el envase en la mano, no nosotros.
 */
function puntajeDeVariante(delCatalogo: string, delKiosco: string): number {
  const a = aplanar(delCatalogo);
  const b = aplanar(delKiosco);
  let puntos = 0;
  for (const familia of VARIANTES) {
    if (familia.some((p) => a.includes(p)) && familia.some((p) => b.includes(p))) {
      puntos++;
    }
  }
  return puntos;
}
