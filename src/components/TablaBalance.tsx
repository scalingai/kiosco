import BotonAnularFila from "@/components/BotonAnularFila";
import MontoConSigno from "@/components/MontoConSigno";
import Pastilla from "@/components/Pastilla";
import Tabla, { Nada, type Columna } from "@/components/Tabla";
import { fechaCorta } from "@/lib/fechas";
import type { FilaBalance, Totales } from "@/lib/finanzas";
import { MEDIO_CORTO } from "@/lib/negocio";

const TIPO = {
  venta: { etiqueta: "Venta", tono: "pago" },
  compra: { etiqueta: "Compra", tono: "deuda" },
  gasto: { etiqueta: "Gasto", tono: "deuda" },
} as const;

/**
 * La planilla del balance: una fila por movimiento de plata.
 *
 * Los totales del pie vienen de `totales`, NO de sumar `filas`. La planilla
 * puede estar recortada (se dibujan las últimas filas, no las de un año) y un
 * pie que sumara sólo lo dibujado diría un número distinto al de los KPIs de
 * arriba. Que los dos coincidan es lo que hace creíble a la pantalla.
 */
export default function TablaBalance({
  filas,
  totales,
}: {
  filas: FilaBalance[];
  totales: Totales;
}) {
  const neto =
    totales.ventasCentavos - totales.comprasCentavos - totales.gastosCentavos;

  const columnas: Columna<FilaBalance>[] = [
    {
      clave: "fecha",
      titulo: "Fecha",
      celda: (f) => (
        <span className="cifra whitespace-nowrap">{fechaCorta(f.fecha)}</span>
      ),
      total: () => "Total",
    },
    {
      clave: "tipo",
      titulo: "Tipo",
      celda: (f) => (
        <Pastilla tono={TIPO[f.tipo].tono}>{TIPO[f.tipo].etiqueta}</Pastilla>
      ),
    },
    {
      clave: "concepto",
      titulo: "Concepto",
      ancho: "min-w-48",
      celda: (f) => (
        <span className="block max-w-xs truncate sm:max-w-md" title={f.concepto}>
          {f.concepto}
        </span>
      ),
    },
    {
      clave: "categoria",
      titulo: "Categoría",
      celda: (f) => (
        <span
          className={
            "whitespace-nowrap " +
            // El total suelto es la venta que no se puede analizar: se nota.
            (f.categoria === "Total suelto" ? "text-tinta-suave" : "")
          }
        >
          {f.categoria}
        </span>
      ),
    },
    {
      clave: "medio",
      titulo: "Medio",
      celda: (f) =>
        f.medios.length ? (
          <span className="whitespace-nowrap text-tinta-suave">
            {f.medios.map((m) => MEDIO_CORTO[m]).join(" + ")}
          </span>
        ) : (
          <Nada />
        ),
    },
    {
      clave: "ganancia",
      titulo: "Ganancia",
      ayuda: "sólo ventas con costo",
      numerica: true,
      celda: (f) => {
        if (!f.tieneGanancia) return <Nada />;
        // `null` es "no se sabe", y se escribe como tal: un cero sería afirmar
        // que esa venta no dejó nada.
        if (f.gananciaCentavos === null) return <Nada />;
        return (
          <span
            title={
              f.gananciaParcial
                ? "Parcial: sólo la parte de la venta con costo conocido"
                : undefined
            }
          >
            <MontoConSigno centavos={f.gananciaCentavos} />
            {f.gananciaParcial && <sup className="text-tinta-suave">*</sup>}
          </span>
        );
      },
      total: () => (
        <span title="Ganancia de las ventas con costo conocido, antes de gastos">
          <MontoConSigno centavos={totales.margenCentavos} />
        </span>
      ),
    },
    {
      clave: "monto",
      titulo: "Monto",
      numerica: true,
      celda: (f) => <MontoConSigno centavos={f.montoCentavos} />,
      total: () => <MontoConSigno centavos={neto} />,
    },
    {
      clave: "acciones",
      titulo: "",
      celda: (f) => <BotonAnularFila que={f.tipo} id={f.id} />,
    },
  ];

  return (
    <Tabla
      columnas={columnas}
      filas={filas}
      claveDe={(f) => f.clave}
      vacio="No hubo movimientos de plata en este período."
    />
  );
}
