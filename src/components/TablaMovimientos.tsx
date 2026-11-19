import Link from "next/link";
import Pastilla from "@/components/Pastilla";
import Tabla, { Nada, type Columna } from "@/components/Tabla";
import { fechaCorta } from "@/lib/fechas";
import { ETIQUETA_MEDIO } from "@/lib/negocio";
import { formatearCentavos } from "@/lib/plata";
import type { FilaMovimiento } from "@/lib/ventas";

const HORA = new Intl.DateTimeFormat("es-AR", {
  hour: "2-digit",
  minute: "2-digit",
});

const cuenta = (m: FilaMovimiento) => !m.anulado;

function sumar(filas: FilaMovimiento[], tipo: "fiado" | "pago"): number {
  return filas
    .filter((m) => cuenta(m) && m.tipo === tipo)
    .reduce((t, m) => t + m.montoCentavos, 0);
}

/**
 * El historial movimiento por movimiento. El monto está partido en dos
 * columnas, fiado y pago, para que cada una tenga su propio total en el pie:
 * una sola columna con signo obligaría a restar de cabeza.
 */
export default function TablaMovimientos({
  filas,
}: {
  filas: FilaMovimiento[];
}) {
  const columnas: Columna<FilaMovimiento>[] = [
    {
      clave: "cuando",
      titulo: "Fecha",
      ancho: "w-28",
      celda: (m) => (
        <span className="cifra whitespace-nowrap">
          {fechaCorta(m.fecha)} {HORA.format(m.cuando)}
        </span>
      ),
      total: (todas) => `${todas.filter(cuenta).length} movimientos`,
    },
    {
      clave: "cliente",
      titulo: "Cliente",
      ancho: "min-w-40",
      celda: (m) => (
        <Link
          href={`/cliente/${m.clienteId}`}
          className="underline-offset-4 hover:underline"
        >
          {m.cliente}
        </Link>
      ),
    },
    {
      clave: "tipo",
      titulo: "Tipo",
      ancho: "w-24",
      celda: (m) =>
        m.tipo === "fiado" ? (
          <Pastilla tono="deuda">Fiado</Pastilla>
        ) : (
          <Pastilla tono="pago">Pago</Pastilla>
        ),
    },
    {
      clave: "fiado",
      titulo: "Fiado",
      numerica: true,
      celda: (m) =>
        m.tipo === "fiado" ? (
          <span
            className={m.anulado ? "text-tinta-suave line-through" : "text-deuda"}
          >
            {formatearCentavos(m.montoCentavos)}
          </span>
        ) : (
          <Nada />
        ),
      total: (todas) => formatearCentavos(sumar(todas, "fiado")),
    },
    {
      clave: "pago",
      titulo: "Pago",
      numerica: true,
      celda: (m) =>
        m.tipo === "pago" ? (
          <span
            className={m.anulado ? "text-tinta-suave line-through" : "text-pago"}
          >
            {formatearCentavos(m.montoCentavos)}
          </span>
        ) : (
          <Nada />
        ),
      total: (todas) => formatearCentavos(sumar(todas, "pago")),
    },
    {
      clave: "medio",
      titulo: "Medio",
      ancho: "w-28",
      // Un fiado no mueve plata: no tiene medio, y mostrar "Efectivo" sería
      // inventarlo.
      celda: (m) => (m.tipo === "pago" ? ETIQUETA_MEDIO[m.medio] : <Nada />),
    },
    {
      clave: "nota",
      titulo: "Nota",
      ancho: "min-w-48",
      celda: (m) =>
        m.nota ? (
          <span className="block max-w-80 truncate" title={m.nota}>
            {m.nota}
          </span>
        ) : (
          <Nada />
        ),
    },
    {
      clave: "estado",
      titulo: "Estado",
      ancho: "w-24",
      celda: (m) =>
        m.anulado ? <Pastilla tono="apagado">Anulado</Pastilla> : <Nada />,
    },
  ];

  return (
    <Tabla
      columnas={columnas}
      filas={filas}
      claveDe={(m) => m.id}
      vacio="No hay movimientos en este período."
    />
  );
}
