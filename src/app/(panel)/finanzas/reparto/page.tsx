import type { Metadata } from "next";
import AvisoCobertura, { textoCobertura } from "@/components/AvisoCobertura";
import CabeceraFinanzas from "@/components/CabeceraFinanzas";
import { TablaPartidas, TablaRetiros } from "@/components/TablasDeSocios";
import Tira from "@/components/Tira";
import { repartoAcumulado } from "@/lib/finanzas";
import { formatearCentavos } from "@/lib/plata";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Reparto — El Osito" };

function conSigno(centavos: number): string {
  return `${centavos < 0 ? "−" : ""}${formatearCentavos(Math.abs(centavos))}`;
}

/**
 * El reparto entre los socios.
 *
 * La regla la dijo el dueño: la ganancia se queda en el negocio hasta que
 * alguien la retira, y lo que se divide en partes iguales es el retiro, no la
 * ganancia. Por eso acá no hay un "50% para cada uno" sobre la ganancia: hay
 * cuánto quedó en el negocio, cuánto se llevó cada uno y cuánto le tocaba.
 *
 * Es acumulado de toda la vida del negocio, sin barra de período: lo retirado
 * en marzo y lo ganado en abril se compensan, y mirar un mes suelto daría un
 * "quedó" que no existe.
 */
export default async function Reparto() {
  const reparto = await repartoAcumulado();
  const { quedoCentavos, totales } = reparto;
  const hayVentas = reparto.coberturaPorcentaje !== null;

  return (
    <div className="space-y-3">
      <CabeceraFinanzas activa="/finanzas/reparto" />

      <Tira
        datos={[
          {
            etiqueta: "Ganancia acumulada",
            valor: conSigno(reparto.gananciaCentavos),
            tono: reparto.gananciaCentavos >= 0 ? "pago" : "deuda",
            pie: hayVentas
              ? textoCobertura(
                  reparto.coberturaPorcentaje,
                  reparto.coberturaCompleta,
                )
              : "todavía no hay ventas",
          },
          {
            etiqueta: "Retirado",
            valor: formatearCentavos(reparto.retiradoCentavos),
            tono: "deuda",
            pie:
              reparto.retiros.length === 1
                ? "1 retiro"
                : `${reparto.retiros.length} retiros`,
          },
          {
            etiqueta: "A cada uno, de lo que queda",
            valor: formatearCentavos(reparto.deLoQueQuedaCentavos),
            tono: "suave",
            pie: "si hoy se retirara todo",
          },
        ]}
        destacado={{
          etiqueta: "Quedó en el negocio",
          valor: conSigno(quedoCentavos),
          tono: quedoCentavos >= 0 ? "pago" : "deuda",
          pie: "ganancia acumulada − retirado",
        }}
      />

      <AvisoCobertura
        porcentaje={totales.coberturaPorcentaje}
        completa={totales.coberturaCompleta}
        ventasCentavos={totales.ventasCentavos}
        ventasConCostoCentavos={totales.ventasConCostoCentavos}
      />

      {reparto.sinSocioCentavos > 0 && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
          Hay{" "}
          <span className="cifra">
            {formatearCentavos(reparto.sinSocioCentavos)}
          </span>{" "}
          de retiros cargados sin decir quién los hizo. Cuentan en el total pero
          no se le anotan a ningún socio, así que la diferencia de cada uno no
          es exacta hasta que se asignen.
        </p>
      )}

      <section className="overflow-hidden rounded-xl border border-linea bg-tarjeta px-4 py-1">
        <TablaPartidas
          filas={reparto.socios}
          retiradoCentavos={reparto.retiradoCentavos}
          sinSocioCentavos={reparto.sinSocioCentavos}
        />
        <p className="border-t border-linea py-2 text-xs text-tinta-suave">
          La ganancia se queda en el negocio hasta que alguien la retira; lo que
          se retira se divide en partes iguales. Para anotar un retiro: Balance,{" "}
          <span className="font-medium">+ Gasto</span>, &ldquo;Retiro
          personal&rdquo; y elegir el socio.
        </p>
      </section>

      <section className="overflow-hidden rounded-xl border border-linea bg-tarjeta px-4 py-1">
        <TablaRetiros
          filas={reparto.retiros}
          totalCentavos={reparto.retiradoCentavos}
        />
      </section>
    </div>
  );
}
