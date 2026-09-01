import "server-only";

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { getDb, type DB } from "@/db/client";
import { clientes, items, movimientos, notas, type Item } from "@/db/schema";
import {
  sumarItems,
  type ItemAGuardar,
  type MovimientoAGuardar,
} from "@/lib/movimiento";
import { normalizarNombre } from "@/lib/nombres";

export type { ItemAGuardar, MovimientoAGuardar };

/** fiado suma, pago resta, los anulados no cuentan */
const saldoSql = sql<string>`coalesce(sum(
  case when ${movimientos.tipo} = 'fiado' then ${movimientos.montoCentavos}
       else -${movimientos.montoCentavos} end
) filter (where ${movimientos.anuladoEn} is null), 0)`;

const ultimoMovimientoSql = sql<
  string | null
>`max(${movimientos.fecha}) filter (where ${movimientos.anuladoEn} is null)`;

/**
 * Los ids vienen de la URL o del navegador. Si no son un UUID, Postgres corta
 * con un error de sintaxis y eso sale como un 500: mejor tratarlo como "no existe".
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FilaDeudor = {
  id: string;
  nombre: string;
  telefono: string | null;
  saldoCentavos: number;
  ultimoMovimiento: string | null;
  /** tiene ítems anotados sin precio que todavía no suman a la deuda */
  faltanPrecios: boolean;
};

/**
 * Clientes que tienen algún ítem sin precio en un movimiento cuyo total no lo
 * declaró nadie. Esa mercadería salió del kiosco y no está cobrada.
 */
async function clientesConPreciosPendientes(): Promise<Set<string>> {
  const db = await getDb();
  const filas = await db
    .selectDistinct({ clienteId: movimientos.clienteId })
    .from(items)
    .innerJoin(movimientos, eq(items.movimientoId, movimientos.id))
    .where(
      and(
        isNull(movimientos.anuladoEn),
        eq(movimientos.totalDeclarado, false),
        isNull(items.precioUnitarioCentavos),
      ),
    );
  return new Set(filas.map((f) => f.clienteId));
}

export async function listarClientes(): Promise<FilaDeudor[]> {
  const db = await getDb();
  const [filas, pendientes] = await Promise.all([
    db
      .select({
        id: clientes.id,
        nombre: clientes.nombre,
        telefono: clientes.telefono,
        saldo: saldoSql,
        ultimo: ultimoMovimientoSql,
      })
      .from(clientes)
      .leftJoin(movimientos, eq(movimientos.clienteId, clientes.id))
      .where(isNull(clientes.archivadoEn))
      .groupBy(clientes.id)
      .orderBy(desc(saldoSql), asc(clientes.nombre)),
    clientesConPreciosPendientes(),
  ]);

  return filas.map((f) => ({
    id: f.id,
    nombre: f.nombre,
    telefono: f.telefono,
    // los bigint de Postgres llegan como string para no perder precisión
    saldoCentavos: Number(f.saldo ?? 0),
    ultimoMovimiento: f.ultimo ?? null,
    faltanPrecios: pendientes.has(f.id),
  }));
}

export async function obtenerCliente(id: string) {
  if (!UUID.test(id)) return null;
  const db = await getDb();
  const [cliente] = await db
    .select()
    .from(clientes)
    .where(eq(clientes.id, id))
    .limit(1);
  if (!cliente) return null;

  const filas = await db
    .select()
    .from(movimientos)
    .where(eq(movimientos.clienteId, id))
    .orderBy(desc(movimientos.fecha), desc(movimientos.creadoEn));

  // Los ítems de todos los movimientos en una sola consulta, no una por fila.
  const porMovimiento = new Map<string, Item[]>();
  if (filas.length) {
    const sueltos = await db
      .select()
      .from(items)
      .where(
        inArray(
          items.movimientoId,
          filas.map((f) => f.id),
        ),
      )
      .orderBy(asc(items.posicion));
    for (const item of sueltos) {
      const lista = porMovimiento.get(item.movimientoId) ?? [];
      lista.push(item);
      porMovimiento.set(item.movimientoId, lista);
    }
  }

  const conItems = filas.map((m) => ({
    ...m,
    items: porMovimiento.get(m.id) ?? [],
  }));

  const saldoCentavos = conItems.reduce((total, m) => {
    if (m.anuladoEn) return total;
    return total + (m.tipo === "fiado" ? m.montoCentavos : -m.montoCentavos);
  }, 0);

  return { cliente, movimientos: conItems, saldoCentavos };
}

