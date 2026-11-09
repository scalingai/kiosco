import "server-only";

import fs from "node:fs";
import path from "node:path";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

export type DB = NodePgDatabase<typeof schema>;

/**
 * En local no hace falta instalar nada: corre PGlite, que es Postgres compilado
 * a WASM y persiste en `.data/pg`. En producción (EasyPanel) se define
 * DATABASE_URL y usa el Postgres de verdad. Mismo dialecto y mismas migraciones
 * en los dos lados, así que lo que anda acá anda allá.
 */
const DIRECTORIO_LOCAL = process.env.KIOSCO_LOCAL_DB_DIR || path.join(process.cwd(), ".data", "pg");
const CARPETA_MIGRACIONES = path.join(process.cwd(), "drizzle");

type Cache = { db?: Promise<DB> };

// El dev server de Next recarga los módulos en caliente; sin este global se
// abriría una base nueva en cada recarga y PGlite trabaría el directorio.
const cache = globalThis as unknown as { __kioscoDb?: Cache };
cache.__kioscoDb ??= {};

async function conectar(): Promise<DB> {
  /*
   * `?.trim() || undefined`: una `DATABASE_URL` definida pero VACÍA tiene que
   * contar como ausente. Si no, `new Pool({connectionString: ""})` se conecta
   * a lo que haya por default y el error que sale no menciona la variable.
   * Quién la deja vacía y por qué está explicado en `scripts/dev.mjs`.
   */
  const url = process.env.DATABASE_URL?.trim() || undefined;

  if (!url && process.env.NODE_ENV === "production") {
    // PGlite es sólo para desarrollo y ni siquiera arranca dentro de un build
    // standalone. Sin esto el error que sale es "PGlite failed to initialize",
    // que no le dice a nadie que lo que falta es la variable.
    throw new Error(
      "Falta DATABASE_URL. En producción la app necesita un Postgres; " +
        "PGlite es sólo para desarrollo local.",
    );
  }

  if (url) {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const { Pool } = await import("pg");
    const pool = new Pool({
      connectionString: url,
      // Sin estos límites, pg espera para siempre: si la base no contesta, la
      // petición nunca vuelve y la pantalla queda colgada en "Anotando…" sin
      // que nadie sepa qué pasó. Mejor cortar y decirlo.
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
      statement_timeout: 15_000,
      query_timeout: 15_000,
      max: 10,
    });

    // Un error en una conexión ociosa no puede tumbar el proceso entero.
    pool.on("error", (error) => {
      console.error("[postgres] error en conexión ociosa:", error.message);
    });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: CARPETA_MIGRACIONES });
    anunciar(`Postgres ${new URL(url).host}${new URL(url).pathname}`);
    return db;
  }

  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  // PGlite no crea directorios anidados por su cuenta.
  fs.mkdirSync(DIRECTORIO_LOCAL, { recursive: true });
  const cliente = new PGlite(DIRECTORIO_LOCAL);
  const db = drizzle(cliente, { schema });
  await migrate(db, { migrationsFolder: CARPETA_MIGRACIONES });
  anunciar(
    `PGlite local (${DIRECTORIO_LOCAL}) — no hay DATABASE_URL en el entorno. ` +
      `Claves parecidas que sí llegaron: ${
        Object.keys(process.env).filter((k) => /DATA|PG|POSTGRES/i.test(k)).join(", ") || "ninguna"
      }`,
  );
  return db as unknown as DB;
}

/**
 * Deja dicho en el log a qué base se conectó la app, una sola vez.
 *
 * Esto existe por un accidente concreto del 2026-11-09: el túnel a producción
 * se cortó solo y la app siguió andando contra PGlite, mostrando números que
 * parecían de producción. No hubo ningún error — y esa es justamente la
 * trampa: las dos bases tienen el mismo schema, así que todo FUNCIONA, sólo
 * que con los datos equivocados.
 *
 * `scripts/lib/base.ts` ya imprime esto mismo para los scripts ("Base: …").
 * La app no lo hacía, y era el único lugar donde la pregunta importa de
 * verdad: es la que se usa para decidir.
 */
function anunciar(aDonde: string) {
  console.log(`[base] conectado a ${aDonde}`);
}

export function getDb(): Promise<DB> {
  cache.__kioscoDb!.db ??= conectar().catch((error) => {
    // Si falla, no dejamos la promesa rechazada cacheada: el próximo intento
    // tiene que poder reconectar en vez de repetir el mismo error para siempre.
    cache.__kioscoDb!.db = undefined;
    throw error;
  });
  return cache.__kioscoDb!.db;
}
