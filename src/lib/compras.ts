import "server-only";

import { and, asc, desc, eq, gte, inArray, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { compras, comprasItems, proveedores } from "@/db/schema";
import { costoDeReferencia, type Unidad } from "@/lib/negocio";

/**
 * El historial de compras y sus cortes.
 *
 * La idea de "agrupar" cambia según el corte, y eso NO es un detalle de
 * presentación: por proveedor, por mes y por estado se agrupan COMPRAS —el
 * documento entero, y los totales suman sin pisarse—. Por producto se agrupan
 * RENGLONES: una misma compra cae en varios grupos, y sumar los grupos ya no da
 * el total del período. Por eso cada corte devuelve su propio total y la
 * pantalla dice cuál está mirando.
 */

export type RenglonDelHistorial = {
  id: string;
  productoId: string | null;
  descripcion: string | null;
  cantidad: number;
  unidadesPorBulto: number;
  unidad: Unidad;
  importeCentavos: number | null;
  costoCentavos: number | null;
  porCada: string | null;
};

export type CompraDelHistorial = {
  id: string;
  proveedorId: string;
  proveedor: string;
  montoCentavos: number;
  totalDeclarado: boolean;
  fecha: string;
  pagadoEn: string | null;
  comprobante: string | null;
  nota: string | null;
  faltanPrecios: boolean;
  renglones: RenglonDelHistorial[];
};

export type Filtro = {
  /** ISO; si falta, desde siempre */
  desde?: string;
  soloImpagas?: boolean;
};

export async function historialDeCompras(
  filtro: Filtro = {},
): Promise<CompraDelHistorial[]> {
  const db = await getDb();

  const condiciones = [isNull(compras.anuladoEn)];
  if (filtro.desde) condiciones.push(gte(compras.fecha, filtro.desde));
  if (filtro.soloImpagas) condiciones.push(isNull(compras.pagadoEn));

  const filas = await db
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
    .where(and(...condiciones))
    .orderBy(desc(compras.fecha), desc(compras.creadoEn));

  if (!filas.length) return [];

  // Los renglones de todas las compras en una sola consulta, no una por compra.
  const sueltos = await db
    .select()
    .from(comprasItems)
    .where(
      inArray(
        comprasItems.compraId,
        filas.map((f) => f.id),
      ),
    )
    .orderBy(asc(comprasItems.posicion));

  const porCompra = new Map<string, RenglonDelHistorial[]>();
  for (const r of sueltos) {
    const costo = costoDeReferencia(r);
    const lista = porCompra.get(r.compraId) ?? [];
    lista.push({
      id: r.id,
      productoId: r.productoId,
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

  return filas.map((f) => {
    const renglones = porCompra.get(f.id) ?? [];
    return {
      ...f,
      renglones,
      // Mismo criterio que en el fiado: si el total no lo declaró la factura y
      // hay renglones sin importe, ese total todavía no es el total.
      faltanPrecios:
        !f.totalDeclarado && renglones.some((r) => r.importeCentavos == null),
    };
  });
}

/* ── Cortes que agrupan COMPRAS ───────────────────────────────────────────── */

export type GrupoDeCompras = {
  clave: string;
  titulo: string;
  /** dato de contexto del grupo: desde cuándo, cuántas compras, etc. */
  detalle: string;
  totalCentavos: number;
  impagoCentavos: number;
  faltanPrecios: boolean;
  /** la compra más reciente del grupo, sin formato: la pantalla la escribe */
  ultimaFecha: string;
  compras: CompraDelHistorial[];
};

function acumular(
  lista: CompraDelHistorial[],
  clave: (c: CompraDelHistorial) => string,
  titulo: (c: CompraDelHistorial) => string,
): Map<string, GrupoDeCompras> {
  const grupos = new Map<string, GrupoDeCompras>();
  for (const compra of lista) {
    const k = clave(compra);
    const grupo = grupos.get(k) ?? {
      clave: k,
      titulo: titulo(compra),
      detalle: "",
      totalCentavos: 0,
      impagoCentavos: 0,
      faltanPrecios: false,
      ultimaFecha: compra.fecha,
      compras: [],
    };
    grupo.totalCentavos += compra.montoCentavos;
    if (!compra.pagadoEn) grupo.impagoCentavos += compra.montoCentavos;
    if (compra.faltanPrecios) grupo.faltanPrecios = true;
    if (compra.fecha > grupo.ultimaFecha) grupo.ultimaFecha = compra.fecha;
    grupo.compras.push(compra);
    grupos.set(k, grupo);
  }
  return grupos;
}

function contarCompras(n: number): string {
  return n === 1 ? "1 compra" : `${n} compras`;
}

export function agruparPorProveedor(
  lista: CompraDelHistorial[],
): GrupoDeCompras[] {
  const grupos = acumular(
    lista,
    (c) => c.proveedorId,
    (c) => c.proveedor,
  );
  for (const grupo of grupos.values()) {
    grupo.detalle = contarCompras(grupo.compras.length);
  }
  // El que más plata se llevó, primero: es el que mueve la aguja.
  return [...grupos.values()].sort((a, b) => b.totalCentavos - a.totalCentavos);
}

export function agruparPorMes(lista: CompraDelHistorial[]): GrupoDeCompras[] {
  const grupos = acumular(
    lista,
    (c) => c.fecha.slice(0, 7),
    (c) => c.fecha.slice(0, 7),
  );
  const ordenados = [...grupos.values()].sort((a, b) =>
    a.clave < b.clave ? 1 : -1,
  );

  // Contra el mes anterior: un total suelto no dice si los costos se fueron
  // para arriba, y esa es la pregunta que se le hace a esta pantalla.
  ordenados.forEach((grupo, i) => {
    const previo = ordenados[i + 1];
    const base = contarCompras(grupo.compras.length);
    if (!previo || previo.totalCentavos === 0) {
      grupo.detalle = base;
      return;
    }
    const delta = Math.round(
      ((grupo.totalCentavos - previo.totalCentavos) / previo.totalCentavos) * 100,
    );
    grupo.detalle =
      delta === 0
        ? `${base} · igual que el mes anterior`
        : `${base} · ${delta > 0 ? "+" : ""}${delta}% vs el mes anterior`;
  });

  return ordenados;
}

export function agruparPorEstado(lista: CompraDelHistorial[]): GrupoDeCompras[] {
  const grupos = acumular(
    lista,
    (c) => (c.pagadoEn ? "pagadas" : "impagas"),
    (c) => (c.pagadoEn ? "Pagadas" : "Sin pagar"),
  );
  for (const grupo of grupos.values()) {
    grupo.detalle =
      grupo.clave === "impagas"
        ? `${contarCompras(grupo.compras.length)} · esto es lo que se debe`
        : contarCompras(grupo.compras.length);
  }
  // Lo que se debe va primero: es lo accionable.
  return [...grupos.values()].sort((a) => (a.clave === "impagas" ? -1 : 1));
}

/* ── El corte que agrupa RENGLONES ────────────────────────────────────────── */

export type CompraDeProducto = {
  compraId: string;
  fecha: string;
  proveedor: string;
  importeCentavos: number | null;
  costoCentavos: number | null;
  porCada: string | null;
};

export type GrupoDeProducto = {
  clave: string;
  nombre: string;
  veces: number;
  totalCentavos: number;
  ultimoCosto: CompraDeProducto | null;
  primerCosto: CompraDeProducto | null;
  /**
   * Cuánto cambió el costo entre la primera y la última compra del período.
   * `null` cuando no se puede comparar: una sola compra, o unidades distintas
   * entre una y otra (comparar $/unidad contra $/kilo da un porcentaje que no
   * significa nada).
   */
  variacion: number | null;
  compras: CompraDeProducto[];
};

/**
 * Acá la unidad de análisis deja de ser la compra y pasa a ser el renglón. El
 * total de cada producto es lo que se gastó en ÉL, no lo que salió esa factura:
 * sumar todos los grupos da menos que el total del período, porque los
 * renglones sin importe y la diferencia entre el total declarado y la suma de
 * renglones no caen en ningún producto. La pantalla lo dice en vez de esconderlo.
 */
export function agruparPorProducto(
  lista: CompraDelHistorial[],
): GrupoDeProducto[] {
  const grupos = new Map<string, GrupoDeProducto>();

  for (const compra of lista) {
    for (const renglon of compra.renglones) {
      if (renglon.importeCentavos == null && !renglon.descripcion) continue;
      // Si el renglón no enganchó con un producto, se agrupa por su texto: es
      // preferible a tirarlo, aunque no se pueda cruzar con el catálogo.
      const clave = renglon.productoId ?? `texto:${renglon.descripcion ?? ""}`;

      const entrada: CompraDeProducto = {
        compraId: compra.id,
        fecha: compra.fecha,
        proveedor: compra.proveedor,
        importeCentavos: renglon.importeCentavos,
        costoCentavos: renglon.costoCentavos,
        porCada: renglon.porCada,
      };

      const grupo = grupos.get(clave) ?? {
        clave,
        nombre: renglon.descripcion ?? "sin nombre",
        veces: 0,
        totalCentavos: 0,
        ultimoCosto: null,
        primerCosto: null,
        variacion: null,
        compras: [],
      };
      grupo.veces += 1;
      grupo.totalCentavos += renglon.importeCentavos ?? 0;
      grupo.compras.push(entrada);
      grupos.set(clave, grupo);
    }
  }

  for (const grupo of grupos.values()) {
    // Vienen de la compra más nueva a la más vieja.
    const conCosto = grupo.compras.filter((c) => c.costoCentavos != null);
    grupo.ultimoCosto = conCosto[0] ?? null;
    grupo.primerCosto = conCosto[conCosto.length - 1] ?? null;

    const ultimo = grupo.ultimoCosto;
    const primero = grupo.primerCosto;
    if (
      ultimo &&
      primero &&
      ultimo !== primero &&
      // Sin esto, comparar "$3.000 cada una" contra "$9.500 el kilo" daría un
      // porcentaje inventado. Si cambió la unidad, no hay comparación posible.
      ultimo.porCada === primero.porCada &&
      primero.costoCentavos! > 0
    ) {
      grupo.variacion = Math.round(
        ((ultimo.costoCentavos! - primero.costoCentavos!) /
          primero.costoCentavos!) *
          100,
      );
    }
  }

  return [...grupos.values()].sort((a, b) => b.totalCentavos - a.totalCentavos);
}

/** Cuánta plata del período quedó desglosada en renglones con importe. */
export function totalDesglosado(lista: CompraDelHistorial[]): number {
  return lista.reduce(
    (total, compra) =>
      total +
      compra.renglones.reduce((t, r) => t + (r.importeCentavos ?? 0), 0),
    0,
  );
}

/** La compra más vieja que hay cargada, para ofrecer "todo" con sentido. */
export async function primeraCompra(): Promise<string | null> {
  const db = await getDb();
  const [fila] = await db
    .select({ fecha: compras.fecha })
    .from(compras)
    .where(isNull(compras.anuladoEn))
    .orderBy(asc(compras.fecha))
    .limit(1);
  return fila?.fecha ?? null;
}
