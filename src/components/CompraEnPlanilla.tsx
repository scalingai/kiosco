import type { ReactNode } from "react";
import BotonAnularFila from "@/components/BotonAnularFila";
import BotonPagarCompra from "@/components/BotonPagarCompra";
import Pastilla, { Tilde } from "@/components/Pastilla";
import Planilla from "@/components/Planilla";
import Tabla, { Nada, type Columna } from "@/components/Tabla";
import type { CompraDelHistorial, RenglonDelHistorial } from "@/lib/compras";
import { fechaCorta } from "@/lib/fechas";
import { formatearContenido, MEDIO_CORTO } from "@/lib/negocio";
import { formatearCentavos } from "@/lib/plata";

const COLUMNAS: Columna<RenglonDelHistorial>[] = [
  {
    clave: "producto",
    titulo: "Producto",
    ancho: "min-w-44",
    celda: (r) => (
      <span className="font-medium">{r.descripcion || "sin nombre"}</span>
    ),
    total: (rs) => (
      <span className="text-xs font-normal text-tinta-suave">
        {rs.length === 1 ? "1 renglón" : `${rs.length} renglones`}
      </span>
    ),
  },
  {
    clave: "cantidad",
    titulo: "Cantidad",
    ayuda: "bultos × unidades",
    numerica: true,
    celda: (r) => (
      <span className="text-tinta-suave">
        {r.cantidad} × {formatearContenido(r.unidadesPorBulto, r.unidad)}
      </span>
    ),
  },
  {
    clave: "costo",
    titulo: "Costo",
    ayuda: "de factura",
    numerica: true,
    celda: (r) =>
      r.costoCentavos != null ? (
        <>
          {formatearCentavos(r.costoCentavos)}
          <span className="ml-1 text-[0.65rem] text-tinta-suave">{r.porCada}</span>
        </>
      ) : (
        <Nada />
      ),
  },
  {
    // «Sin importe» NO es cero: es un renglón que todavía no tiene precio.
    clave: "importe",
    titulo: "Importe",
    numerica: true,
    celda: (r) =>
      r.importeCentavos != null ? (
        <span className="font-medium">{formatearCentavos(r.importeCentavos)}</span>
      ) : (
        <Pastilla tono="espera">sin importe</Pastilla>
      ),
    total: (rs) => formatearCentavos(rs.reduce((t, r) => t + (r.importeCentavos ?? 0), 0)),
  },
];

/**
 * Una compra como planilla: lo que dice el papel, renglón por renglón, con el
 * estado de pago y las acciones pegadas.
 *
 * Se usa en la ficha del proveedor y en el día, que muestran la misma compra
 * desde dos lados. Tenerla una vez evita que una de las dos pantallas se
 * quede con una versión vieja de cómo se lee un renglón.
 */
export default function CompraEnPlanilla({
  compra,
  titulo,
  hoy,
}: {
  compra: CompraDelHistorial;
  /** quién o cuándo: lo que identifica a ESTA compra en la pantalla donde está */
  titulo: ReactNode;
  hoy: string;
}) {
  const detallado = compra.renglones.reduce(
    (t, r) => t + (r.importeCentavos ?? 0),
    0,
  );

  return (
    <Planilla
      titulo={
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          {titulo}
          {compra.pagadoEn ? (
            <Pastilla tono="pago" icono={<Tilde />}>
              {compra.pagadoEn === compra.fecha
                ? "pagada"
                : `pagada el ${fechaCorta(compra.pagadoEn)}`}
            </Pastilla>
          ) : (
            <Pastilla tono="deuda">sin pagar</Pastilla>
          )}
          {compra.faltanPrecios && <Pastilla tono="espera">faltan precios</Pastilla>}
        </span>
      }
      derecha={
        <span className="cifra text-sm font-medium text-tinta">
          {formatearCentavos(compra.montoCentavos)}
        </span>
      }
    >
      {compra.renglones.length === 0 ? (
        <p className="py-3 text-xs text-tinta-suave">
          Se cargó sólo el total, sin detalle de qué vino.
        </p>
      ) : (
        <Tabla
          columnas={COLUMNAS}
          filas={compra.renglones}
          claveDe={(r) => r.id}
        />
      )}

      {/* El total de la factura y la suma de los renglones pueden no coincidir:
          si el total se declaró aparte, la diferencia no es un error. */}
      {compra.renglones.length > 0 &&
        compra.totalDeclarado &&
        detallado !== compra.montoCentavos && (
          <p className="pb-1 text-xs text-tinta-suave">
            El total de la factura es{" "}
            <span className="cifra text-tinta">
              {formatearCentavos(compra.montoCentavos)}
            </span>
            ; los renglones detallados suman{" "}
            <span className="cifra text-tinta">{formatearCentavos(detallado)}</span>.
          </p>
        )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-linea py-2 text-xs text-tinta-suave">
        <span>
          {compra.medio ? MEDIO_CORTO[compra.medio] : "a cuenta"}
          {compra.enBlanco ? " · en blanco" : " · en negro"}
          {compra.comprobante && ` · N.º ${compra.comprobante}`}
          {compra.nota && ` · ${compra.nota}`}
        </span>
        <span className="ml-auto flex items-center gap-3">
          <BotonPagarCompra id={compra.id} pagadoEn={compra.pagadoEn} hoy={hoy} />
          <BotonAnularFila que="compra" id={compra.id} />
        </span>
      </div>
    </Planilla>
  );
}
