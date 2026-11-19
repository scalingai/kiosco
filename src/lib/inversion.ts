import "server-only";

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db/client";
import { gastos, socios } from "@/db/schema";
import { normalizarNombre } from "@/lib/nombres";
import { type CategoriaGasto, OBJETIVO_APORTE_CENTAVOS } from "@/lib/negocio";

/**
 * ── La inversión inicial ───────────────────────────────────────────────────
 *
 * Lo que cada socio puso para abrir, contra lo que se comprometió a poner.
 *
 * Vive aparte de `caja.ts` por lo mismo que la plata está aparte del balance:
 * no es un día del kiosco, es un acumulado que no se cierra hasta que los dos
 * llegan a su número. La pregunta que tiene que contestar esta pantalla es una
 * sola —**cuánto le falta a cada uno**— y todo lo de acá existe para eso.
 *
 * Un socio sin ningún gasto cargado APARECE, con cero puesto. Si la lista
 * saliera de los gastos, el que todavía no puso un peso sería invisible, que
 * es exactamente el que hay que ver.
 */

export type RenglonAporte = {
  id: string;
  categoria: CategoriaGasto;
  descripcion: string | null;
  montoCentavos: number;
  fecha: string;
};

export type AporteDeSocio = {
  id: string;
  nombre: string;
  objetivoCentavos: number;
  puestoCentavos: number;
  /** lo que le falta para llegar al objetivo; nunca negativo */
  faltaCentavos: number;
  /** de 0 a 100, para dibujar la barra */
  porcentaje: number;
  renglones: RenglonAporte[];
};

export type Inversion = {
  socios: AporteDeSocio[];
  /** lo puesto por alguien que no es ninguno de los socios cargados */
  sinSocioCentavos: number;
  objetivoCentavos: number;
  puestoCentavos: number;
  faltaCentavos: number;
  porcentaje: number;
};

export async function listarSocios() {
  const db = await getDb();
  return db
    .select({
      id: socios.id,
      nombre: socios.nombre,
      objetivoCentavos: socios.objetivoCentavos,
    })
    .from(socios)
    .where(isNull(socios.archivadoEn))
    .orderBy(asc(socios.posicion), asc(socios.nombre));
}

/**
 * Crea el socio si no estaba, y si estaba lo devuelve. Misma idea que
 * `buscarOCrearProductoCon`: el nombre se compara normalizado —la misma
 * función que usa el índice único de la base—, así "Agustín D" y "agustin d"
 * son uno y no dos.
 */
export async function buscarOCrearSocio(
  nombre: string,
  objetivoCentavos = OBJETIVO_APORTE_CENTAVOS,
  posicion = 0,
) {
  const limpio = nombre.trim();
  if (!limpio) throw new Error("El socio necesita un nombre.");
  const normalizado = normalizarNombre(limpio);

  const db = await getDb();
  const [existente] = await db
    .select()
    .from(socios)
    .where(eq(socios.nombreNormalizado, normalizado))
    .limit(1);
  if (existente) return existente;

  const [fila] = await db
    .insert(socios)
    .values({
      nombre: limpio,
      nombreNormalizado: normalizado,
      objetivoCentavos,
      posicion,
    })
    .returning();
  return fila;
}

/**
 * El estado de la inversión inicial, entero.
 *
 * Dos queries y no una por socio: la cantidad de socios es chica pero el N+1
 * se paga igual, y acá sobra con traer todos los renglones de inversión de una
 * y repartirlos en memoria.
 */
export async function estadoDeLaInversion(): Promise<Inversion> {
  const db = await getDb();

  const [lista, renglones] = await Promise.all([
    listarSocios(),
    db
      .select({
        id: gastos.id,
        socioId: gastos.socioId,
        categoria: gastos.categoria,
        descripcion: gastos.descripcion,
        montoCentavos: gastos.montoCentavos,
        fecha: gastos.fecha,
      })
      .from(gastos)
      .where(
        and(eq(gastos.categoria, "inversion"), isNull(gastos.anuladoEn)),
      )
      .orderBy(asc(gastos.fecha), asc(gastos.creadoEn)),
  ]);

  const porSocio = new Map<string, RenglonAporte[]>();
  let sinSocioCentavos = 0;
  for (const r of renglones) {
    if (!r.socioId) {
      sinSocioCentavos += r.montoCentavos;
      continue;
    }
    const acumulado = porSocio.get(r.socioId) ?? [];
    acumulado.push({
      id: r.id,
      categoria: r.categoria,
      descripcion: r.descripcion,
      montoCentavos: r.montoCentavos,
      fecha: r.fecha,
    });
    porSocio.set(r.socioId, acumulado);
  }

  const detalle: AporteDeSocio[] = lista.map((s) => {
    const propios = porSocio.get(s.id) ?? [];
    const puestoCentavos = propios.reduce((t, r) => t + r.montoCentavos, 0);
    return {
      id: s.id,
      nombre: s.nombre,
      objetivoCentavos: s.objetivoCentavos,
      puestoCentavos,
      // Nunca negativo: poner MÁS de lo comprometido no es "falta -50.000".
      faltaCentavos: Math.max(0, s.objetivoCentavos - puestoCentavos),
      porcentaje:
        s.objetivoCentavos > 0
          ? Math.min(100, (puestoCentavos / s.objetivoCentavos) * 100)
          : 0,
      renglones: propios,
    };
  });

  const objetivoCentavos = detalle.reduce((t, s) => t + s.objetivoCentavos, 0);
  const puestoCentavos =
    detalle.reduce((t, s) => t + s.puestoCentavos, 0) + sinSocioCentavos;

  return {
    socios: detalle,
    sinSocioCentavos,
    objetivoCentavos,
    puestoCentavos,
    faltaCentavos: Math.max(0, objetivoCentavos - puestoCentavos),
    porcentaje:
      objetivoCentavos > 0
        ? Math.min(100, (puestoCentavos / objetivoCentavos) * 100)
        : 0,
  };
}

/**
 * Cuánto se puso en total. Lo usa el resumen de Inicio, que no necesita el
 * detalle y no tiene por qué pagar la query grande.
 */
export async function totalInvertido(): Promise<number> {
  const db = await getDb();
  const [fila] = await db
    .select({ total: sql<string>`coalesce(sum(monto_centavos), 0)` })
    .from(gastos)
    .where(and(eq(gastos.categoria, "inversion"), isNull(gastos.anuladoEn)));
  return Number(fila?.total ?? 0);
}
