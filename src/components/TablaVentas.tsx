import Link from "next/link";
import BotonAnularFila from "@/components/BotonAnularFila";
import Pastilla, { Tilde } from "@/components/Pastilla";
import Tabla, { Nada, type Columna } from "@/components/Tabla";
import { MEDIOS, ETIQUETA_MEDIO, type MedioPago } from "@/lib/negocio";
import { formatearCentavos } from "@/lib/plata";
import type { FilaVenta } from "@/lib/ventas";

const HORA = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
});

const DIA_Y_HORA = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

/** Una venta anulada se sigue viendo, pero apagada y tachada: ya no suma. */
function Apagable({ fila, children }: { fila: FilaVenta; children: React.ReactNode }) {
  return fila.anulada ? (
    <span className="text-tinta-suave line-through">{children}</span>
  ) : (
    <>{children}</>
  );
}

/** Lo que cuenta para los totales: ni anuladas ni esperando el QR. */
const cuenta = (f: FilaVenta) => !f.anulada && !f.pendiente;

function sumar(filas: FilaVenta[], valor: (f: FilaVenta) => number): number {
  return filas.filter(cuenta).reduce((t, f) => t + valor(f), 0);
}

/**
 * La planilla de ventas: una fila por venta y una columna por medio de pago,
 * para ver la mezcla de cobro del período de un vistazo.
 *
 * Los totales del pie suman SÓLO lo cobrado. Una venta anulada o esperando el
 * QR sigue en la lista pero no mueve plata, y sumarla haría que el pie dijera
 * un número que no coincide con la caja.
 */
export default function TablaVentas({
  filas,
  conFecha,
}: {
  filas: FilaVenta[];
  /** `true` cuando el período abarca más de un día: la hora sola no alcanza */
  conFecha: boolean;
}) {
  const columnas: Columna<FilaVenta>[] = [
    {
      clave: "cuando",
      titulo: "Hora",
      ancho: "w-24",
      celda: (f) => (
        <span className="cifra whitespace-nowrap">
          <Apagable fila={f}>
            {(conFecha ? DIA_Y_HORA : HORA).format(f.cuando)}
          </Apagable>
        </span>
      ),
      total: (todas) => `${todas.filter(cuenta).length} cobradas`,
    },
    {
      clave: "cliente",
      titulo: "Cliente",
      ancho: "min-w-32",
      celda: (f) =>
        f.cliente ? (
          <Link
            href={`/cliente/${f.cliente.id}`}
            className="underline-offset-4 hover:underline"
          >
            {f.cliente.nombre}
          </Link>
        ) : (
          <Nada />
        ),
    },
    {
      clave: "detalle",
      titulo: "Detalle",
      ancho: "min-w-48",
      celda: (f) =>
        f.detalle ? (
          <span className="block max-w-72 truncate" title={f.detalle}>
            <Apagable fila={f}>{f.detalle}</Apagable>
          </span>
        ) : (
          <Nada />
        ),
    },
    {
      clave: "total",
      titulo: "Total",
      numerica: true,
      celda: (f) => (
        <Apagable fila={f}>{formatearCentavos(f.totalCentavos)}</Apagable>
      ),
      total: (todas) => formatearCentavos(sumar(todas, (f) => f.totalCentavos)),
    },
    {
      clave: "descuento",
      titulo: "Desc.",
      numerica: true,
      celda: (f) =>
        f.descuentoCentavos > 0 ? (
          <span className="text-deuda">
            −{formatearCentavos(f.descuentoCentavos)}
          </span>
        ) : (
          <Nada />
        ),
      total: (todas) => {
        const suma = sumar(todas, (f) => f.descuentoCentavos);
        return suma > 0 ? `−${formatearCentavos(suma)}` : <Nada />;
      },
    },
    ...MEDIOS.map(
      (medio: MedioPago): Columna<FilaVenta> => ({
        clave: `medio-${medio}`,
        titulo: ETIQUETA_MEDIO[medio],
        numerica: true,
        celda: (f) => {
          const importe = f.porMedio[medio];
          return importe ? (
            <Apagable fila={f}>{formatearCentavos(importe)}</Apagable>
          ) : (
            <Nada />
          );
        },
        total: (todas) => {
          const suma = sumar(todas, (f) => f.porMedio[medio] ?? 0);
          return suma > 0 ? formatearCentavos(suma) : <Nada />;
        },
      }),
    ),
    {
      clave: "estado",
      titulo: "Estado",
      ancho: "w-28",
      celda: (f) =>
        f.anulada ? (
          <Pastilla tono="apagado">Anulada</Pastilla>
        ) : f.pendiente ? (
          <Pastilla tono="espera">Esperando QR</Pastilla>
        ) : (
          <Pastilla tono="pago" icono={<Tilde />}>
            Cobrada
          </Pastilla>
        ),
    },
    {
      clave: "accion",
      titulo: "",
      ancho: "w-20",
      celda: (f) => (f.anulada ? <Nada /> : <BotonAnularFila que="venta" id={f.id} />),
    },
  ];

  return (
    <Tabla
      columnas={columnas}
      filas={filas}
      claveDe={(f) => f.id}
      vacio="No hay ventas en este período."
    />
  );
}
