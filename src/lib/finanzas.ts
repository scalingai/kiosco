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
  notInArray,
  sql,
  type SQL,
} from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { getDb } from "@/db/client";
import {
  compras,
  comprasPagos,
  gastos,
  movimientos,
  proveedores,
  socios,
  ventas,
  ventasItems,
  ventasPagos,
} from "@/db/schema";
import {
  esGastoOperativo,
  esInversion,
  esRetiro,
  ETIQUETA_GASTO,
  type CategoriaGasto,
  type MedioPago,
} from "@/lib/negocio";
import type { Rango } from "@/lib/periodo";

/**
 * ── Finanzas ───────────────────────────────────────────────────────────────
 *
 * Lo que entró, lo que salió y lo que de verdad se ganó. Vive aparte de
 * `caja.ts` a propósito: la caja contesta "qué hay en el cajón hoy" y esto
 * contesta "cómo viene el negocio". Son preguntas distintas y las dos tienen
 * que poder cambiar sin pisarse.
 *
 * ## La ganancia
 *
 * La ganancia de una venta es `precio × cantidad − costo × cantidad`, y el costo
 * es el que quedó CONGELADO en `ventas_items.costo_unitario_centavos` cuando se
 * cobró. No se reconstruye desde las compras ni se lee del producto: eso
 * reescribiría la historia cada vez que cambia un precio.
 *
 * Y acá está lo delicado: no toda venta tiene costo.
 *
 * - Una venta cargada como total suelto ("vendí $40.000 hoy") no tiene ítems.
 * - Un ítem de un producto que nunca se compró por la app tiene el costo en null.
 *
 * Esas ventas NO se cuentan como ganancia total ni como ganancia cero: no se
 * sabe. La misma regla que rige a todo el proyecto —un ítem sin precio no vale
 * cero, vale *todavía no sabemos*—. Por eso todo lo de acá devuelve, junto a la
 * ganancia, **sobre qué parte de las ventas está calculada**, y la pantalla lo
 * dice. Un número que parece exacto y no lo es es peor que no tenerlo.
 */

/** Cuántas filas dibuja la planilla como máximo. Los totales cuentan todo. */
export const TOPE_FILAS_FINANZAS = 400;

/** Lo único que necesitan estas consultas de un `Rango`. */
export type Tramo = Pick<Rango, "desde" | "hasta">;

export const TODO: Tramo = { desde: null, hasta: null };

/** Las sumas de Postgres vuelven como texto: se pasan a número en un solo lugar. */
function num(valor: string | number | null | undefined): number {
  return Number(valor ?? 0);
}

/** Las condiciones de fecha de un tramo; `todo` no filtra nada. */
function fechasDe(columna: AnyPgColumn, tramo: Tramo): (SQL | undefined)[] {
  return [
    tramo.desde ? gte(columna, tramo.desde) : undefined,
    tramo.hasta ? lte(columna, tramo.hasta) : undefined,
  ];
}

/**
 * Una venta cuenta como plata recién cuando se cobró: ni anulada, ni esperando
 * el QR. Misma regla que la caja del día.
 */
function ventasCobradas(tramo: Tramo) {
  return and(
    isNull(ventas.anuladoEn),
    isNull(ventas.pendienteEn),
    ...fechasDe(ventas.fecha, tramo),
  );
}

/** Una compra es plata que salió cuando se PAGÓ, no cuando llegó la mercadería. */
function comprasPagadas(tramo: Tramo) {
  return and(
    isNull(compras.anuladoEn),
    isNotNull(compras.pagadoEn),
    ...fechasDe(compras.pagadoEn, tramo),
  );
}

/** Los gastos que cuestan tener el negocio abierto: ni retiros ni inversión. */
function gastosOperativos(tramo: Tramo) {
  return and(
    isNull(gastos.anuladoEn),
    notInArray(gastos.categoria, ["retiro", "inversion"]),
    ...fechasDe(gastos.fecha, tramo),
  );
}

/* ── Los números del período ──────────────────────────────────────────────── */

