import type { Metadata } from "next";
import CabeceraVentas from "@/components/CabeceraVentas";
import TablaMovimientos from "@/components/TablaMovimientos";
import TarjetaPlanilla from "@/components/TarjetaPlanilla";
import Tira from "@/components/Tira";
import { leerFecha, leerPeriodo, resolverRango } from "@/lib/periodo";
import { formatearCentavos } from "@/lib/plata";
import {
  contarDeudores,
  listarMovimientos,
  resumenDeMovimientos,
  TOPE_FILAS,
} from "@/lib/ventas";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Historial — El Osito" };

function uno(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

export default async function Historial({
  searchParams,
}: PageProps<"/historial">) {
  const params = await searchParams;
  const rango = resolverRango(
    leerPeriodo(uno(params.periodo)),
    leerFecha(uno(params.fecha)),
  );

  const [filas, resumen, deben] = await Promise.all([
    listarMovimientos(rango),
    resumenDeMovimientos(rango),
    contarDeudores(),
  ]);

  const neto = resumen.fiadoCentavos - resumen.pagadoCentavos;

  return (
    <div className="space-y-3">
      <CabeceraVentas rango={rango} activa="/historial" deben={deben} />

      <Tira
        datos={[
          { etiqueta: "Movimientos", valor: resumen.movimientos },
          {
            etiqueta: "Fiado",
            valor: formatearCentavos(resumen.fiadoCentavos),
            tono: "deuda",
          },
          {
            etiqueta: "Pagos",
            valor: formatearCentavos(resumen.pagadoCentavos),
            tono: "pago",
          },
        ]}
        destacado={{
          etiqueta: neto > 0 ? "La deuda creció" : "La deuda bajó",
          valor: formatearCentavos(Math.abs(neto)),
          tono: neto > 0 ? "deuda" : "pago",
          pie: rango.titulo,
        }}
      />

      <TarjetaPlanilla
        pie={
          resumen.movimientos > TOPE_FILAS
            ? `Se muestran los últimos ${TOPE_FILAS} movimientos; los números de arriba cuentan el período entero.`
            : undefined
        }
      >
        <TablaMovimientos filas={filas} />
      </TarjetaPlanilla>
    </div>
  );
}
