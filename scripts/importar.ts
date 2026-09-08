/**
 * Trae productos reales —con su código de barras— desde el catálogo público de
 * Jumbo, y los cruza contra los que ya están cargados.
 *
 *   npm run db:importar              # muestra qué haría, no toca nada
 *   npm run db:importar -- --aplicar # lo escribe
 *   npm run db:completar             # busca UNO POR UNO los que no tienen código
 *   npm run db:completar -- --aplicar
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
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import {
  categorias,
  marcas,
  productos,
  proveedores,
} from "../src/db/schema.ts";
import { normalizarNombre } from "../src/lib/nombres.ts";

type DB = PgliteDatabase<Record<string, never>>;

const TIENDA = "https://www.jumbo.com.ar";

/** Cuántos productos traer por búsqueda. Más que esto es más ruido que datos. */
const POR_BUSQUEDA = 24;

/**
 * Qué buscar y en qué rubro cae lo que venga.
 *
 * `soloEnriquecer` es la diferencia importante entre los dos tipos de rubro:
 *
 * - Los que YA están curados a mano (todas las bebidas) saben exactamente qué
 *   se vende. Ahí el importador no agrega nada: sólo le completa el código de
 *   barras y la foto a lo que ya existe. Sin esto, cada corrida metía cuarenta
 *   gaseosas y jugos de marcas que el kiosco no tiene, y había que podarlas
 *   una por una.
 * - Los que están vacíos (golosinas, limpieza, librería) sí se llenan con lo
 *   que venga: ahí traer de más y podar después es más rápido que cargar a
 *   mano.
 *
 * `soloMarcas` es el caso del medio: el rubro se llena, pero sólo con esas
 * marcas.
 */
