import type { ReactNode } from "react";

export type Columna<T> = {
  /** identifica la columna; no se muestra */
  clave: string;
  titulo: string;
  /** aclaración chica debajo del título, para no tener que explicarlo aparte */
  ayuda?: string;
  /** Los números van a la derecha: así se comparan de un vistazo en columna. */
  numerica?: boolean;
  /** ancho mínimo en clases de Tailwind, ej "min-w-40" */
  ancho?: string;
  celda: (fila: T) => ReactNode;
  /** el pie de la columna, cuando hay algo que totalizar */
  total?: (filas: T[]) => ReactNode;
};

/**
 * La tabla de la app.
 *
 * Es una sola para todo —stock, compras, lo que venga— porque una planilla se
 * lee por costumbre: si cada pantalla alinea distinto, el ojo tiene que volver
 * a aprender dónde mirar en cada una.
 *
 * Dos decisiones que la hacen usable en el mostrador:
 *
 * - **Scrollea al costado en vez de achicarse.** Doce columnas no entran en un
 *   celular, y apretarlas hasta que entren las vuelve ilegibles. Se scrollea,
 *   como una planilla de verdad.
 * - **La primera columna queda fija.** Sin eso, al correrse a la derecha se
 *   pierde de qué fila es cada número, que es exactamente cuando el dato deja
 *   de servir.
 */
export default function Tabla<T>({
  columnas,
  filas,
  claveDe,
  vacio,
  alClickearFila,
}: {
  columnas: Columna<T>[];
  filas: T[];
  claveDe: (fila: T) => string;
  /** qué decir cuando no hay nada, en vez de una tabla vacía */
  vacio?: ReactNode;
  alClickearFila?: (fila: T) => void;
}) {
  if (filas.length === 0) {
    return (
      <p className="px-1 py-3 text-sm text-tinta-suave">
        {vacio ?? "No hay nada para mostrar."}
      </p>
    );
  }

  const hayTotales = columnas.some((c) => c.total);

  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <table className="w-full min-w-max border-collapse text-sm">
        <thead>
          <tr className="border-b border-linea">
            {columnas.map((columna, i) => (
              <th
                key={columna.clave}
                scope="col"
                className={
                  "px-3 py-2 align-bottom text-xs font-normal text-tinta-suave " +
                  (columna.numerica ? "text-right " : "text-left ") +
                  (columna.ancho ?? "") +
                  // La primera se queda quieta mientras el resto se corre.
                  (i === 0 ? " sticky left-0 z-10 bg-papel" : "")
                }
              >
                {columna.titulo}
                {columna.ayuda && (
                  <span className="mt-0.5 block text-[0.65rem] leading-tight opacity-70">
                    {columna.ayuda}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {filas.map((fila) => (
            <tr
              key={claveDe(fila)}
              onClick={alClickearFila ? () => alClickearFila(fila) : undefined}
              className={
                "border-b border-linea/70 last:border-0 " +
                (alClickearFila ? "cursor-pointer hover:bg-white" : "")
              }
            >
              {columnas.map((columna, i) => (
                <td
                  key={columna.clave}
                  className={
                    "px-3 py-2.5 align-top " +
                    (columna.numerica ? "cifra text-right " : "") +
                    (i === 0 ? "sticky left-0 z-10 bg-papel" : "")
                  }
                >
                  {columna.celda(fila)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>

        {hayTotales && (
          <tfoot>
            <tr className="border-t border-linea">
              {columnas.map((columna, i) => (
                <td
                  key={columna.clave}
                  className={
                    "px-3 py-2 text-sm font-medium " +
                    (columna.numerica ? "cifra text-right " : "") +
                    (i === 0 ? "sticky left-0 z-10 bg-papel" : "")
                  }
                >
                  {columna.total?.(filas)}
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