export type Totales = {
  ventasCentavos: number;
  ventasCantidad: number;
  comprasCentavos: number;
  /** Sólo lo que cuesta tener el negocio abierto: sin retiros ni inversión. */
  gastosCentavos: number;
  /** Plata de un socio al negocio (inversión inicial); NO entra en la ganancia. */
  inversionCentavos: number;
  /** Plata del negocio a un socio; NO entra en la ganancia, la reparte. */
  retirosCentavos: number;
  fiadoCobradoCentavos: number;

  /**
   * De las ventas del período, cuánto vale (a precio de venta) lo que SÍ tiene
   * costo conocido. Es el denominador honesto de la ganancia.
   */
  ventasConCostoCentavos: number;
  /** Lo que costó eso mismo, congelado al vender. */
  costoConocidoCentavos: number;
  /** `ventasConCosto − costoConocido`: la ganancia de lo que se sabe. */
  margenCentavos: number;
  /**
   * Qué parte de las ventas tiene costo, de 0 a 100. `null` si no hubo ventas:
   * dividir por cero no es "0%", es "no hay nada que cubrir".
   */
  coberturaPorcentaje: number | null;
  /** `true` cuando TODAS las ventas del período tienen costo conocido. */
  coberturaCompleta: boolean;
  /**
   * Margen de lo conocido menos los gastos operativos. Con cobertura parcial es
   * un PISO, no el número real: los gastos están enteros y el margen no.
   */
  gananciaCentavos: number;
};

export async function totalesDelPeriodo(tramo: Tramo): Promise<Totales> {
  const db = await getDb();

  const [[filaVentas], [filaItems], [filaCompras], filasGastos, [filaFiado]] =
    await Promise.all([
      db
        .select({
          total: sql<string>`coalesce(sum(${ventas.montoCentavos}), 0)`,
          cantidad: sql<string>`count(*)`,
        })
        .from(ventas)
        .where(ventasCobradas(tramo)),

      // Se une con `ventas` para aplicar EXACTAMENTE el mismo filtro: un ítem
      // de una venta anulada o pendiente no es ganancia.
      db
        .select({
          conCosto: sql<string>`coalesce(sum(${ventasItems.precioUnitarioCentavos} * ${ventasItems.cantidad}) filter (where ${ventasItems.costoUnitarioCentavos} is not null), 0)`,
          costo: sql<string>`coalesce(sum(${ventasItems.costoUnitarioCentavos} * ${ventasItems.cantidad}), 0)`,
        })
        .from(ventasItems)
        .innerJoin(ventas, eq(ventas.id, ventasItems.ventaId))
        .where(ventasCobradas(tramo)),

      db
        .select({
          total: sql<string>`coalesce(sum(${compras.montoCentavos}), 0)`,
        })
        .from(compras)
        .where(comprasPagadas(tramo)),

      db
        .select({
          categoria: gastos.categoria,
          total: sql<string>`coalesce(sum(${gastos.montoCentavos}), 0)`,
        })
        .from(gastos)
        .where(and(isNull(gastos.anuladoEn), ...fechasDe(gastos.fecha, tramo)))
        .groupBy(gastos.categoria),

      db
        .select({
          total: sql<string>`coalesce(sum(${movimientos.montoCentavos}), 0)`,
        })
        .from(movimientos)
        .where(
          and(
            eq(movimientos.tipo, "pago"),
            isNull(movimientos.anuladoEn),
            ...fechasDe(movimientos.fecha, tramo),
          ),
        ),
    ]);

  let gastosCentavos = 0;
  let inversionCentavos = 0;
  let retirosCentavos = 0;
  for (const g of filasGastos) {
    const monto = num(g.total);
    if (esRetiro(g.categoria)) retirosCentavos += monto;
    else if (esInversion(g.categoria)) inversionCentavos += monto;
    else if (esGastoOperativo(g.categoria)) gastosCentavos += monto;
  }

  const ventasCentavos = num(filaVentas?.total);
  const ventasConCostoCentavos = num(filaItems?.conCosto);
  const costoConocidoCentavos = num(filaItems?.costo);
  const margenCentavos = ventasConCostoCentavos - costoConocidoCentavos;

  const coberturaPorcentaje =
    ventasCentavos > 0
      ? Math.min(100, (ventasConCostoCentavos / ventasCentavos) * 100)
      : null;

  return {
    ventasCentavos,
    ventasCantidad: num(filaVentas?.cantidad),
    comprasCentavos: num(filaCompras?.total),
    gastosCentavos,
    inversionCentavos,
    retirosCentavos,
    fiadoCobradoCentavos: num(filaFiado?.total),
    ventasConCostoCentavos,
    costoConocidoCentavos,
    margenCentavos,
    coberturaPorcentaje,
    // Un redondeo no puede declarar "completa" a una cobertura de 99,6%.
    coberturaCompleta:
      ventasCentavos > 0 && ventasConCostoCentavos >= ventasCentavos,
    gananciaCentavos: margenCentavos - gastosCentavos,
  };
}

