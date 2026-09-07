import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BotonAnularFila from "@/components/BotonAnularFila";
import BotonPagarCompra from "@/components/BotonPagarCompra";
import SelectorMes from "@/components/SelectorMes";
import {
  agruparPorProducto,
  deudaDelProveedor,
  historialDeCompras,
  obtenerProveedor,
  rangoDelMes,
} from "@/lib/compras";
import { fechaCorta, fechaLarga, hoyLocal, nombreDeMes } from "@/lib/fechas";
import { formatearContenido, MEDIO_CORTO } from "@/lib/negocio";
import { formatearCentavos } from "@/lib/plata";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/compras/proveedor/[id]">): Promise<Metadata> {
  const { id } = await params;
  const proveedor = await obtenerProveedor(id);
  return { title: proveedor ? `${proveedor.nombre} — El Osito` : "El Osito" };
}

const MES = /^\d{4}-\d{2}$/;

export default async function FichaProveedor({
  params,
  searchParams,
}: PageProps<"/compras/proveedor/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  const leer = (clave: string) => {
    const valor = query[clave];
    return Array.isArray(valor) ? valor[0] : valor;
  };

  const proveedor = await obtenerProveedor(id);
  if (!proveedor) notFound();

  const hoy = hoyLocal();
  const mesActual = hoy.slice(0, 7);
  const pedidoMes = leer("mes");
  const mes = pedidoMes && MES.test(pedidoMes) ? pedidoMes : mesActual;
  const verProductos = leer("ver") !== "compras";

  const { desde, hasta } = rangoDelMes(mes);
  const [lista, deuda] = await Promise.all([
    historialDeCompras({ desde, hasta, proveedorId: id }),
    deudaDelProveedor(id),
  ]);

  const total = lista.reduce((t, c) => t + c.montoCentavos, 0);
  const productos = agruparPorProducto(lista);

  const pestana = (activo: boolean) =>
    "flex-1 rounded-xl border px-3 py-2 text-center text-sm " +
    (activo
      ? "border-acento bg-acento text-white"
      : "border-linea bg-white/70 text-tinta");

  return (
    <div className="space-y-4">
      <Link
        href={`/compras?mes=${mes}`}
        className="inline-block text-sm text-tinta-suave underline underline-offset-4"
      >
        ← Compras de {nombreDeMes(mes)}
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl leading-none">
          {proveedor.nombre}
        </h1>
        <SelectorMes
          mes={mes}
          base={`/compras/proveedor/${id}`}
          tope={mesActual}
          extra={verProductos ? undefined : { ver: "compras" }}
        />
      </div>

      <section className="rounded-2xl border border-linea bg-papel-hondo px-5 py-5">
        <p className="text-xs uppercase tracking-[0.18em] text-tinta-suave">
          Le compraste en {nombreDeMes(mes)}
        </p>
        <p className="cifra mt-1 text-3xl font-medium sm:text-4xl">
          {formatearCentavos(total)}
        </p>
        <p className="mt-1 text-sm text-tinta-suave">
          {lista.length === 0
            ? "Ninguna compra este mes."
            : lista.length === 1
              ? "1 compra"
              : `${lista.length} compras`}
          {/* La deuda es de siempre, no del mes: una factura de agosto sin
              pagar no deja de existir porque estás parado en septiembre. */}
          {deuda > 0 && (
            <span className="text-deuda">
              {" · le debés "}
              {formatearCentavos(deuda)} en total
            </span>
          )}
        </p>
      </section>

      <div className="flex gap-2">
        <Link
          href={`/compras/proveedor/${id}?mes=${mes}`}
          className={pestana(verProductos)}
        >
          Qué le compro
        </Link>
        <Link
          href={`/compras/proveedor/${id}?mes=${mes}&ver=compras`}
          className={pestana(!verProductos)}
        >
          Sus compras
        </Link>
      </div>

      {lista.length === 0 ? (
        <p className="text-sm text-tinta-suave">
          No hay compras de este proveedor en {nombreDeMes(mes)}. Probá con otro
          mes.
        </p>
      ) : verProductos ? (
        productos.length === 0 ? (
          <p className="text-sm text-tinta-suave">
            Las compras de este mes se cargaron sólo con el total, sin detalle de
            qué vino.
          </p>
        ) : (
          <div className="space-y-3">
            {productos.map((p) => (
              <section
                key={p.clave}
                className="rounded-2xl border border-linea bg-white/60 px-4 py-3.5"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="min-w-0 truncate font-display text-xl leading-none">
                    {p.nombre}
                  </h2>
                  <span className="cifra shrink-0 text-sm font-medium">
                    {formatearCentavos(p.totalCentavos)}
                  </span>
                </div>

                <p className="mt-1 text-xs text-tinta-suave">
                  {p.veces === 1 ? "1 compra" : `${p.veces} compras`}
                  {p.ultimoCosto?.costoCentavos != null && (
                    <>
                      {" · última a "}
                      <span className="cifra text-tinta">
                        {formatearCentavos(p.ultimoCosto.costoCentavos)}
                      </span>{" "}
                      {p.ultimoCosto.porCada}
                    </>
                  )}
                  {p.variacion != null && p.variacion !== 0 && (
                    <span
                      className={p.variacion > 0 ? "text-deuda" : "text-pago"}
                    >
                      {" · "}
                      {p.variacion > 0 ? "+" : ""}
                      {p.variacion}% en el mes
                    </span>
                  )}
                </p>

                {/* Cada vez que entró, con su fecha: la fecha lleva al día
                    completo, que es donde se ve todo lo que llegó ese día. */}
                <ul className="mt-2 divide-y divide-linea border-t border-linea">
                  {p.compras.map((c, i) => (
                    <li
                      key={c.compraId + i}
                      className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5 text-xs"
                    >
                      <Link
                        href={`/compras/dia/${c.fecha}`}
                        className="text-tinta-suave underline underline-offset-4"
                      >
                        {fechaCorta(c.fecha)}
                      </Link>
                      <span className="flex items-baseline gap-3">
                        {c.costoCentavos != null && (
                          <span className="cifra text-tinta">
                            {formatearCentavos(c.costoCentavos)} {c.porCada}
                          </span>
                        )}
                        <span className="cifra text-tinta-suave">
                          {c.importeCentavos != null
                            ? formatearCentavos(c.importeCentavos)
                            : "sin importe"}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )
      ) : (
        <div className="space-y-3">
          {lista.map((compra) => (
            <section
              key={compra.id}
              className="rounded-2xl border border-linea bg-white/60 px-4 py-3.5"
            >
              <div className="flex items-baseline justify-between gap-3">
                <Link
                  href={`/compras/dia/${compra.fecha}`}
                  className="font-display text-xl leading-none underline underline-offset-4"
                >
                  {fechaLarga(compra.fecha)}
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
                    ? "pagada"
                    : `pagada el ${fechaCorta(compra.pagadoEn)}`
                  : "sin pagar"}
                {compra.medio && ` · ${MEDIO_CORTO[compra.medio]}`}
                {compra.comprobante && ` · N.º ${compra.comprobante}`}
                {compra.faltanPrecios && (
                  <span className="text-deuda"> · faltan precios</span>
                )}
              </p>

              {compra.renglones.length > 0 && (
                <ul className="mt-2 space-y-0.5 border-t border-linea pt-2">
                  {compra.renglones.map((r) => (
                    <li
                      key={r.id}
                      className="flex flex-wrap items-baseline gap-x-2 text-xs text-tinta-suave"
                    >
                      <span className="text-tinta">
                        {r.descripcion || "sin nombre"}
                      </span>
                      <span className="cifra">
                        {r.cantidad} ×{" "}
                        {formatearContenido(r.unidadesPorBulto, r.unidad)}
                      </span>
                      {r.importeCentavos != null && (
                        <span className="cifra">
                          {formatearCentavos(r.importeCentavos)}
                        </span>
                      )}
                      {r.costoCentavos != null && (
                        <span className="cifra text-tinta">
                          {formatearCentavos(r.costoCentavos)} {r.porCada}
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
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
