/**
 * La barra de avance de la inversión.
 *
 * El número solo no dice de un vistazo cuánto falta; la barra sí. Es la única
 * cosa de Inversión que se mira sin leer.
 */
export default function BarraAvance({
  porcentaje,
  alto = "h-2",
}: {
  /** de 0 a 100 */
  porcentaje: number;
  alto?: string;
}) {
  return (
    <div
      className={`${alto} overflow-hidden rounded-full bg-papel-hondo`}
      role="img"
      aria-label={`${Math.round(porcentaje)}% puesto`}
    >
      <div
        className="h-full rounded-full bg-acento transition-[width]"
        // Un 0,5% se dibujaría como una raya invisible: se le da un mínimo
        // para que quien puso algo se vea distinto de quien no puso nada.
        style={{ width: `${Math.max(porcentaje, porcentaje > 0 ? 2 : 0)}%` }}
      />
    </div>
  );
}
