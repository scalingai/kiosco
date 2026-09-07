import "server-only";

import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getDb, type DB } from "@/db/client";
import {
  clientes,
  compras,
  comprasItems,
  gastos,
  movimientos,
  productos,
  proveedores,
  ventas,
} from "@/db/schema";
import {
  costoDeReferencia,
  sumarRenglones,
  type CategoriaGasto,
  type CompraAGuardar,
  type GastoAGuardar,
  type Unidad,
  type VentaAGuardar,
} from "@/lib/negocio";
import { normalizarNombre } from "@/lib/nombres";
import { buscarOCrearProductoCon } from "@/lib/stock";

/** Mismo motivo que en consultas.ts: un id que no es UUID es "no existe", no un 500. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Una fecha que Postgres no entienda tiene que frenar acá, no en la base. */
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function validarFecha(fecha: string, campo = "La fecha"): string {
  if (!FECHA.test(fecha)) throw new Error(`${campo} no es válida.`);
  return fecha;
}

type Ejecutor = Pick<DB, "select" | "insert" | "update">;

/* ── Proveedores ──────────────────────────────────────────────────────────── */

/**
 * Igual que con los clientes: se busca por nombre normalizado y se crea si no
 * está. El índice único evita que dos cargas al mismo tiempo lo dupliquen.
 */
async function buscarOCrearProveedorCon(db: Ejecutor, nombre: string) {
  const limpio = nombre.trim();
  if (!limpio) throw new Error("El nombre del proveedor no puede estar vacío");
  const normalizado = normalizarNombre(limpio);

  const [existente] = await db
    .select()
    .from(proveedores)
    .where(eq(proveedores.nombreNormalizado, normalizado))
    .limit(1);
  if (existente) return existente;

  const [creado] = await db
    .insert(proveedores)
    .values({ nombre: limpio, nombreNormalizado: normalizado })
    .onConflictDoNothing({ target: proveedores.nombreNormalizado })
    .returning();
  if (creado) return creado;

  const [ganadorDeLaCarrera] = await db
    .select()
    .from(proveedores)
    .where(eq(proveedores.nombreNormalizado, normalizado))
    .limit(1);
  return ganadorDeLaCarrera;
}

export async function buscarOCrearProveedor(nombre: string) {
  const db = await getDb();
  return buscarOCrearProveedorCon(db, nombre);
}

export async function listarProveedores() {
  const db = await getDb();
  return db
    .select({ id: proveedores.id, nombre: proveedores.nombre })
    .from(proveedores)
    .where(isNull(proveedores.archivadoEn))
    .orderBy(asc(proveedores.nombre));
}

/* ── Escrituras ───────────────────────────────────────────────────────────── */

export async function registrarVenta(entrada: VentaAGuardar) {
  if (entrada.montoCentavos <= 0) {
    throw new Error("La venta tiene que tener un monto mayor a cero");
  }
  const db = await getDb();
  const [fila] = await db
    .insert(ventas)
    .values({
      montoCentavos: entrada.montoCentavos,
      nota: entrada.nota?.trim() || null,
      fecha: validarFecha(entrada.fecha),
    })
    .returning();
  return fila;
}

export async function registrarGasto(entrada: GastoAGuardar) {
  if (entrada.montoCentavos <= 0) {
    throw new Error("El gasto tiene que tener un monto mayor a cero");
  }
  const db = await getDb();
  const [fila] = await db
    .insert(gastos)
    .values({
      categoria: entrada.categoria,
      montoCentavos: entrada.montoCentavos,
      descripcion: entrada.descripcion?.trim() || null,
      fecha: validarFecha(entrada.fecha),
    })
    .returning();
  return fila;
}

/**
 * La compra y sus renglones entran juntas o no entra ninguna: media compra
 * cargada es un número que después nadie puede explicar.
 */
