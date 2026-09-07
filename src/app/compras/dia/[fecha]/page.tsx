import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BotonAnularFila from "@/components/BotonAnularFila";
import BotonPagarCompra from "@/components/BotonPagarCompra";
import { historialDeCompras } from "@/lib/compras";
import { fechaCorta, fechaLarga, hoyLocal } from "@/lib/fechas";
import { formatearContenido, MEDIO_CORTO } from "@/lib/negocio";
import { formatearCentavos } from "@/lib/plata";

export const dynamic = "force-dynamic";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export async function generateMetadata({
  params,
}: PageProps<"/compras/dia/[fecha]">): Promise<Metadata> {
  const { fecha } = await params;
  return {
    title: FECHA.test(fecha)
      ? `Compras del ${fechaCorta(fecha)} — El Osito`
      : "Compras — El Osito",
  };
}

/**
 * El último nivel: todo lo que entró un día puntual, de todos los proveedores.
 *
 * Se llega desde el proveedor o desde la lista de días, y contesta la pregunta
 * que ninguna de las dos contesta sola: "el martes, ¿qué me trajeron?".
 */
export default async function DiaDeCompras({
  params,
}: PageProps<"/compras/dia/[fecha]">) {
  const { fecha } = await params;
  if (!FECHA.test(fecha)) notFound();

  const lista = await historialDeCompras({ desde: fecha, hasta: fecha });
  const total = lista.reduce((t, c) => t + c.montoCentavos, 0);
  const pagado = lista.reduce(
    (t, c) => t + (c.pagadoEn ? c.montoCentavos : 0),
    0,
  );
  const mes = fecha.slice(0, 7);
  const hoy = hoyLocal();

  return (
    <div className="space-y-4">
      <Link
        href={`/compras?mes=${mes}&por=fecha`}
        className="inline-block text-sm text-tinta-suave underline underline-offset-4"
      >
        ← Todos los días
      </Link>

      <div>
        <h1 className="font-display text-3xl leading-none">
          {fecha === hoy ? "Hoy" : fechaCorta(fecha)}
        </h1>
        <p className="mt-1 text-sm text-tinta-suave">{fechaLarga(fecha)}</p>
      </div>

      <section className="rounded-2xl border border-linea bg-papel-hondo px-5 py-5">
        <p className="text-xs uppercase tracking-[0.18em] text-tinta-suave">
          Entró de mercadería
        </p>
        <p className="cifra mt-1 text-3xl font-medium sm:text-4xl">
          {formatearCentavos(total)}
        </p>
        <p className="mt-1 text-sm text-tinta-suave">
          {lista.length === 0
            ? "No llegó nada este día."
            : lista.length === 1
              ? "1 compra"
              : `${lista.length} compras`}
          {total > 0 && pagado < total && (
            <span className="text-deuda">
              {" · "}
              {formatearCentavos(total - pagado)} quedó a cuenta
            </span>
          )}
        </p>
      </section>

      {lista.length === 0 ? (
        <p className="text-sm text-tinta-suave">
          No hay compras cargadas con esta fecha.
        </p>
      ) : (
        <div className="space-y-3">
          {lista.map((compra) => (
            <section
              key={compra.id}
              className="rounded-2xl border border-linea bg-white/60 px-4 py-3.5"
            >
              <div className="flex items-baseline justify-between gap-3">
                <Link
                  href={`/compras/proveedor/${compra.proveedorId}?mes=${mes}`}
                  className="min-w-0 truncate font-display text-xl leading-none underline underline-offset-4"
                >
                  {compra.proveedor}
                </Link>
                <span
                  className={
                    "cifra shrink-0 text-sm font-medium " +
                    (compra.pagadoEn ? "text-tinta" : "text-deuda")
                  }
                >
                  {formatearCentavos(compra.montoCentavos)}
                </span>
              </div>

              <p className="mt-1 text-xs text-tinta-suave">
                {compra.pagadoEn
                  ? compra.pagadoEn === compra.fecha
                    ? "pagada el mismo día"
                    : `pagada el ${fechaCorta(compra.pagadoEn)}`
                  : "a cuenta, sin pagar"}
                {compra.medio && ` · ${MEDIO_CORTO[compra.medio]}`}
                {compra.comprobante && ` · N.º ${compra.comprobante}`}
                {compra.faltanPrecios && (
                  <span className="text-deuda"> · faltan precios</span>
                )}
              </p>

              {compra.renglones.length === 0 ? (
                <p className="mt-2 border-t border-linea pt-2 text-xs text-tinta-suave">
                  Se cargó sólo el total, sin detalle de qué vino.
                </p>
              ) : (
                <ul className="mt-2 space-y-1 border-t border-linea pt-2">
                  {compra.renglones.map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-baseline justify-between gap-x-3 text-xs"
                    >
                      <span className="min-w-0">
                        <span className="text-tinta">
                          {r.descripcion || "sin nombre"}
                        </span>{" "}
                        <span className="cifra text-tinta-suave">
                          {r.cantidad} ×{" "}
                          {formatearContenido(r.unidadesPorBulto, r.unidad)}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-baseline gap-3">
                        {r.costoCentavos != null && (
                          <span className="cifra text-tinta-suave">
                            {formatearCentavos(r.costoCentavos)} {r.porCada}
                          </span>
                        )}
                        <span className="cifra">
                          {r.importeCentavos != null
                            ? formatearCentavos(r.importeCentavos)
                            : "sin importe"}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {compra.nota && (
                <p className="mt-1 text-xs text-tinta-suave">{compra.nota}</p>
              )}

              <div className="mt-2 flex items-center gap-3">
                <BotonPagarCompra
                  id={compra.id}
                  pagadoEn={compra.pagadoEn}
                  hoy={hoy}
                />
                <BotonAnularFila que="compra" id={compra.id} />
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