/* ── La planilla ──────────────────────────────────────────────────────────── */

export type FilaBalance = {
  /** único entre los tres tipos: el id de la base puede repetirse entre tablas */
  clave: string;
  tipo: "venta" | "compra" | "gasto";
  id: string;
  fecha: string;
  concepto: string;
  categoria: string;
  medios: MedioPago[];
  /** Con signo: la venta suma, la compra y el gasto restan. */
  montoCentavos: number;
  /** Sólo las ventas tienen ganancia; para el resto no aplica. */
  tieneGanancia: boolean;
  /** La ganancia de lo que tiene costo. `null` = no se sabe, que NO es cero. */
  gananciaCentavos: number | null;
  /** La venta tiene una parte con costo y otra sin: la ganancia es de esa parte. */
  gananciaParcial: boolean;
};

export type PlanillaBalance = {
  filas: FilaBalance[];
  /** Cuántas filas tiene el período entero; `filas` puede traer menos. */
  totalFilas: number;
  recortada: boolean;
};

export async function planillaDelPeriodo(tramo: Tramo): Promise<PlanillaBalance> {
  const db = await getDb();

  const [filasVentas, filasCompras, filasGastos, conteos] = await Promise.all([
    db
      .select({
        id: ventas.id,
        fecha: ventas.fecha,
        nota: ventas.nota,
        medio: ventas.medio,
        montoCentavos: ventas.montoCentavos,
      })
      .from(ventas)
      .where(ventasCobradas(tramo))
      .orderBy(desc(ventas.fecha), desc(ventas.creadoEn))
      .limit(TOPE_FILAS_FINANZAS),

    db
      .select({
        id: compras.id,
        pagadoEn: compras.pagadoEn,
        proveedor: proveedores.nombre,
        comprobante: compras.comprobante,
        medio: compras.medio,
        montoCentavos: compras.montoCentavos,
      })
      .from(compras)
      .innerJoin(proveedores, eq(proveedores.id, compras.proveedorId))
      .where(comprasPagadas(tramo))
      .orderBy(desc(compras.pagadoEn), desc(compras.creadoEn))
      .limit(TOPE_FILAS_FINANZAS),

    db
      .select({
        id: gastos.id,
        fecha: gastos.fecha,
        categoria: gastos.categoria,
        descripcion: gastos.descripcion,
        medio: gastos.medio,
        montoCentavos: gastos.montoCentavos,
      })
      .from(gastos)
      .where(gastosOperativos(tramo))
      .orderBy(desc(gastos.fecha), desc(gastos.creadoEn))
      .limit(TOPE_FILAS_FINANZAS),

    Promise.all([
      db
        .select({ n: sql<string>`count(*)` })
        .from(ventas)
        .where(ventasCobradas(tramo)),
      db
        .select({ n: sql<string>`count(*)` })
        .from(compras)
        .where(comprasPagadas(tramo)),
      db
        .select({ n: sql<string>`count(*)` })
        .from(gastos)
        .where(gastosOperativos(tramo)),
    ]),
  ]);

  const idsVentas = filasVentas.map((v) => v.id);
  const idsCompras = filasCompras.map((c) => c.id);

  // El detalle de las que se muestran, en una consulta por tipo y no una por fila.
  const [itemsPorVenta, pagosDeVentas, pagosDeCompras] = await Promise.all([
    idsVentas.length
      ? db
          .select({
            ventaId: ventasItems.ventaId,
            cantidad: sql<string>`count(*)`,
            conCosto: sql<string>`coalesce(sum(${ventasItems.precioUnitarioCentavos} * ${ventasItems.cantidad}) filter (where ${ventasItems.costoUnitarioCentavos} is not null), 0)`,
            costo: sql<string>`coalesce(sum(${ventasItems.costoUnitarioCentavos} * ${ventasItems.cantidad}), 0)`,
          })
          .from(ventasItems)
          .where(inArray(ventasItems.ventaId, idsVentas))
          .groupBy(ventasItems.ventaId)
      : [],
    idsVentas.length
      ? db
          .select({ ventaId: ventasPagos.ventaId, medio: ventasPagos.medio })
          .from(ventasPagos)
          .where(inArray(ventasPagos.ventaId, idsVentas))
          .orderBy(asc(ventasPagos.creadoEn))
      : [],
    idsCompras.length
      ? db
          .select({ compraId: comprasPagos.compraId, medio: comprasPagos.medio })
          .from(comprasPagos)
          .where(inArray(comprasPagos.compraId, idsCompras))
          .orderBy(asc(comprasPagos.creadoEn))
      : [],
  ]);

  const detalle = new Map(itemsPorVenta.map((i) => [i.ventaId, i]));
  const mediosDeVenta = agruparMedios(
    pagosDeVentas.map((p) => [p.ventaId, p.medio]),
  );
  const mediosDeCompra = agruparMedios(
    pagosDeCompras.map((p) => [p.compraId, p.medio]),
  );

  const filas: FilaBalance[] = [];

  for (const v of filasVentas) {
    const d = detalle.get(v.id);
    const cantidadItems = num(d?.cantidad);
    const conCosto = num(d?.conCosto);
    const sabe = conCosto > 0;
    filas.push({
      clave: `venta-${v.id}`,
      tipo: "venta",
      id: v.id,
      fecha: v.fecha,
      concepto: v.nota?.trim() || "Venta",
      // Sin ítems, la venta es un total que alguien tecleó: se dice, porque es
      // justo la que no tiene ganancia que mostrar.
      categoria: cantidadItems === 0 ? "Total suelto" : "Venta",
      // Una venta vieja no tiene reparto: se usa el medio único de la venta.
      medios: mediosDeVenta.get(v.id) ?? [v.medio],
      montoCentavos: v.montoCentavos,
      tieneGanancia: true,
      gananciaCentavos: sabe ? conCosto - num(d?.costo) : null,
      gananciaParcial: sabe && conCosto < v.montoCentavos,
    });
  }

  for (const c of filasCompras) {
    const medios = mediosDeCompra.get(c.id) ?? (c.medio ? [c.medio] : []);
    filas.push({
      clave: `compra-${c.id}`,
      tipo: "compra",
      id: c.id,
      // El filtro garantiza `pagadoEn`; el valor por defecto es sólo para tipos.
      fecha: c.pagadoEn ?? "",
      concepto: c.comprobante
        ? `${c.proveedor} · N.º ${c.comprobante}`
        : c.proveedor,
      categoria: "Mercadería",
      medios,
      montoCentavos: -c.montoCentavos,
      tieneGanancia: false,
      gananciaCentavos: null,
      gananciaParcial: false,
    });
  }

  for (const g of filasGastos) {
    const etiqueta = ETIQUETA_GASTO[g.categoria as CategoriaGasto];
    filas.push({
      clave: `gasto-${g.id}`,
      tipo: "gasto",
      id: g.id,
      fecha: g.fecha,
      concepto: g.descripcion?.trim() || etiqueta,
      categoria: etiqueta,
      medios: [g.medio],
      montoCentavos: -g.montoCentavos,
      tieneGanancia: false,
      gananciaCentavos: null,
      gananciaParcial: false,
    });
  }

  // YYYY-MM-DD ordena bien como texto. Dentro del mismo día, ventas primero.
  const peso = { venta: 0, compra: 1, gasto: 2 } as const;
  filas.sort(
    (a, b) => b.fecha.localeCompare(a.fecha) || peso[a.tipo] - peso[b.tipo],
  );

  const totalFilas = conteos.reduce((t, [fila]) => t + num(fila?.n), 0);
  const recortadas = filas.slice(0, TOPE_FILAS_FINANZAS);

  return {
    filas: recortadas,
    totalFilas,
    recortada: totalFilas > recortadas.length,
  };
}