export type MovimientoConItems = NonNullable<
  Awaited<ReturnType<typeof obtenerCliente>>
>["movimientos"][number];

/** El mismo handle sirve para la base o para una transacción abierta. */
type Ejecutor = Pick<DB, "select" | "insert" | "update">;

/**
 * Busca por nombre normalizado y crea si no existe. El índice único sobre
 * `nombre_normalizado` evita que dos cargas simultáneas dupliquen al cliente.
 */
async function buscarOCrearClienteCon(db: Ejecutor, nombre: string) {
  const limpio = nombre.trim();
  if (!limpio) throw new Error("El nombre del cliente no puede estar vacío");
  const normalizado = normalizarNombre(limpio);

  const [existente] = await db
    .select()
    .from(clientes)
    .where(eq(clientes.nombreNormalizado, normalizado))
    .limit(1);
  if (existente) return existente;

  const [creado] = await db
    .insert(clientes)
    .values({ nombre: limpio, nombreNormalizado: normalizado })
    .onConflictDoNothing({ target: clientes.nombreNormalizado })
    .returning();
  if (creado) return creado;

  const [ganadorDeLaCarrera] = await db
    .select()
    .from(clientes)
    .where(eq(clientes.nombreNormalizado, normalizado))
    .limit(1);
  return ganadorDeLaCarrera;
}

export async function buscarOCrearCliente(nombre: string) {
  const db = await getDb();
  return buscarOCrearClienteCon(db, nombre);
}

export async function listarCandidatos() {
  const db = await getDb();
  return db
    .select({ id: clientes.id, nombre: clientes.nombre })
    .from(clientes)
    .where(isNull(clientes.archivadoEn));
}

export async function registrarMovimientos(porGuardar: MovimientoAGuardar[]) {
  const db = await getDb();

  // Todo o nada. Un audio puede traer tres movimientos: si el tercero falla, no
  // pueden quedar los dos primeros anotados y el resto en el aire, porque nadie
  // se va a acordar de cuál se guardó.
  return db.transaction(async (tx) => {
    const guardados = [];

    for (const entrada of porGuardar) {
      // Misma regla que la pantalla: cuenta el renglón con nombre o con precio.
      const lista = (entrada.items ?? []).filter(
        (i) => i.descripcion?.trim() || i.precioUnitarioCentavos != null,
      );

      const totalDeclarado = entrada.montoCentavos != null;
      const montoCentavos = totalDeclarado
        ? entrada.montoCentavos!
        : sumarItems(lista);

      if (montoCentavos < 0) {
        throw new Error("El monto no puede ser negativo");
      }
      if (montoCentavos === 0 && !lista.length) {
        throw new Error("El movimiento no tiene ni monto ni ítems");
      }
      if (entrada.tipo === "pago" && montoCentavos <= 0) {
        throw new Error("Un pago tiene que tener un monto mayor a cero");
      }

      let clienteId = entrada.clienteId;
      if (clienteId && !UUID.test(clienteId)) {
        throw new Error("Cliente inválido");
      }
      if (!clienteId) {
        if (!entrada.nombreCliente) {
          throw new Error("Falta el cliente del movimiento");
        }
        const cliente = await buscarOCrearClienteCon(tx, entrada.nombreCliente);
        clienteId = cliente.id;
      }

      const [fila] = await tx
        .insert(movimientos)
        .values({
          clienteId,
          tipo: entrada.tipo,
          montoCentavos,
          totalDeclarado,
          nota: entrada.nota?.trim() || null,
          fecha: entrada.fecha,
          origen: entrada.origen,
          notaId: entrada.notaId ?? null,
        })
        .returning();

      if (lista.length) {
        await tx.insert(items).values(
          lista.map((item, posicion) => ({
            movimientoId: fila.id,
            descripcion: item.descripcion?.trim() || null,
            cantidad: Math.max(1, Math.round(item.cantidad || 1)),
            precioUnitarioCentavos: item.precioUnitarioCentavos,
            posicion,
          })),
        );
      }

      guardados.push(fila);
    }

    // Las notas que produjeron algo quedan marcadas: las que no, se ven aparte
    // en el historial, que es donde uno va a buscar "qué dije que no cargué".
    const usadas = [
      ...new Set(porGuardar.map((m) => m.notaId).filter(Boolean) as string[]),
    ];
    if (usadas.length) {
      await tx
        .update(notas)
        .set({ aplicada: true })
        .where(inArray(notas.id, usadas));
    }

    return guardados;
  });
}

