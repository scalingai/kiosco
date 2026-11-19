import type { Metadata } from "next";
import BarraAvance from "@/components/BarraAvance";
import CabeceraFinanzas from "@/components/CabeceraFinanzas";
import { TablaAportes } from "@/components/TablasDeSocios";
import Tira from "@/components/Tira";
import { estadoDeLaInversion } from "@/lib/inversion";
import { formatearCentavos } from "@/lib/plata";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Inversión — El Osito" };

/**
 * La inversión inicial: lo que cada socio puso para abrir contra lo que se
 * comprometió a poner.
 *
 * Es una solapa de Finanzas pero NO entra en el balance ni en la ganancia: es
 * plata que salió del bolsillo de los socios y nunca pasó por el mostrador.
 * Contarla como gasto haría que el mes de apertura se lea como una catástrofe
 * (`esGastoOperativo()` en `negocio.ts` la deja afuera).
 *
 * Es un acumulado sin fecha de cierre, por eso no lleva barra de período.
 */
export default async function Inversion() {
  const estado = await estadoDeLaInversion();
  const completa = estado.faltaCentavos === 0 && estado.objetivoCentavos > 0;

  return (
    <div className="space-y-3">
      <CabeceraFinanzas activa="/inversion" />

      <Tira
        datos={[
          ...estado.socios.map((s) => ({
            etiqueta: s.nombre,
            valor: formatearCentavos(s.puestoCentavos),
            tono: "normal" as const,
            pie: `de ${formatearCentavos(s.objetivoCentavos)} · ${Math.round(s.porcentaje)}%`,
          })),
          {
            etiqueta: "Objetivo",
            valor: formatearCentavos(estado.objetivoCentavos),
            tono: "suave" as const,
            pie: "entre todos",
          },
          {
            etiqueta: "Puesto",
            valor: formatearCentavos(estado.puestoCentavos),
            tono: "pago" as const,
            pie: `${Math.round(estado.porcentaje)}% del objetivo`,
          },
        ]}
        destacado={
          completa
            ? {
                etiqueta: "Inversión",
                valor: "Completa",
                tono: "pago",
                pie: "se puso todo lo comprometido",
              }
            : {
                etiqueta: "Falta poner",
                valor: formatearCentavos(estado.faltaCentavos),
                tono: "deuda",
                pie: "entre todos",
              }
        }
      />

      {/* La barra es lo único que se lee sin leer: el total y cada socio, en
          filas finas para que entren todos sin empujar la planilla. */}
      <section className="rounded-xl border border-linea bg-tarjeta px-4 py-3">
        <div className="space-y-2.5">
          <FilaDeAvance
            nombre="Entre los dos"
            porcentaje={estado.porcentaje}
            texto={`${formatearCentavos(estado.puestoCentavos)} de ${formatearCentavos(estado.objetivoCentavos)}`}
            alto="h-3"
            fuerte
          />
          {estado.socios.map((s) => (
            <FilaDeAvance
              key={s.id}
              nombre={s.nombre}
              porcentaje={s.porcentaje}
              texto={
                s.faltaCentavos === 0
                  ? "ya puso todo lo suyo"
                  : `le faltan ${formatearCentavos(s.faltaCentavos)}`
              }
            />
          ))}
        </div>

        {estado.sinSocioCentavos > 0 && (
          <p className="mt-3 rounded-lg bg-papel-hondo px-3 py-2 text-xs text-tinta-suave">
            Hay{" "}
            <span className="cifra">
              {formatearCentavos(estado.sinSocioCentavos)}
            </span>{" "}
            cargados sin decir quién los puso. Suman al total pero no se le
            pueden acreditar a nadie.
          </p>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-linea bg-tarjeta px-4 py-1">
        <TablaAportes filas={estado.aportes} totalCentavos={estado.puestoCentavos} />
        <p className="border-t border-linea py-2 text-xs text-tinta-suave">
          No entra en el balance ni en la ganancia: es plata de los socios, no
          de la caja. Para anotar un aporte: Balance, <span className="font-medium">+ Gasto</span>,
          &ldquo;Inversión inicial&rdquo; y elegir quién la puso.
        </p>
      </section>
    </div>
  );
}

function FilaDeAvance({
  nombre,
  porcentaje,
  texto,
  alto,
  fuerte,
}: {
  nombre: string;
  porcentaje: number;
  texto: string;
  alto?: string;
  fuerte?: boolean;
}) {
  return (
    <div className="grid grid-cols-[7rem_1fr] items-center gap-x-3 gap-y-1 sm:grid-cols-[9rem_1fr_14rem]">
      <span className={"truncate text-sm " + (fuerte ? "font-medium" : "")}>
        {nombre}
      </span>
      <BarraAvance porcentaje={porcentaje} alto={alto} />
      <span className="cifra col-span-2 text-xs text-tinta-suave sm:col-span-1 sm:text-right">
        {texto}
      </span>
    </div>
  );
}