export async function registrarCompra(entrada: CompraAGuardar) {
  const db = await getDb();

  return db.transaction(async (tx) => {
    // Misma regla que en el fiado: cuenta el renglón con nombre o con importe.
    const lista = (entrada.items ?? []).filter(
      (i) => i.descripcion?.trim() || i.importeCentavos != null,
    );

    const totalDeclarado = entrada.montoCentavos != null;
    const montoCentavos = totalDeclarado
      ? entrada.montoCentavos!
      : sumarRenglones(lista);

    if (montoCentavos < 0) throw new Error("El monto no puede ser negativo");
    if (montoCentavos === 0 && !lista.length) {
      throw new Error("La compra no tiene ni monto ni renglones");
    }

    let proveedorId = entrada.proveedorId;
    if (proveedorId && !UUID.test(proveedorId)) {
      throw new Error("Proveedor inválido");
    }
    if (!proveedorId) {
      if (!entrada.nombreProveedor) throw new Error("Falta el proveedor");
      const proveedor = await buscarOCrearProveedorCon(
        tx,
        entrada.nombreProveedor,
      );
      proveedorId = proveedor.id;
    }

    const [fila] = await tx
      .insert(compras)
      .values({
        proveedorId,
        montoCentavos,
        totalDeclarado,
        fecha: validarFecha(entrada.fecha),
        pagadoEn: entrada.pagadoEn
          ? validarFecha(entrada.pagadoEn, "La fecha de pago")
          : null,
        comprobante: entrada.comprobante?.trim() || null,
        nota: entrada.nota?.trim() || null,
      })
      .returning();

    if (lista.length) {
      // Cada renglón con nombre engancha con su producto del catálogo, y lo
      // crea si es la primera vez. Así la lista de reposición se llena sola con
      // lo que de verdad se compra, en vez de depender de que alguien se siente
      // a cargarla.
      const enganchados = [];
      for (const renglon of lista) {
        const nombre = renglon.descripcion?.trim();
        const producto = nombre
          ? await buscarOCrearProductoCon(tx, nombre)
          : null;

        // El proveedor del producto es siempre el de la última compra: si
        // cambiaste de distribuidor, la lista tiene que decir el nuevo.
        if (producto) {
          await tx
            .update(productos)
            .set({ proveedorId })
            .where(eq(productos.id, producto.id));
        }

        enganchados.push({ renglon, productoId: producto?.id ?? null });
      }

      await tx.insert(comprasItems).values(
        enganchados.map(({ renglon, productoId }, posicion) => ({
          compraId: fila.id,
          productoId,
          descripcion: renglon.descripcion?.trim() || null,
          cantidad: Math.max(1, Math.round(renglon.cantidad || 1)),
          unidadesPorBulto: Math.max(
            1,
            Math.round(renglon.unidadesPorBulto || 1),
          ),
          unidad: renglon.unidad,
          importeCentavos: renglon.importeCentavos,
          posicion,
        })),
      );
    }

    return fila;
  });
}

/**
 * Marcar una compra como pagada mueve plata: la salida cae en `fecha`, que es
 * el día en que de verdad saliste el billete, no el día en que llegó el pedido.
 */
export async function marcarCompraPagada(id: string, fecha: string) {
  if (!UUID.test(id)) return null;
  const db = await getDb();
  const [fila] = await db
    .update(compras)
    .set({ pagadoEn: validarFecha(fecha, "La fecha de pago") })
    .where(and(eq(compras.id, id), isNull(compras.anuladoEn)))
    .returning();
  return fila ?? null;
}

/** Por si se marcó pagada por error: vuelve a quedar a cuenta del proveedor. */
export async function marcarCompraImpaga(id: string) {
  if (!UUID.test(id)) return null;
  const db = await getDb();
  const [fila] = await db
    .update(compras)
    .set({ pagadoEn: null })
    .where(and(eq(compras.id, id), isNull(compras.anuladoEn)))
    .returning();
  return fila ?? null;
}

/** Nada se borra, acá tampoco: se le pone fecha de baja y deja de sumar. */
async function anularEn(
  tabla: typeof ventas | typeof gastos | typeof compras,
  id: string,
) {
  if (!UUID.test(id)) return null;
  const db = await getDb();
  const [fila] = await db
    .update(tabla)
    .set({ anuladoEn: new Date() })
    .where(and(eq(tabla.id, id), isNull(tabla.anuladoEn)))
    .returning();
  return fila ?? null;
}

export const anularVenta = (id: string) => anularEn(ventas, id);
export const anularGasto = (id: string) => anularEn(gastos, id);
export const anularCompra = (id: string) => anularEn(compras, id);

/* ── Lecturas ─────────────────────────────────────────────────────────────── */

export type FilaVenta = {
  id: string;
  montoCentavos: number;
  nota: string | null;
};

export type FilaGasto = {
  id: string;
  categoria: CategoriaGasto;
  montoCentavos: number;
  descripcion: string | null;
};

export type RenglonCompra = {
  id: string;
  descripcion: string | null;
  cantidad: number;
  unidadesPorBulto: number;
  unidad: Unidad;
  importeCentavos: number | null;
  /** derivado: lo que costó la unidad, el kilo o el litro, según se mida */
  costoCentavos: number | null;
  /** cómo se lee ese costo: "cada una", "el kilo", "el litro" */
  porCada: string | null;
};

