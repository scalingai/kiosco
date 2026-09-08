/**
 * Saca del catálogo lo que no se vende en el kiosco.
 *
 *   npm run db:limpiar              # muestra qué sacaría, no toca nada
 *   npm run db:limpiar -- --aplicar # lo hace
 *
 * Existe porque el importador trae de más a propósito: es más rápido bajar un
 * rubro entero y podar, que ir producto por producto adivinando cuál está en la
 * góndola. Esto es la poda, y se declara acá para que quede escrito POR QUÉ se
 * sacó algo.
 *
 * Cómo saca:
 *
 * - Si el producto nunca se compró, se borra y listo.
 * - Si tiene compras encima, NO se borra: se archiva. Borrarlo dejaría una
 *   compra vieja sin poder explicar qué se compró, y esa es la misma regla que
 *   vale para los movimientos del fiado.
 */
import fs from "node:fs";
import path from "node:path";
import { and, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import {
  categorias,
  comprasItems,
  marcas,
  productos,
} from "../src/db/schema.ts";
import { normalizarNombre } from "../src/lib/nombres.ts";

/**
 * Qué podar. `salvoMarcas` deja adentro sólo esas marcas del rubro; sin eso, se
 * va el rubro entero.
 */
const PODA: { rubro: string; salvoMarcas?: string[]; porque: string }[] = [
  {
    rubro: "Conservas",
    porque: "no se venden conservas en el kiosco",
  },
  {
    rubro: "Aguas",
    salvoMarcas: ["Villa Manaos"],
    porque: "de agua mineral sólo se vende Villa Manaos",
  },
  /*
   * Las bebidas están cargadas a mano en `db:catalogo`: ahí está escrito
   * exactamente qué se vende. Todo lo que el importador metió de más en esos
   * rubros se va, y no vuelve porque esas búsquedas pasaron a `soloEnriquecer`.
   */
  {
    rubro: "Gaseosas",
    salvoMarcas: [
      "Coca-Cola",
      "Sprite",
      "Fanta",
      "Pepsi",
      "7up",
      "Manaos",
      "Cunnington",
    ],
    porque: "son las gaseosas que se venden",
  },
  {
    rubro: "Jugos",
    salvoMarcas: ["Baggio", "Powerade"],
    porque: "de jugos sólo Baggio, y Powerade que va en el mismo rubro",
  },
  {
    rubro: "Aguas saborizadas",
    salvoMarcas: ["Levite", "Aquarius", "Placer"],
    porque: "son las saborizadas que se venden",
  },
  {
    rubro: "Energizantes",
    salvoMarcas: ["Speed"],
    porque: "de energizantes sólo Speed (falta cargar Monster)",
  },
  {
    rubro: "Alcohol",
    salvoMarcas: ["Brahma", "Isenbeck", "Schneider", "Smirnoff"],
    porque: "son las únicas cervezas que se venden",
  },
  {
    rubro: "Leche",
    porque: "el rubro se reemplaza por Lácteos, con los dos que se venden",
  },
];

/*
 * Helados NO está en la lista, y no es un olvido.
 *
 * Estuvo, para sacar los postres y multipacks de súper que había traído el
 * importador. Pero ahora los helados los pone `db:catalogo` —la línea de
 * impulso de Arcor— y el importador ya no busca helados. Con la regla puesta,
 * cada corrida de `db:limpiar` borraba los 11 buenos y `db:catalogo` los
 * volvía a crear, perdiendo por el camino cualquier precio de venta que se les
 * hubiera cargado a mano.
 *
 * Una regla de poda que se cumplió hay que sacarla: sigue disparando sobre lo
 * que venga después.
 */

async function main() {
  const aplicar = process.argv.includes("--aplicar");

  const directorio = path.join(process.cwd(), ".data", "pg");
  fs.mkdirSync(directorio, { recursive: true });
  const cliente = new PGlite(directorio);
  const db = drizzle(cliente);
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });

  console.log(
    aplicar
      ? "Podando de verdad.\n"
      : "Mostrando qué sacaría. Para hacerlo: npm run db:limpiar -- --aplicar\n",
  );

  let borrados = 0;
  let archivados = 0;

  for (const regla of PODA) {
    const [rubro] = await db
      .select()
      .from(categorias)
      .where(eq(categorias.nombreNormalizado, normalizarNombre(regla.rubro)));

    if (!rubro) {
      console.log(`${regla.rubro}: no existe, nada que hacer.`);
      continue;
    }

    const condiciones = [
      eq(productos.categoriaId, rubro.id),
      isNull(productos.archivadoEn),
    ];

    if (regla.salvoMarcas?.length) {
      const salvadas = await db
        .select({ id: marcas.id })
        .from(marcas)
        .where(
          inArray(
            marcas.nombreNormalizado,
            regla.salvoMarcas.map(normalizarNombre),
          ),
        );
      if (salvadas.length) {
        condiciones.push(
          notInArray(
            productos.marcaId,
            salvadas.map((m) => m.id),
          ),
        );
      }
    }

    const candidatos = await db
      .select({ id: productos.id, nombre: productos.nombre })
      .from(productos)
      .where(and(...condiciones));

    let borradosAca = 0;
    let archivadosAca = 0;

    for (const producto of candidatos) {
      // ¿Alguna compra lo menciona? Entonces no se borra.
      const [usado] = await db
        .select({ id: comprasItems.id })
        .from(comprasItems)
        .where(eq(comprasItems.productoId, producto.id))
        .limit(1);

      if (usado) {
        archivadosAca += 1;
        if (aplicar) {
          await db
            .update(productos)
            .set({ archivadoEn: new Date() })
            .where(eq(productos.id, producto.id));
        }
        continue;
      }

      borradosAca += 1;
      if (aplicar) {
        await db.delete(productos).where(eq(productos.id, producto.id));
      }
    }

    borrados += borradosAca;
    archivados += archivadosAca;

    console.log(
      `${regla.rubro} (${regla.porque}): ${borradosAca} borrados` +
        (archivadosAca
          ? `, ${archivadosAca} archivados porque tienen compras`
          : "") +
        (regla.salvoMarcas
          ? ` · quedan los de ${regla.salvoMarcas.join(", ")}`
          : ""),
    );
  }

  // Las marcas que se quedaron sin ningún producto no le sirven a nadie en el
  // desplegable de la ficha.
  if (aplicar) {
    const todas = await db.select().from(marcas);
    let sacadas = 0;
    for (const marca of todas) {
      const [usada] = await db
        .select({ id: productos.id })
        .from(productos)
        .where(eq(productos.marcaId, marca.id))
        .limit(1);
      if (usada) continue;
      await db.delete(marcas).where(eq(marcas.id, marca.id));
      sacadas += 1;
    }
    if (sacadas) console.log(`${sacadas} marcas quedaron vacías y se sacaron.`);
  }

  console.log(
    `\n${borrados} productos borrados` +
      (archivados ? `, ${archivados} archivados` : "") +
      ".",
  );
  if (!aplicar) console.log("No se tocó nada.");

  await cliente.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