const BUSQUEDAS: {
  termino: string;
  rubro: string;
  soloMarcas?: string[];
  soloEnriquecer?: boolean;
}[] = [
  { termino: "gaseosa", rubro: "Gaseosas", soloEnriquecer: true },
  { termino: "agua saborizada", rubro: "Aguas saborizadas", soloEnriquecer: true },
  { termino: "agua mineral", rubro: "Aguas", soloEnriquecer: true },
  { termino: "jugo", rubro: "Jugos", soloEnriquecer: true },
  { termino: "cerveza lata", rubro: "Alcohol", soloEnriquecer: true },
  { termino: "energizante", rubro: "Energizantes", soloEnriquecer: true },
  { termino: "papas fritas", rubro: "Papas fritas" },
  { termino: "palitos snack", rubro: "Snacks salados" },
  { termino: "galletitas", rubro: "Galletitas" },
  { termino: "alfajor", rubro: "Alfajores" },
  { termino: "chocolate", rubro: "Chocolates" },
  { termino: "caramelos", rubro: "Caramelos" },
  { termino: "chupetines", rubro: "Chupetines", soloEnriquecer: true },
  { termino: "chicles", rubro: "Chicles" },
  { termino: "pastillas", rubro: "Pastillas" },
  { termino: "gomitas", rubro: "Gomitas" },
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

/**
 * A quién se le compra cada rubro, cuando hay uno claro.
 *
 * Es un punto de partida, no la verdad: el proveedor definitivo lo escribe la
 * primera compra que se cargue. Pero tenerlo puesto de entrada evita arrancar
 * con 300 productos sin proveedor.
 */
const PROVEEDOR_POR_RUBRO: Record<string, string> = {
  Alfajores: "Arcor",
  Chocolates: "Arcor",
  Caramelos: "Arcor",
  Chupetines: "Arcor",
  Chicles: "Arcor",
  Pastillas: "Arcor",
  Gomitas: "Arcor",
  Helados: "Arcor",
};

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

/**
 * Palabras que no distinguen un producto de otro: están en todos los nombres
 * del rubro. Lo que queda después de sacarlas es el sabor, que es justo lo que
 * diferencia a la Levite de pomelo de la de pera.
 */
const RELLENO = new Set([
  "agua",
  "aguas",
  "saborizada",
  "saborizado",
  "cero",
  "sabor",
  "gaseosa",
  "jugo",
  "bebida",
  "light",
  "sin",
  "azucar",
  "con",
  "de",
  "del",
  "la",
  "el",
  "x",
  "lts",
  "lt",
  "l",
  "ml",
  "cc",
  "gr",
  "grs",
  "g",
  "kg",
]);

/**
 * Las palabras que de verdad identifican al producto: sin la marca, sin el
 * relleno del rubro y sin los números del envase.
 */
function señas(nombre: string, marca: string): string[] {
  const marcaPartes = new Set(normalizarNombre(marca).split(" "));
  return normalizarNombre(nombre)
    .split(" ")
    .filter(
      (palabra) =>
        palabra.length > 2 &&
        !RELLENO.has(palabra) &&
        !marcaPartes.has(palabra) &&
        !/^\d/.test(palabra),
    );
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

async function bajar(
  termino: string,
  rubro: string,
  soloMarcas?: string[],
): Promise<Traido[]> {
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

    const marcaLimpia = acomodarMarca(marca);
    if (
      soloMarcas?.length &&
      !soloMarcas.some(
        (m) => normalizarNombre(m) === normalizarNombre(marcaLimpia),
      )
    ) {
      continue;
    }

    const medida = leerContenido(nombre);
    traidos.push({
      nombre,
      marca: marcaLimpia,
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

/**
 * ¿Tiene alguna variante en vez de ser la común?
 *
 * La lista arrancó con zero y light y se le fue sumando lo que aparecía: "Life"
 * se coló en un dry-run y le pegó su código a la Coca común. Cada palabra de
 * acá es una versión distinta del producto, con su propio envase y su propio
 * código, y confundirla con la común es justo el error que hay que evitar.
 */
function tieneVariante(nombre: string): boolean {
  const texto = normalizarNombre(nombre);
  return (
    /\b(zero|cero|light|diet|life|stevia)\b/.test(texto) ||
    texto.includes("sin azucar")
  );
}

/**
 * ¿El nombre es de un pack y no de una unidad? "Pack 4", "220x8", "Lata X 12".
 * Un pack tiene su propio código, distinto al de la unidad que se vende suelta.
 */
function esPack(nombre: string): boolean {
  const texto = normalizarNombre(nombre);
  return /\bpack\b/.test(texto) || /\d\s*x\s*\d/.test(texto);
}

/**
 * Decide si dos nombres son el MISMO producto, y por default dice que no.
 *
 * Nació de un dry-run que casi mete códigos cruzados: la Coca común se estaba
 * quedando con el código de la Light, la zero con el de la original, y la
 * Sprite común y la zero con el mismo código de un pack de cuatro. Un código
 * equivocado no falla ruidosamente: escanea y trae otro producto.
 */
function esElMismo(
  local: { nombre: string; contenido: number | null; unidad: string | null },
  remoto: Traido,
  marca: string,
): boolean {
  // Un pack no es la unidad que se vende suelta.
  if (esPack(remoto.nombre)) return false;

  // El tamaño tiene que estar y tiene que ser el mismo. Sin esto, la de 600 ml
  // se queda con el código de la de 2,25.
  if (local.contenido == null || remoto.contenido == null) return false;
  if (local.contenido !== remoto.contenido) return false;
  if (local.unidad !== remoto.unidad) return false;

  // La común y cualquier variante son dos productos distintos, siempre.
  if (tieneVariante(local.nombre) !== tieneVariante(remoto.nombre)) return false;

  // El sabor: si el nombre local dice algo más que la marca y el tamaño, eso
  // tiene que aparecer del otro lado.
  const propias = señas(local.nombre, marca).filter(
    (palabra) => ![
        "comun",
        "zero",
        "cero",
        "light",
        "life",
        "diet",
      ].includes(palabra),
  );
  if (propias.length) {
    const suyas = new Set(normalizarNombre(remoto.nombre).split(" "));
    if (!propias.some((palabra) => suyas.has(palabra))) return false;
  }

  return true;
}

/**
 * Busca en la tienda un producto puntual, por su propio nombre.
 *
 * Es el modo lento y preciso: en vez de bajar un rubro entero y ver qué pega,
 * pregunta por cada producto que todavía no tiene código de barras. Sirve para
 * lo que nunca apareció en las búsquedas por rubro —una marca chica, un sabor
 * suelto— y para terminar de completar el catálogo sin agregar nada.
 */
async function buscarUno(nombre: string, marca: string): Promise<Traido[]> {
  // El nombre tal cual, que ya trae marca, sabor y tamaño.
  const url =
    `${TIENDA}/api/catalog_system/pub/products/search` +
    `?ft=${encodeURIComponent(nombre)}&_from=0&_to=9`;

  const respuesta = await fetch(url, { headers: { accept: "application/json" } });
  if (!respuesta.ok) return [];

  const crudos: ProductoVtex[] = await respuesta.json();
  const marcaBuscada = normalizarNombre(marca);
  const candidatos: Traido[] = [];

  for (const crudo of crudos) {
    const nombreVtex = crudo.productName?.trim();
    const marcaVtex = crudo.brand?.trim();
    const ean = crudo.items?.[0]?.ean?.trim();
    if (!nombreVtex || !marcaVtex || !ean || !codigoValido(ean)) continue;

    // La marca tiene que ser la misma. Sin eso, buscar "Chupetín Pop" trae
    // cualquier cosa que diga "pop" y se le pega el código de otro producto.
    const limpia = acomodarMarca(marcaVtex);
    if (marcaBuscada && normalizarNombre(limpia) !== marcaBuscada) continue;

    const medida = leerContenido(nombreVtex);
    candidatos.push({
      nombre: nombreVtex,
      marca: limpia,
      ean,
      imagen: crudo.items?.[0]?.images?.[0]?.imageUrl?.trim() ?? null,
      contenido: medida?.contenido ?? null,
      unidad: medida?.unidad ?? null,
      envase: leerEnvase(nombreVtex),
      rubro: "",
    });
  }

  return candidatos;
}

/**
 * Recorre los productos que no tienen código y busca cada uno.
 *
 * Sólo completa: no crea ni renombra nada. Y exige que el contenido coincida
 * cuando los dos lo declaran —una Coca de 600 ml no puede quedarse con el
 * código de la de 2,25— porque el nombre solo no alcanza para estar seguro.
 */
async function completar(db: DB, aplicar: boolean) {
  const pendientes = await db
    .select({
      id: productos.id,
      nombre: productos.nombre,
      contenido: productos.contenido,
      unidad: productos.contenidoUnidad,
      marca: marcas.nombre,
    })
    .from(productos)
    .leftJoin(marcas, eq(marcas.id, productos.marcaId))
    .where(and(isNull(productos.codigoBarras), isNull(productos.archivadoEn)));

  console.log(`${pendientes.length} productos sin código. Buscando uno por uno…\n`);

  /** Los códigos tomados en esta corrida: en dry-run todavía no están en la base. */
  const tomados = new Set<string>();
  let completados = 0;
  let sinSuerte = 0;
  let descartados = 0;

  for (const producto of pendientes) {
    const candidatos = await buscarUno(producto.nombre, producto.marca ?? "");
    await new Promise((seguir) => setTimeout(seguir, 350));

    if (!candidatos.length) {
      sinSuerte += 1;
      continue;
    }

    const iguales = candidatos.filter((c) =>
      esElMismo(producto, c, producto.marca ?? ""),
    );

    // Uno solo, o ninguno. Si dos pasan el filtro, no hay forma de saber cuál
    // es y elegir sería jugarse el código de un producto a cara o cruz.
    if (iguales.length !== 1) {
      descartados += 1;
      continue;
    }
    const encontrado = iguales[0];

    // Que no se lo lleve otro que ya lo tiene.
    if (tomados.has(encontrado.ean)) {
      descartados += 1;
      continue;
    }
    const [ocupado] = await db
      .select({ id: productos.id })
      .from(productos)
      .where(eq(productos.codigoBarras, encontrado.ean))
      .limit(1);
    if (ocupado) {
      descartados += 1;
      continue;
    }

    tomados.add(encontrado.ean);
    completados += 1;
    console.log(`  ${producto.nombre} ← ${encontrado.nombre} (${encontrado.ean})`);
    if (!aplicar) continue;

    await db
      .update(productos)
      .set({ codigoBarras: encontrado.ean, imagenUrl: encontrado.imagen })
      .where(eq(productos.id, producto.id));
  }

  console.log(
    `\n${completados} completados, ${sinSuerte} que la tienda no tiene, ` +
      `${descartados} descartados por no coincidir.`,
  );
  if (!aplicar) console.log("No se escribió nada.");
}

async function main() {
  const aplicar = process.argv.includes("--aplicar");

  const directorio = path.join(process.cwd(), ".data", "pg");
  fs.mkdirSync(directorio, { recursive: true });
  const cliente = new PGlite(directorio);
  const db = drizzle(cliente);
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });

  if (process.argv.includes("--completar")) {
    await completar(db, aplicar);
    await cliente.close();
    return;
  }

  console.log(
    aplicar
      ? "Importando de verdad.\n"
      : "Mostrando qué haría. Para escribirlo: npm run db:importar -- --aplicar\n",
  );

  const rubros = await db.select().from(categorias);
  const idPorRubro = new Map(
    rubros.map((r) => [normalizarNombre(r.nombre), r.id]),
  );

  /** Los proveedores que hacen falta según PROVEEDOR_POR_RUBRO. */
  const idPorProveedor = new Map<string, string>();
  async function proveedorDe(rubro: string): Promise<string | null> {
    const nombre = PROVEEDOR_POR_RUBRO[rubro];
    if (!nombre) return null;
    const yaEsta = idPorProveedor.get(nombre);
    if (yaEsta) return yaEsta;

    const normalizado = normalizarNombre(nombre);
    const [existente] = await db
      .select()
      .from(proveedores)
      .where(eq(proveedores.nombreNormalizado, normalizado));
    if (existente) {
      idPorProveedor.set(nombre, existente.id);
      return existente.id;
    }

    if (!aplicar) return null;
    const [creado] = await db
      .insert(proveedores)
      .values({ nombre, nombreNormalizado: normalizado })
      .onConflictDoNothing({ target: proveedores.nombreNormalizado })
      .returning();
    if (creado) idPorProveedor.set(nombre, creado.id);
    return creado?.id ?? null;
  }

  let enriquecidos = 0;
  let nuevos = 0;
  let ambiguos = 0;
  let sinRubro = 0;

  for (const busqueda of BUSQUEDAS) {
    const traidos = await bajar(
      busqueda.termino,
      busqueda.rubro,
      busqueda.soloMarcas,
    );
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
        /*
         * Varios del mismo tamaño y marca. Antes de rendirse, se compara por
         * sabor: "Agua Saborizada Cero Sabor Pomelo 1.5 Lts Levite" contra
         * "Levite pomelo 1,5 L" coincide en "pomelo", y las de pera y manzana
         * no. Sólo vale si queda UNO: si el sabor no alcanza para decidir,
         * elegir sería ponerle a un producto el código de otro.
         */
        const marcas_ = señas(traido.nombre, traido.marca);
        const porSabor = candidatos.filter((c) => {
          const suyas = normalizarNombre(c.nombre).split(" ");
          return marcas_.some((palabra) => suyas.includes(palabra));
        });

        if (porSabor.length === 1) {
          enriquecidos += 1;
          enriquecidosAca += 1;
          if (aplicar) {
            await db
              .update(productos)
              .set({ codigoBarras: traido.ean, imagenUrl: traido.imagen })
              .where(eq(productos.id, porSabor[0].id));
          }
          continue;
        }

        ambiguos += 1;
        console.log(
          `  ambiguo: "${traido.nombre}" podría ser ${candidatos
            .map((c) => `"${c.nombre}"`)
            .join(" o ")}`,
        );
        continue;
      }

      // Rubro curado: lo que no está cargado es porque no se vende.
      if (busqueda.soloEnriquecer) continue;

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
          proveedorId: await proveedorDe(busqueda.rubro),
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

  /*
   * Los rubros con proveedor conocido que ya estaban cargados sin él: se les
   * pone ahora. Sólo a los que NO tienen ninguno — si alguien ya le puso uno, o
   * si lo escribió una compra, ese manda.
   */
  let conProveedor = 0;
  for (const rubro of Object.keys(PROVEEDOR_POR_RUBRO)) {
    const rubroId = idPorRubro.get(normalizarNombre(rubro));
    if (!rubroId) continue;

    const sinProveedor = and(
      eq(productos.categoriaId, rubroId),
      isNull(productos.proveedorId),
      isNull(productos.archivadoEn),
    );

    const huerfanos = await db
      .select({ id: productos.id })
      .from(productos)
      .where(sinProveedor);
    if (!huerfanos.length) continue;

    conProveedor += huerfanos.length;
    if (!aplicar) continue;

    const proveedorId = await proveedorDe(rubro);
    if (!proveedorId) continue;
    await db.update(productos).set({ proveedorId }).where(sinProveedor);
    console.log(
      `${rubro}: ${huerfanos.length} quedaron con ${PROVEEDOR_POR_RUBRO[rubro]}`,
    );
  }

  console.log(
    `\n${nuevos} productos nuevos, ${enriquecidos} a los que se les completó ` +
      `el código, ${ambiguos} que no se pudieron decidir solos` +
      (conProveedor ? `, ${conProveedor} con proveedor asignado` : "") +
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
