import type { Metadata } from "next";
import CabeceraVentas from "@/components/CabeceraVentas";
import TablaFiado from "@/components/TablaFiado";
import TarjetaPlanilla from "@/components/TarjetaPlanilla";
import Tira from "@/components/Tira";
import { listarClientes } from "@/lib/consultas";
import { leerFecha, leerPeriodo, resolverRango } from "@/lib/periodo";
import { formatearCentavos } from "@/lib/plata";
import { resumenDeMovimientos } from "@/lib/ventas";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Fiado — El Osito" };

function uno(valor: string | string[] | undefined): string | undefined {
  return Array.isArray(valor) ? valor[0] : valor;
}

export default async function Fiado({ searchParams }: PageProps<"/fiado">) {
  const params = await searchParams;
  const rango = resolverRango(
    leerPeriodo(uno(params.periodo)),
    leerFecha(uno(params.fecha)),
  );

  const [clientes, delPeriodo] = await Promise.all([
    listarClientes(),
    resumenDeMovimientos(rango),
  ]);

  // El saldo es de siempre, no del período: una deuda de hace tres meses sigue
  // en la calle aunque hoy no se haya movido. Por eso la planilla no se filtra
  // por fecha y sólo los dos números del medio dependen del período.
  const filas = clientes.filter((c) => c.saldoCentavos > 0 || c.faltanPrecios);
  const enLaCalle = clientes.reduce((t, c) => t + Math.max(c.saldoCentavos, 0), 0);
  const deudores = clientes.filter((c) => c.saldoCentavos > 0);
  // `listarClientes` ya viene ordenado de mayor a menor deuda.
  const mayor = deudores[0];

  return (
    <div className="space-y-3">
      <CabeceraVentas rango={rango} activa="/fiado" deben={deudores.length} />

      <Tira
        datos={[
          { etiqueta: "Deben", valor: deudores.length },
          {
            etiqueta: "El que más debe",
            valor: mayor ? (
              <span className="block max-w-40 truncate" title={mayor.nombre}>
                {mayor.nombre}
              </span>
            ) : (
              "—"
            ),
            pie: mayor ? formatearCentavos(mayor.saldoCentavos) : undefined,
          },
          {
            etiqueta: "Fiado del período",
            valor: formatearCentavos(delPeriodo.fiadoCentavos),
            tono: "deuda",
            pie: rango.titulo,
          },
          {
            etiqueta: "Cobrado del período",
            valor: formatearCentavos(delPeriodo.pagadoCentavos),
            tono: "pago",
            pie: rango.titulo,
          },
        ]}
        destacado={{
          etiqueta: "Fiado en la calle",
          valor: formatearCentavos(enLaCalle),
          tono: "deuda",
          pie: "lo que deben hoy, de todos los períodos",
        }}
      />

      <TarjetaPlanilla>
        <TablaFiado filas={filas} />
      </TarjetaPlanilla>
    </div>
  );
}