export type FilaCompra = {
  id: string;
  proveedorId: string;
  proveedor: string;
  montoCentavos: number;
  totalDeclarado: boolean;
  fecha: string;
  pagadoEn: string | null;
  comprobante: string | null;
  nota: string | null;
  /** hay renglones sin importe y el total no lo declaró la factura */
  faltanPrecios: boolean;
  renglones: RenglonCompra[];
};

export type FilaCobro = {
  id: string;
  clienteId: string;
  cliente: string;
  montoCentavos: number;
};

export type BalanceDia = {
  fecha: string;
  ventas: FilaVenta[];
  gastos: FilaGasto[];
  /** Las que llegaron ese día y/o se pagaron ese día. */
  compras: FilaCompra[];
  cobros: FilaCobro[];
  ventasCentavos: number;
  cobrosCentavos: number;
  gastosCentavos: number;
  /** Sólo lo que se pagó ESE día, sin importar cuándo llegó la mercadería. */
  pagosProveedoresCentavos: number;
  entroCentavos: number;
  salioCentavos: number;
  resultadoCentavos: number;
  /**
   * Lo que se fio ese día. No es plata que se movió, por eso va aparte: es lo
   * que explica un día de mucha venta con poca caja.
   */
  fiadoOtorgadoCentavos: number;
};

function sumar<T>(filas: T[], valor: (fila: T) => number): number {
  return filas.reduce((total, fila) => total + valor(fila), 0);
}

export async function balanceDelDia(fecha: string): Promise<BalanceDia> {
  validarFecha(fecha);
  const db = await getDb();

  const [filasVentas, filasGastos, filasCompras, filasMovimientos, sinPrecio] =
    await Promise.all([
      db
        .select({
          id: ventas.id,
          montoCentavos: ventas.montoCentavos,
          nota: ventas.nota,
        })
        .from(ventas)
        .where(and(eq(ventas.fecha, fecha), isNull(ventas.anuladoEn)))
        .orderBy(asc(ventas.creadoEn)),

      db
        .select({
          id: gastos.id,
          categoria: gastos.categoria,
          montoCentavos: gastos.montoCentavos,
          descripcion: gastos.descripcion,
        })
        .from(gastos)
        .where(and(eq(gastos.fecha, fecha), isNull(gastos.anuladoEn)))
        .orderBy(asc(gastos.creadoEn)),

      // La compra que llegó hoy y la que se pagó hoy son cosas distintas y las
      // dos tienen que verse en el día: una explica la mercadería, la otra la
      // plata. Por eso el OR.
      db
        .select({
          id: compras.id,
          proveedorId: compras.proveedorId,
          proveedor: proveedores.nombre,
          montoCentavos: compras.montoCentavos,
          totalDeclarado: compras.totalDeclarado,
          fecha: compras.fecha,
          pagadoEn: compras.pagadoEn,
          comprobante: compras.comprobante,
          nota: compras.nota,
        })
        .from(compras)
        .innerJoin(proveedores, eq(proveedores.id, compras.proveedorId))
        .where(
          and(
            isNull(compras.anuladoEn),
            or(eq(compras.fecha, fecha), eq(compras.pagadoEn, fecha)),
          ),
        )
        .orderBy(asc(compras.creadoEn)),

      db
        .select({
          id: movimientos.id,
          clienteId: movimientos.clienteId,
          cliente: clientes.nombre,
          tipo: movimientos.tipo,
          montoCentavos: movimientos.montoCentavos,
        })
        .from(movimientos)
        .innerJoin(clientes, eq(clientes.id, movimientos.clienteId))
        .where(and(eq(movimientos.fecha, fecha), isNull(movimientos.anuladoEn)))
        .orderBy(asc(movimientos.creadoEn)),

      comprasConPreciosPendientes(),
    ]);

  // Los renglones de todas las compras del día en una sola consulta, no una
  // por compra.
  const porCompra = new Map<string, RenglonCompra[]>();
  if (filasCompras.length) {
    const sueltos = await db
      .select()
      .from(comprasItems)
      .where(
        inArray(
          comprasItems.compraId,
          filasCompras.map((c) => c.id),
        ),
      )
      .orderBy(asc(comprasItems.posicion));

    for (const r of sueltos) {
      const lista = porCompra.get(r.compraId) ?? [];
      const costo = costoDeReferencia(r);
      lista.push({
        id: r.id,
        descripcion: r.descripcion,
        cantidad: r.cantidad,
        unidadesPorBulto: r.unidadesPorBulto,
        unidad: r.unidad,
        importeCentavos: r.importeCentavos,
        costoCentavos: costo?.centavos ?? null,
        porCada: costo?.porCada ?? null,
      });
      porCompra.set(r.compraId, lista);
    }
  }

  const listaCompras: FilaCompra[] = filasCompras.map((c) => ({
    ...c,
    faltanPrecios: sinPrecio.has(c.id),
    renglones: porCompra.get(c.id) ?? [],
  }));

  const cobros = filasMovimientos
    .filter((m) => m.tipo === "pago")
    .map(({ id, clienteId, cliente, montoCentavos }) => ({
      id,
      clienteId,
      cliente,
      montoCentavos,
    }));

  const ventasCentavos = sumar(filasVentas, (v) => v.montoCentavos);
  const cobrosCentavos = sumar(cobros, (c) => c.montoCentavos);
  const gastosCentavos = sumar(filasGastos, (g) => g.montoCentavos);
  // Sólo las pagadas ESE día mueven plata. Las que llegaron y siguen impagas
  // aparecen en la lista pero no tocan el resultado.
  const pagosProveedoresCentavos = sumar(
    listaCompras.filter((c) => c.pagadoEn === fecha),
    (c) => c.montoCentavos,
  );

  const entroCentavos = ventasCentavos + cobrosCentavos;
  const salioCentavos = gastosCentavos + pagosProveedoresCentavos;

  return {
    fecha,
    ventas: filasVentas,
    gastos: filasGastos,
    compras: listaCompras,
    cobros,
    ventasCentavos,
    cobrosCentavos,
    gastosCentavos,
    pagosProveedoresCentavos,
    entroCentavos,
    salioCentavos,
    resultadoCentavos: entroCentavos - salioCentavos,
    fiadoOtorgadoCentavos: sumar(
      filasMovimientos.filter((m) => m.tipo === "fiado"),
      (m) => m.montoCentavos,
    ),
  };
}