/** `[[id, medio], …]` → medios por id, sin repetir y en el orden en que se cargaron. */
function agruparMedios(pares: [string, MedioPago][]): Map<string, MedioPago[]> {
  const mapa = new Map<string, MedioPago[]>();
  for (const [id, medio] of pares) {
    const lista = mapa.get(id) ?? [];
    if (!lista.includes(medio)) lista.push(medio);
    mapa.set(id, lista);
  }
  return mapa;
}

/* ── El reparto ───────────────────────────────────────────────────────────── */

export type FilaRetiro = {
  id: string;
  fecha: string;
  socioId: string | null;
  socio: string | null;
  descripcion: string | null;
  medio: MedioPago;
  montoCentavos: number;
};

export type PartidaDeSocio = {
  id: string;
  nombre: string;
  /** lo que se llevó */
  retiroCentavos: number;
  /** la parte que le toca de lo que se retiró entre todos */
  leTocaCentavos: number;
  /** `retiró − le toca`: positivo = se llevó de más, negativo = se llevó de menos */
  diferenciaCentavos: number;
};

export type Reparto = {
  /** los números de toda la vida del negocio, de donde sale la ganancia */
  totales: Totales;
  /** ganancia histórica, no sólo del período; ver `Totales.gananciaCentavos` */
  gananciaCentavos: number;
  coberturaPorcentaje: number | null;
  coberturaCompleta: boolean;
  retiradoCentavos: number;
  /** retiros cargados sin decir de quién: cuentan al total pero no a un socio */
  sinSocioCentavos: number;
  /** `ganancia − retirado`: lo que sigue siendo del negocio */
  quedoCentavos: number;
  /** lo que le tocaría a cada uno si hoy se retirara todo lo que quedó */
  deLoQueQuedaCentavos: number;
  socios: PartidaDeSocio[];
  retiros: FilaRetiro[];
};

