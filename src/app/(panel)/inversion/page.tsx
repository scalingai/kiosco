import type { Metadata } from "next";
import { estadoDeLaInversion } from "@/lib/inversion";
import { fechaCorta } from "@/lib/fechas";
import { ETIQUETA_GASTO } from "@/lib/negocio";
import { formatearCentavos } from "@/lib/plata";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Inversión inicial — El Osito" };

/**
 * La inversión inicial: lo que cada socio puso para abrir contra lo que se
 * comprometió a poner.
 *
 * Existe aparte de /caja porque contesta otra pregunta. La caja contesta "cómo
 * nos fue hoy"; esto contesta "cuánto falta para terminar de poner lo que
 * pusimos de palabra". Es un acumulado sin fecha de cierre, y mezclarlo con el
 * día haría que el mes de apertura se lea como una catástrofe: son millones que
 * salieron del bolsillo de los dos, no del mostrador.
 */

/** La barra de avance. El número solo no dice de un vistazo cuánto falta. */
function Barra({ porcentaje }: { porcentaje: number }) {
  return (
    <div
      className="mt-3 h-2.5 overflow-hidden rounded-full bg-papel-hondo"
      role="img"
      aria-label={`${Math.round(porcentaje)}% puesto`}
    >
      <div
        className="h-full rounded-full bg-acento transition-[width]"
        style={{ width: `${Math.max(porcentaje, porcentaje > 0 ? 2 : 0)}%` }}
      />
    </div>
  );
}

export default async function Inversion() {
  const estado = await estadoDeLaInversion();
  const completa = estado.faltaCentavos === 0 && estado.objetivoCentavos > 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl leading-none">Inversión inicial</h1>
        <p className="mt-1.5 text-sm text-tinta-suave">
          Lo que puso cada uno para abrir. No entra en el resultado del día: es
          plata del bolsillo de los socios, no de la caja.
        </p>
      </div>

      {/* El total arriba: es lo primero que se mira al entrar. */}
      <section className="rounded-2xl border border-linea bg-tarjeta px-4 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 className="font-display text-xl leading-none">Entre los dos</h2>
          <span className="cifra text-sm text-tinta-suave">
            {formatearCentavos(estado.puestoCentavos)} de{" "}
            {formatearCentavos(estado.objetivoCentavos)}
          </span>
        </div>
        <Barra porcentaje={estado.porcentaje} />
        <p className="mt-3 text-sm">
          {completa ? (
            <span className="font-medium text-acento">
              Está completa: se puso todo lo comprometido.
            </span>
          ) : (
            <>
              Falta poner{" "}
              <span className="cifra font-medium text-deuda">
                {formatearCentavos(estado.faltaCentavos)}
              </span>
              .
            </>
          )}
        </p>

        {estado.sinSocioCentavos > 0 && (
          <p className="mt-2 rounded-lg bg-papel-hondo px-3 py-2 text-xs text-tinta-suave">
            Hay{" "}
            <span className="cifra">
              {formatearCentavos(estado.sinSocioCentavos)}
            </span>{" "}
            cargados sin decir quién los puso. Suman al total pero no se le
            pueden acreditar a nadie: abrí el gasto en Caja y elegí el socio.
          </p>
        )}
      </section>

      {estado.socios.length === 0 ? (
        <p className="rounded-2xl border border-linea bg-tarjeta px-4 py-3.5 text-sm text-tinta-suave">
          Todavía no hay socios cargados.
        </p>
      ) : (
        <div className="grid gap-4 escritorio:grid-cols-2">
          {estado.socios.map((socio) => (
            <section
              key={socio.id}
              className="rounded-2xl border border-linea bg-tarjeta px-4 py-3.5"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <h2 className="font-display text-xl leading-none">
                  {socio.nombre}
                </h2>
                <span className="cifra text-sm text-tinta-suave">
                  {Math.round(socio.porcentaje)}%
                </span>
              </div>

              <p className="cifra mt-2 text-2xl font-medium leading-none">
                {formatearCentavos(socio.puestoCentavos)}
              </p>
              <p className="mt-1 text-xs text-tinta-suave">
                de {formatearCentavos(socio.objetivoCentavos)}
              </p>

              <Barra porcentaje={socio.porcentaje} />

              <p className="mt-3 text-sm">
                {socio.faltaCentavos === 0 ? (
                  <span className="font-medium text-acento">
                    Ya puso todo lo suyo.
                  </span>
                ) : (
                  <>
                    Le falta{" "}
                    <span className="cifra font-medium text-deuda">
                      {formatearCentavos(socio.faltaCentavos)}
                    </span>
                  </>
                )}
              </p>

              {socio.renglones.length === 0 ? (
                <p className="mt-3 text-sm text-tinta-suave">
                  Todavía no puso nada.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-linea border-t border-linea">
                  {socio.renglones.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between gap-3 py-2"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm">
                          {r.descripcion || ETIQUETA_GASTO[r.categoria]}
                        </span>
                        <span className="cifra text-xs text-tinta-suave">
                          {fechaCorta(r.fecha)}
                        </span>
                      </span>
                      <span className="cifra shrink-0 text-sm font-medium">
                        {formatearCentavos(r.montoCentavos)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