/**
 * Compras con renglones sin precio cuyo total no lo declaró la factura. Ese
 * total todavía no es el total, igual que en el fiado: no lo tapamos con un
 * número redondo que nadie dijo.
 */
async function comprasConPreciosPendientes(): Promise<Set<string>> {
  const db = await getDb();
  const filas = await db
    .selectDistinct({ compraId: comprasItems.compraId })
    .from(comprasItems)
    .innerJoin(compras, eq(comprasItems.compraId, compras.id))
    .where(
      and(
        isNull(compras.anuladoEn),
        eq(compras.totalDeclarado, false),
        isNull(comprasItems.importeCentavos),
      ),
    );
  return new Set(filas.map((f) => f.compraId));
}

export type DeudaProveedor = {
  proveedorId: string;
  proveedor: string;
  totalCentavos: number;
  compras: number;
  masVieja: string;
  /**
   * Alguna de esas compras tiene renglones sin importe. Igual que en el fiado,
   * eso NO vale cero: vale "todavía no sabemos cuánto", y hay que decirlo o el
   * proveedor queda con una deuda más chica de la que es.
   */
  faltanPrecios: boolean;
};

/** Lo que se le debe a cada proveedor: compras sin `pagado_en`, sin anular. */
export async function deudaProveedores(): Promise<DeudaProveedor[]> {
  const db = await getDb();

  const [impagas, sinPrecio] = await Promise.all([
    db
      .select({
        id: compras.id,
        proveedorId: compras.proveedorId,
        proveedor: proveedores.nombre,
        montoCentavos: compras.montoCentavos,
        fecha: compras.fecha,
      })
      .from(compras)
      .innerJoin(proveedores, eq(proveedores.id, compras.proveedorId))
      .where(and(isNull(compras.anuladoEn), isNull(compras.pagadoEn))),
    comprasConPreciosPendientes(),
  ]);

  const porProveedor = new Map<string, DeudaProveedor>();
  for (const compra of impagas) {
    const anterior = porProveedor.get(compra.proveedorId);
    const deuda: DeudaProveedor = anterior ?? {
      proveedorId: compra.proveedorId,
      proveedor: compra.proveedor,
      totalCentavos: 0,
      compras: 0,
      masVieja: compra.fecha,
      faltanPrecios: false,
    };
    deuda.totalCentavos += compra.montoCentavos;
    deuda.compras += 1;
    if (compra.fecha < deuda.masVieja) deuda.masVieja = compra.fecha;
    if (sinPrecio.has(compra.id)) deuda.faltanPrecios = true;
    porProveedor.set(compra.proveedorId, deuda);
  }

  return [...porProveedor.values()].sort(
    (a, b) => b.totalCentavos - a.totalCentavos,
  );
}

