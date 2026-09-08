/**
 * La conexión que usan los scripts de base.
 *
 * Misma regla que la app (`src/db/client.ts`): si hay `DATABASE_URL` va contra
 * ese Postgres, y si no, contra el PGlite de `.data/pg`. La diferencia es que
 * la app la lee sola porque Next carga los `.env`, y un script lanzado con
 * `node` no: por eso acá se leen a mano.
 *
 * Y hay algo que la app no necesita y un script sí: **decir en voz alta contra
 * qué base está trabajando**. Un `db:limpiar --aplicar` apuntado sin querer a
 * producción borra el catálogo de verdad, y el script no tiene forma de
 * deshacerlo. Por eso escribir en producción pide `--prod` aparte de
 * `--aplicar`: son dos decisiones distintas y conviene tomarlas por separado.
 */
import fs from "node:fs";
import path from "node:path";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "../../src/db/schema.ts";

export type DB = NodePgDatabase<typeof schema>;

export type Base = {
  db: DB;
  cerrar: () => Promise<void>;
  /** cómo se llama el destino en pantalla */
  destino: string;
  esProduccion: boolean;
};

/**
 * Carga los `.env` como lo hace Next: `.env.local` gana sobre `.env`, y lo que
 * ya esté en el entorno gana sobre los dos.
 *
 * Se ignora una variable definida pero VACÍA, que es el caso del `.env` de este
 * repo: ahí `DATABASE_URL=` está a propósito para que en local se use PGlite.
 * Tomarla como "definida" mandaría al script a conectar a la nada.
 */
function cargarEnv() {
  for (const archivo of [".env.local", ".env"]) {
    const ruta = path.join(process.cwd(), archivo);
    if (!fs.existsSync(ruta)) continue;

    for (const linea of fs.readFileSync(ruta, "utf8").split("\n")) {
      const limpia = linea.trim();
      if (!limpia || limpia.startsWith("#")) continue;

      const corte = limpia.indexOf("=");
      if (corte < 1) continue;

      const nombre = limpia.slice(0, corte).trim();
      let valor = limpia.slice(corte + 1).trim();
      if (
        (valor.startsWith('"') && valor.endsWith('"')) ||
        (valor.startsWith("'") && valor.endsWith("'"))
      ) {
        valor = valor.slice(1, -1);
      }

      if (!valor) continue;
      if (process.env[nombre]) continue;
      process.env[nombre] = valor;
    }
  }
}

/** El host de la conexión, para poder decir a dónde va sin mostrar la clave. */
function hostDe(url: string): string {
  try {
    return new URL(url).host;
  } catch {
    return "destino desconocido";
  }
}

/**
 * Abre la base y avisa cuál es.
 *
 * `aplicar` dice si el script va a escribir. Se decide ANTES de conectar a
 * propósito: si el destino es produccion y nadie puso --prod, conviene ni
 * abrir la conexion, porque el solo hecho de conectar corre las migraciones
 * pendientes y eso ya es tocar produccion.
 */
export async function abrirBase(aplicar = false): Promise<Base> {
  cargarEnv();
  const url = process.env.DATABASE_URL;
  const carpeta = path.join(process.cwd(), "drizzle");

  if (url) {
    const destino = `PRODUCCIÓN (${hostDe(url)})`;
    console.log(`Base: ${destino}\n`);

    if (aplicar && !process.argv.includes("--prod")) {
      console.error(
        "Esto va a ESCRIBIR en producción.\n" +
          "Si es lo que querés, volvé a correrlo agregando --prod.\n" +
          "Si no, sacá DATABASE_URL del entorno y corré contra la base local.",
      );
      process.exit(1);
    }

    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const { Pool } = await import("pg");

    const pool = new Pool({
      connectionString: url,
      connectionTimeoutMillis: 15_000,
      max: 4,
    });
    const db = drizzle(pool, { schema });
    // Sólo cuando se va a escribir. `migrate` corre DDL —crea el schema
    // "drizzle" y aplica lo pendiente—, y eso no tiene nada que hacer en una
    // corrida que sólo iba a mostrar qué haría.
    if (aplicar) await migrate(db, { migrationsFolder: carpeta });

    return { db, cerrar: () => pool.end(), destino, esProduccion: true };
  }

  console.log("Base: la base local (.data/pg)\n");

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");

  const directorio = path.join(process.cwd(), ".data", "pg");
  // PGlite no crea directorios anidados por su cuenta.
  fs.mkdirSync(directorio, { recursive: true });
  const cliente = new PGlite(directorio);
  const db = drizzle(cliente, { schema });
  await migrate(db, { migrationsFolder: carpeta });

  return {
    db: db as unknown as DB,
    cerrar: () => cliente.close(),
    destino: "la base local (.data/pg)",
    esProduccion: false,
  };
}
