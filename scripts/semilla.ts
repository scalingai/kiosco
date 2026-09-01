/**
 * Carga unos pocos clientes y movimientos en la base local para poder mirar la
 * app con algo adentro. Sólo toca PGlite (.data/pg): nunca corre contra
 * DATABASE_URL, así no hay manera de que ensucie una base de verdad.
 *
 *   npm run db:semilla
 *
 * Para vaciarla de nuevo: borrá la carpeta .data
 */
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { clientes, items, movimientos } from "../src/db/schema.ts";
import { normalizarNombre } from "../src/lib/nombres.ts";

type ItemSemilla = { descripcion: string; cantidad: number; precio?: number };

type MovimientoSemilla = {
  tipo: "fiado" | "pago";
  /** total dicho por una persona; si falta, sale de sumar los ítems */
  total?: number;
  items?: ItemSemilla[];
  nota?: string;
  dias: number;
};

const GENTE: {
  nombre: string;
  telefono: string | null;
  movimientos: MovimientoSemilla[];
}[] = [
  {
    nombre: "Marta Gómez",
    telefono: "11 5555 1234",
    // Total dicho de una, sin precio por producto: el caso más común.
    movimientos: [
      {
        tipo: "fiado",
        total: 4800,
        items: [
          { descripcion: "gaseosa", cantidad: 2 },
          { descripcion: "pan", cantidad: 1 },
        ],
        dias: 12,
      },
      {
        tipo: "fiado",
        total: 2300,
        items: [{ descripcion: "atado de cigarrillos", cantidad: 1 }],
        dias: 6,
      },
      { tipo: "pago", total: 5000, dias: 2 },
    ],
  },
  {
    nombre: "Julián Ferreyra",
    telefono: null,
    // Precio por producto y sin total: el total sale de la suma.
    movimientos: [
      {
        tipo: "fiado",
        items: [
          { descripcion: "cerveza", cantidad: 4, precio: 2500 },
          { descripcion: "papas fritas", cantidad: 1, precio: 2500 },
        ],
        dias: 40,
      },
      {
        tipo: "fiado",
        items: [{ descripcion: "alfajor", cantidad: 4, precio: 775 }],
        dias: 33,
      },
    ],
  },
  {
    nombre: "Doña Rosa",
    telefono: null,
    movimientos: [
      {
        tipo: "fiado",
        total: 1900,
        items: [{ descripcion: "leche", cantidad: 1 }],
        dias: 4,
      },
      { tipo: "pago", total: 1900, dias: 1 },
    ],
  },
  {
    nombre: "El Flaco",
    telefono: null,
    // Sin precios y sin total: queda anotado pero no suma. Es el caso a mirar.
    movimientos: [
      {
        tipo: "fiado",
        items: [
          { descripcion: "yerba", cantidad: 1 },
          { descripcion: "fideos", cantidad: 2 },
        ],
        nota: "después le pongo el precio",
        dias: 1,
      },
      {
        tipo: "fiado",
        total: 7400,
        items: [{ descripcion: "carga del día", cantidad: 1 }],
        dias: 3,
      },
    ],
  },
];

function fechaHace(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toLocaleDateString("sv-SE");
}

function centavos(pesos: number): number {
  return Math.round(pesos * 100);
}

async function main() {
  const directorio = path.join(process.cwd(), ".data", "pg");
  fs.mkdirSync(directorio, { recursive: true });
  const cliente = new PGlite(directorio);
  const db = drizzle(cliente);
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });

  for (const persona of GENTE) {
    const [fila] = await db
      .insert(clientes)
      .values({
        nombre: persona.nombre,
        nombreNormalizado: normalizarNombre(persona.nombre),
        telefono: persona.telefono,
      })
      .onConflictDoNothing({ target: clientes.nombreNormalizado })
      .returning();

    if (!fila) {
      console.log("ya estaba: " + persona.nombre);
      continue;
    }

    for (const m of persona.movimientos) {
      const lista = m.items ?? [];
      const totalDeclarado = m.total != null;
      const monto = totalDeclarado
        ? centavos(m.total!)
        : lista.reduce(
            (t, i) =>
              t + (i.precio != null ? centavos(i.precio) * i.cantidad : 0),
            0,
          );

      const [guardado] = await db
        .insert(movimientos)
        .values({
          clienteId: fila.id,
          tipo: m.tipo,
          montoCentavos: monto,
          totalDeclarado,
          nota: m.nota ?? null,
          fecha: fechaHace(m.dias),
          origen: "manual",
        })
        .returning();

      if (lista.length) {
        await db.insert(items).values(
          lista.map((item, posicion) => ({
            movimientoId: guardado.id,
            descripcion: item.descripcion,
            cantidad: item.cantidad,
            precioUnitarioCentavos:
              item.precio != null ? centavos(item.precio) : null,
            posicion,
          })),
        );
      }
    }
    console.log("cargado: " + persona.nombre);
  }

  await cliente.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