/**
 * Guarda lo que se escuchó, antes de que nadie confirme nada. Si después se
 * descarta la propuesta, la nota igual queda: dijiste algo y tiene que poder
 * recuperarse.
 */
export async function guardarNota(transcripcion: string) {
  const db = await getDb();
  const [fila] = await db
    .insert(notas)
    .values({ transcripcion: transcripcion.trim() })
    .returning();
  return fila;
}

export type EntradaHistorial =
  | {
      clase: "nota";
      id: string;
      cuando: Date;
      transcripcion: string;
      movimientos: {
        id: string;
        cliente: string;
        clienteId: string;
        tipo: "fiado" | "pago";
        montoCentavos: number;
        anulado: boolean;
      }[];
    }
  | {
      clase: "manual";
      id: string;
      cuando: Date;
      cliente: string;
      clienteId: string;
      tipo: "fiado" | "pago";
      montoCentavos: number;
      nota: string | null;
      anulado: boolean;
    };

/** Todo lo que pasó, lo más nuevo arriba: notas dictadas y cargas a mano. */
export async function listarHistorial(limite = 60): Promise<EntradaHistorial[]> {
  const db = await getDb();

  const [dictadas, aMano] = await Promise.all([
    db.select().from(notas).orderBy(desc(notas.creadoEn)).limit(limite),
    db
      .select({
        id: movimientos.id,
        cuando: movimientos.creadoEn,
        cliente: clientes.nombre,
        clienteId: clientes.id,
        tipo: movimientos.tipo,
        montoCentavos: movimientos.montoCentavos,
        nota: movimientos.nota,
        anuladoEn: movimientos.anuladoEn,
      })
      .from(movimientos)
      .innerJoin(clientes, eq(clientes.id, movimientos.clienteId))
      .where(isNull(movimientos.notaId))
      .orderBy(desc(movimientos.creadoEn))
      .limit(limite),
  ]);

  const porNota = new Map<string, EntradaHistorial & { clase: "nota" }>();
  for (const n of dictadas) {
    porNota.set(n.id, {
      clase: "nota",
      id: n.id,
      cuando: n.creadoEn,
      transcripcion: n.transcripcion,
      movimientos: [],
    });
  }

  if (porNota.size) {
    const hijos = await db
      .select({
        id: movimientos.id,
        notaId: movimientos.notaId,
        cliente: clientes.nombre,
        clienteId: clientes.id,
        tipo: movimientos.tipo,
        montoCentavos: movimientos.montoCentavos,
        anuladoEn: movimientos.anuladoEn,
      })
      .from(movimientos)
      .innerJoin(clientes, eq(clientes.id, movimientos.clienteId))
      .where(inArray(movimientos.notaId, [...porNota.keys()]))
      .orderBy(asc(movimientos.creadoEn));

    for (const h of hijos) {
      porNota.get(h.notaId!)?.movimientos.push({
        id: h.id,
        cliente: h.cliente,
        clienteId: h.clienteId,
        tipo: h.tipo,
        montoCentavos: h.montoCentavos,
        anulado: Boolean(h.anuladoEn),
      });
    }
  }

  const entradas: EntradaHistorial[] = [
    ...porNota.values(),
    ...aMano.map((m) => ({
      clase: "manual" as const,
      id: m.id,
      cuando: m.cuando,
      cliente: m.cliente,
      clienteId: m.clienteId,
      tipo: m.tipo,
      montoCentavos: m.montoCentavos,
      nota: m.nota,
      anulado: Boolean(m.anuladoEn),
    })),
  ];

  return entradas
    .sort((a, b) => b.cuando.getTime() - a.cuando.getTime())
    .slice(0, limite);
}

/**
 * Los movimientos no se borran: se anulan. Si alguien pregunta por qué su
 * deuda cambió, la fila sigue estando con la fecha en que se dio de baja.
 */
export async function anularMovimiento(id: string) {
  if (!UUID.test(id)) return null;
  const db = await getDb();
  const [fila] = await db
    .update(movimientos)
    .set({ anuladoEn: new Date() })
    .where(and(eq(movimientos.id, id), isNull(movimientos.anuladoEn)))
    .returning();
  return fila ?? null;
}
