import { formatearCentavos } from "@/lib/plata";

/**
 * Un monto con su signo a la vista: lo que entra en verde con `+`, lo que sale
 * en rojo con `−`. En una planilla de plata el signo no se deduce del color
 * —hay quien no distingue verde de rojo—, se escribe.
 *
 * El cero no lleva signo ni color: no entró ni salió nada.
 */
export default function MontoConSigno({
  centavos,
  neutro = false,
}: {
  centavos: number;
  /** sin color: para totales donde pintar de rojo o verde sería opinar */
  neutro?: boolean;
}) {
  if (centavos === 0) return <span>{formatearCentavos(0)}</span>;

  const entra = centavos > 0;
  return (
    <span className={neutro ? "" : entra ? "text-pago" : "text-deuda"}>
      {entra ? "+" : "−"}
      {formatearCentavos(Math.abs(centavos))}
    </span>
  );
}