/**
 * La ganancia se queda en el negocio hasta que alguien la retira. Lo que se
 * divide en partes iguales es **el retiro**, no la ganancia: la definió así el
 * dueño. No hace falta tabla nueva, los retiros son gastos con categoría
 * `retiro` y un `socio_id`.
 */
export async function repartoAcumulado(): Promise<Reparto> {
  const db = await getDb();

  const [totales, listaSocios, retiros] = await Promise.all([
    totalesDelPeriodo(TODO),
    db
      .select({ id: socios.id, nombre: socios.nombre })
      .from(socios)
      .where(isNull(socios.archivadoEn))
      .orderBy(asc(socios.posicion), asc(socios.nombre)),
    db
      .select({
        id: gastos.id,
        fecha: gastos.fecha,
        socioId: gastos.socioId,
        socio: socios.nombre,
        descripcion: gastos.descripcion,
        medio: gastos.medio,
        montoCentavos: gastos.montoCentavos,
      })
      .from(gastos)
      .leftJoin(socios, eq(socios.id, gastos.socioId))
      .where(and(isNull(gastos.anuladoEn), eq(gastos.categoria, "retiro")))
      .orderBy(desc(gastos.fecha), desc(gastos.creadoEn)),
  ]);

  const retiradoCentavos = retiros.reduce((t, r) => t + r.montoCentavos, 0);
  const sinSocioCentavos = retiros
    .filter((r) => !r.socioId)
    .reduce((t, r) => t + r.montoCentavos, 0);

  const cuantos = listaSocios.length;
  // Partes iguales. Con un solo socio (o ninguno) no hay nada que repartir.
  const leToca = cuantos > 0 ? Math.round(retiradoCentavos / cuantos) : 0;

  const quedoCentavos = totales.gananciaCentavos - retiradoCentavos;

  const partidas: PartidaDeSocio[] = listaSocios.map((s) => {
    const retiroCentavos = retiros
      .filter((r) => r.socioId === s.id)
      .reduce((t, r) => t + r.montoCentavos, 0);
    return {
      id: s.id,
      nombre: s.nombre,
      retiroCentavos,
      leTocaCentavos: leToca,
      diferenciaCentavos: retiroCentavos - leToca,
    };
  });

  return {
    totales,
    gananciaCentavos: totales.gananciaCentavos,
    coberturaPorcentaje: totales.coberturaPorcentaje,
    coberturaCompleta: totales.coberturaCompleta,
    retiradoCentavos,
    sinSocioCentavos,
    quedoCentavos,
    deLoQueQuedaCentavos:
      cuantos > 0 ? Math.round(Math.max(0, quedoCentavos) / cuantos) : 0,
    socios: partidas,
    retiros: retiros.map((r) => ({
      id: r.id,
      fecha: r.fecha,
      socioId: r.socioId,
      socio: r.socio,
      descripcion: r.descripcion,
      medio: r.medio,
      montoCentavos: r.montoCentavos,
    })),
  };
}
