import Link from "next/link";
import type { Metadata } from "next";
import BotonAnularFila from "@/components/BotonAnularFila";
import FormVenta from "@/components/FormVenta";
import { resumenDelMes, ventasPorDia } from "@/lib/caja";
import { fechaLarga, hoyLocal } from "@/lib/fechas";
import { MEDIO_CORTO } from "@/lib/negocio";
import { formatearCentavos } from "@/lib/plata";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Ventas — El Osito" };

export default async function Ventas() {
  const hoy = hoyLocal();
  const [dias, mes] = await Promise.all([ventasPorDia(), resumenDelMes(hoy)]);

  const delMes = dias.filter((d) => d.fecha >= mes.desde && d.fecha <= mes.hasta);
  // El promedio se saca sobre los días que tuvieron venta, no sobre los 30 del
  // mes: si arrancaste a cargar el 20, dividir por 30 da un número que asusta
  // y no dice nada.
  const promedio = delMes.length
    ? Math.round(mes.ventasCentavos / delMes.length)
    : 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl leading-none">Ventas</h1>
        <p className="mt-1 text-sm text-tinta-suave">
          Lo que entró por el mostrador, día por día. El fiado no cuenta acá
          hasta que se cobra.
        </p>
      </div>

      <section className="rounded-2xl border border-linea bg-papel-hondo px-5 py-6">
        <p className="text-xs uppercase tracking-[0.18em] text-tinta-suave">
          En lo que va del mes
        </p>
        <p className="cifra mt-1 text-4xl font-medium text-pago sm:text-5xl">
          {formatearCentavos(mes.ventasCentavos)}
        </p>
        <p className="mt-1 text-sm text-tinta-suave">
          {delMes.length === 0
            ? "Ningún día con ventas anotadas todavía."
            : `${delMes.length} ${delMes.length === 1 ? "día anotado" : "días anotados"} · ${formatearCentavos(promedio)} por día`}
        </p>
      </section>

      <section className="rounded-2xl border border-linea bg-white/60 px-4 py-3.5">
        <h2 className="font-display text-xl leading-none">Anotar venta</h2>
        <div className="mt-3">
          <FormVenta fecha={hoy} />
        </div>
      </section>

      {dias.length === 0 ? (
        <p className="text-sm text-tinta-suave">
          Todavía no hay ventas anotadas.
        </p>
      ) : (
        <ul className="space-y-3">
          {dias.map((dia) => (
            <li
              key={dia.fecha}
              className="rounded-2xl border border-linea bg-white/60 px-4 py-3"
            >
              <div className="flex items-baseline justify-between gap-3">
                <Link
                  href={dia.fecha === hoy ? "/caja" : `/caja?f=${dia.fecha}`}
                  className="text-sm underline underline-offset-4"
                >
                  {dia.fecha === hoy ? "Hoy" : fechaLarga(dia.fecha)}
                </Link>
                <span className="cifra text-sm font-medium text-pago">
                  {formatearCentavos(dia.totalCentavos)}
                </span>
              </div>

              {/* Las cargas sueltas sólo valen la pena si hubo más de una: con
                  una sola, repetir el mismo número abajo es ruido. */}
              {dia.cargas.length > 1 && (
                <ul className="mt-2 divide-y divide-linea border-t border-linea">
                  {dia.cargas.map((carga) => (
                    <li
                      key={carga.id}
                      className="flex items-center justify-between gap-3 py-1.5 text-xs"
                    >
                      <span className="min-w-0 truncate text-tinta-suave">
                        {carga.nota || "sin detalle"} · {MEDIO_CORTO[carga.medio]}
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        <span className="cifra">
                          {formatearCentavos(carga.montoCentavos)}
                        </span>
                        <BotonAnularFila que="venta" id={carga.id} />
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              {dia.cargas.length === 1 && (
                <div className="mt-1 flex items-center justify-between gap-3 text-xs text-tinta-suave">
                  <span className="min-w-0 truncate">
                    {dia.cargas[0].nota || "sin detalle"} ·{" "}
                    {MEDIO_CORTO[dia.cargas[0].medio]}
                  </span>
                  <BotonAnularFila que="venta" id={dia.cargas[0].id} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
