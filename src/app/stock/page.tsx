import type { Metadata } from "next";
import {
  BotonArchivar,
  BotonFalta,
  FormProducto,
} from "@/components/AccionesStock";
import { fechaCorta } from "@/lib/fechas";
import { formatearContenido } from "@/lib/negocio";
import { formatearCentavos } from "@/lib/plata";
import { listarStock } from "@/lib/stock";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Stock — El Osito" };

export default async function Stock() {
  const filas = await listarStock();
  const faltantes = filas.filter((f) => f.falta);
  const resto = filas.filter((f) => !f.falta);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl leading-none">Stock</h1>
        <p className="mt-1 text-sm text-tinta-suave">
          Qué se vende, a quién se le compra y a cuánto salió la última vez.
          {/* Decir qué NO es evita que alguien espere un número de unidades
              que la app nunca prometió tener. */}{" "}
          No lleva la cuenta de cuántas unidades quedan: lo que se marca a mano
          es lo que falta.
        </p>
      </div>

      <section className="rounded-2xl border border-linea bg-white/60 px-4 py-3.5">
        <FormProducto />
      </section>

      {faltantes.length > 0 && (
        <section className="rounded-2xl border border-linea bg-deuda-tenue px-4 py-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="font-display text-xl leading-none text-deuda">
              Falta comprar
            </h2>
            <span className="text-sm text-deuda">
              {faltantes.length === 1
                ? "1 producto"
                : faltantes.length + " productos"}
            </span>
          </div>
          <ul className="mt-3 divide-y divide-linea">
            {faltantes.map((f) => (
              <li
                key={f.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {f.nombre}
                  </span>
                  <span className="text-xs text-tinta-suave">
                    {f.proveedor ?? "sin proveedor"}
                    {f.costoCentavos != null && (
                      <>
                        {" · "}
                        <span className="cifra">
                          {formatearCentavos(f.costoCentavos)}
                        </span>{" "}
                        {f.porCada}
                      </>
                    )}
                  </span>
                </span>
                <BotonFalta id={f.id} falta />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-2xl border border-linea bg-white/60 px-4 py-3.5">
        <h2 className="font-display text-xl leading-none">
          {faltantes.length > 0 ? "El resto" : "Productos"}
        </h2>

        {resto.length === 0 ? (
          <p className="mt-3 text-sm text-tinta-suave">
            Todavía no hay nada. La lista se llena sola: cada renglón con nombre
            de una compra entra acá con su último costo.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-linea">
            {resto.map((f) => (
              <li key={f.id} className="py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-sm font-medium">
                    {f.nombre}
                  </span>
                  <span className="cifra shrink-0 text-sm">
                    {f.costoCentavos != null ? (
                      <>
                        {formatearCentavos(f.costoCentavos)}{" "}
                        <span className="text-xs font-normal text-tinta-suave">
                          {f.porCada}
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </span>
                </div>

                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-tinta-suave">
                  <span>{f.proveedor ?? "sin proveedor"}</span>
                  {f.ultimaCompra ? (
                    <span>
                      última compra {fechaCorta(f.ultimaCompra)}
                      {f.unidadesPorBulto != null &&
                        f.unidad != null &&
                        f.unidadesPorBulto > 1 &&
                        ` · venía de a ${formatearContenido(f.unidadesPorBulto, f.unidad)}`}
                    </span>
                  ) : (
                    <span>nunca se compró desde la app</span>
                  )}
                  <span className="ml-auto flex items-center gap-3">
                    <BotonArchivar id={f.id} />
                    <BotonFalta id={f.id} falta={false} />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
