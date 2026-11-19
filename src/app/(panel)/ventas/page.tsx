import type { Metadata } from "next";
import CabeceraVentas from "@/components/CabeceraVentas";
import TablaVentas from "@/components/TablaVentas";
import TarjetaPlanilla from "@/components/TarjetaPlanilla";
import Tira from "@/components/Tira";
import { leerFecha, leerPeriodo, resolverRango } from "@/lib/periodo";
import { formatearCentavos } from "@/lib/plata";
import {
  contarDeudores,
  listarVentas,
  resumenDeVentas,
  TOPE_FILAS,
} from "@/lib/ventas";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Ventas — El Osito" };

function uno(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

export default async function Ventas({ searchParams }: PageProps<"/ventas">) {
  const params = await searchParams;
  const rango = resolverRango(
    leerPeriodo(uno(params.periodo)),
    leerFecha(uno(params.fecha)),
  );

  const [filas, resumen, deben] = await Promise.all([
    listarVentas(rango),
    resumenDeVentas(rango),
    contarDeudores(),
  ]);

  // El ticket promedio se saca sobre lo cobrado: una venta anulada o esperando
  // el QR no es plata que entró.
  const ticket = resumen.cobradas
    ? Math.round(resumen.cobradoCentavos / resumen.cobradas)
    : 0;

  const recortada = resumen.cobradas + resumen.pendientes + resumen.anuladas > TOPE_FILAS;

  return (
    <div className="space-y-3">
      <CabeceraVentas rango={rango} activa="/ventas" deben={deben} />

      <Tira
        datos={[
          { etiqueta: "Ventas", valor: resumen.cobradas },
          { etiqueta: "Ticket promedio", valor: formatearCentavos(ticket) },
          {
            etiqueta: "Pendientes",
            valor: resumen.pendientes,
            tono: resumen.pendientes > 0 ? "deuda" : "suave",
            pie: resumen.pendientes > 0 ? "esperando el QR" : undefined,
          },
          {
            etiqueta: "Anuladas",
            valor: resumen.anuladas,
            tono: "suave",
          },
        ]}
        destacado={{
          etiqueta: "Cobrado",
          valor: formatearCentavos(resumen.cobradoCentavos),
          pie: rango.titulo,
        }}
      />

      <TarjetaPlanilla
        pie={
          recortada
            ? `Se muestran las últimas ${TOPE_FILAS} ventas; los números de arriba cuentan el período entero.`
            : undefined
        }
      >
        <TablaVentas filas={filas} conFecha={rango.periodo !== "dia"} />
      </TarjetaPlanilla>
    </div>
  );
}