export type ResumenMes = {
  desde: string;
  hasta: string;
  ventasCentavos: number;
  cobrosCentavos: number;
  gastosCentavos: number;
  pagosProveedoresCentavos: number;
  resultadoCentavos: number;
  dias: number;
};

/** Suma de una columna de plata en un rango, ignorando lo anulado. */
const total = sql<string>`coalesce(sum(monto_centavos), 0)`;

/**
 * El acumulado del mes que contiene a `fecha`. Mismo criterio que el día: los
 * pagos a proveedores cuentan por `pagado_en`, no por cuándo llegó el pedido.
 */
export async function resumenDelMes(fecha: string): Promise<ResumenMes> {
  validarFecha(fecha);
  const db = await getDb();

  const [anio, mes] = fecha.split("-").map(Number);
  const desde = `${anio}-${String(mes).padStart(2, "0")}-01`;
  // El día 0 del mes siguiente es el último día de este mes, y JS ya sabe
  // cuántos son y qué pasa en diciembre.
  const ultimo = new Date(Date.UTC(anio, mes, 0)).getUTCDate();
  const hasta = `${anio}-${String(mes).padStart(2, "0")}-${String(ultimo).padStart(2, "0")}`;

  const enElMes = (columna: AnyPgColumn) =>
    and(gte(columna, desde), lte(columna, hasta));

  const [[fVentas], [fGastos], [fPagos], [fCobros]] = await Promise.all([
    db
      .select({ total })
      .from(ventas)
      .where(and(enElMes(ventas.fecha), isNull(ventas.anuladoEn))),
    db
      .select({ total })
      .from(gastos)
      .where(and(enElMes(gastos.fecha), isNull(gastos.anuladoEn))),
    db
      .select({ total })
      .from(compras)
      .where(
        and(
          isNotNull(compras.pagadoEn),
          enElMes(compras.pagadoEn),
          isNull(compras.anuladoEn),
        ),
      ),
    db
      .select({ total })
      .from(movimientos)
      .where(
        and(
          enElMes(movimientos.fecha),
          eq(movimientos.tipo, "pago"),
          isNull(movimientos.anuladoEn),
        ),
      ),
  ]);

  const ventasCentavos = Number(fVentas?.total ?? 0);
  const cobrosCentavos = Number(fCobros?.total ?? 0);
  const gastosCentavos = Number(fGastos?.total ?? 0);
  const pagosProveedoresCentavos = Number(fPagos?.total ?? 0);

  return {
    desde,
    hasta,
    ventasCentavos,
    cobrosCentavos,
    gastosCentavos,
    pagosProveedoresCentavos,
    resultadoCentavos:
      ventasCentavos + cobrosCentavos - gastosCentavos - pagosProveedoresCentavos,
    dias: ultimo,
  };
}

export type DiaDeVentas = {
  fecha: string;
  totalCentavos: number;
  cargas: FilaVenta[];
};

/**
 * Las ventas agrupadas por día, lo más nuevo arriba. Se devuelven también las
 * cargas sueltas de cada día: el total de un día son varios renglones (mañana,
 * tarde) y hay que poder ver cuál anular sin adivinar.
 */
export async function ventasPorDia(dias = 60): Promise<DiaDeVentas[]> {
  const db = await getDb();
  const filas = await db
    .select({
      id: ventas.id,
      fecha: ventas.fecha,
      montoCentavos: ventas.montoCentavos,
      nota: ventas.nota,
    })
    .from(ventas)
    .where(isNull(ventas.anuladoEn))
    .orderBy(desc(ventas.fecha), asc(ventas.creadoEn));

  const porFecha = new Map<string, DiaDeVentas>();
  for (const fila of filas) {
    const dia = porFecha.get(fila.fecha) ?? {
      fecha: fila.fecha,
      totalCentavos: 0,
      cargas: [],
    };
    dia.totalCentavos += fila.montoCentavos;
    dia.cargas.push({
      id: fila.id,
      montoCentavos: fila.montoCentavos,
      nota: fila.nota,
    });
    porFecha.set(fila.fecha, dia);
  }

  return [...porFecha.values()].slice(0, dias);
}
