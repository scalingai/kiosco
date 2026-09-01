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
const DIRECTORIO_LOCAL = path.join(process.cwd(), ".data", "pg");
const CARPETA_MIGRACIONES = path.join(process.cwd(), "drizzle");

type Cache = { db?: Promise<DB> };

// El dev server de Next recarga los módulos en caliente; sin este global se
// abriría una base nueva en cada recarga y PGlite trabaría el directorio.
const cache = globalThis as unknown as { __kioscoDb?: Cache };
cache.__kioscoDb ??= {};

async function conectar(): Promise<DB> {
  const url = process.env.DATABASE_URL;

  if (url) {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { migrate } = await import("drizzle-orm/node-postgres/migrator");
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: url });
    const db = drizzle(pool, { schema });
    await migrate(db, { migrationsFolder: CARPETA_MIGRACIONES });
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
  return db as unknown as DB;
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
