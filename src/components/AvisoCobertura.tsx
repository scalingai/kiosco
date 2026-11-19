import { formatearCentavos } from "@/lib/plata";

/**
 * Cuánto de las ventas tiene costo, dicho con palabras.
 *
 * Vive acá y no en cada pantalla porque el mismo texto tiene que salir igual en
 * el Balance y en el Reparto: si una dice "62%" y la otra "60%", el número de
 * la ganancia deja de creerse.
 *
 * El porcentaje se redondea para ABAJO. Una cobertura de 99,6% mostrada como
 * "100%" borra justo el aviso que esta pieza existe para dar.
 */
export function textoCobertura(
  porcentaje: number | null,
  completa: boolean,
): string {
  if (porcentaje === null) return "todavía no hay ventas";
  if (completa) return "sobre todas las ventas";
  if (porcentaje === 0) return "ninguna venta tiene costo cargado";
  if (porcentaje < 1) return "sobre menos del 1% de las ventas";
  return `sobre el ${Math.min(99, Math.floor(porcentaje))}% de las ventas`;
}

/**
 * El cartel que acompaña a una ganancia calculada sobre parte de las ventas.
 *
 * No se dibuja cuando la cobertura es completa o no hubo ventas: ahí no hay
 * nada que aclarar y un cartel de más enseña a no leerlo.
 */
export default function AvisoCobertura({
  porcentaje,
  completa,
  ventasCentavos,
  ventasConCostoCentavos,
}: {
  porcentaje: number | null;
  completa: boolean;
  ventasCentavos: number;
  ventasConCostoCentavos: number;
}) {
  if (porcentaje === null || completa) return null;

  const sinCosto = Math.max(0, ventasCentavos - ventasConCostoCentavos);

  return (
    <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-relaxed text-amber-900">
      <span className="font-medium">
        La ganancia está calculada {textoCobertura(porcentaje, completa)}.
      </span>{" "}
      Hay <span className="cifra">{formatearCentavos(sinCosto)}</span> de ventas
      cargadas como total suelto o de productos sin costo, y de eso no se sabe
      cuánto se ganó: no se cuenta ni como ganancia ni como pérdida. Los gastos
      sí están completos, así que la ganancia real es probablemente mayor a la
      que se ve.
    </p>
  );
}
