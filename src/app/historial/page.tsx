import Link from "next/link";
import type { Metadata } from "next";
import { listarHistorial } from "@/lib/consultas";
import { formatearCentavos } from "@/lib/plata";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Historial — El Osito" };

const CUANDO = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function Monto({
  tipo,
  centavos,
  anulado,
}: {
  tipo: "fiado" | "pago";
  centavos: number;
  anulado: boolean;
}) {
  return (
    <span
      className={
        "cifra shrink-0 text-sm font-medium " +
        (anulado
          ? "text-tinta-suave line-through"
          : tipo === "fiado"
            ? "text-deuda"
            : "text-pago")
      }
    >
      {tipo === "fiado" ? "+" : "−"}
      {formatearCentavos(centavos)}
    </span>
  );
}

export default async function Historial() {
  const entradas = await listarHistorial();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl leading-none">Historial</h1>
        <p className="mt-1 text-sm text-tinta-suave">
          Todo lo que se anotó, lo más nuevo arriba. De los audios queda lo que
          se escuchó, aunque después no se haya cargado nada.
        </p>
      </div>

      {entradas.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-linea px-4 py-10 text-center text-sm text-tinta-suave">
          Todavía no hay nada anotado.
        </p>
      ) : (
        <ul className="space-y-3">
          {entradas.map((e) =>
            e.clase === "nota" ? (
              <li
                key={e.id}
                className="rounded-2xl border border-linea bg-white/60 p-4"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-xs uppercase tracking-[0.16em] text-tinta-suave">
                    Audio
                  </span>
                  <span className="cifra text-xs text-tinta-suave">
                    {CUANDO.format(e.cuando)}
                  </span>
                </div>

                <p className="mt-1.5 text-sm italic">{e.transcripcion}</p>

                {e.movimientos.length === 0 ? (
                  <p className="mt-2 text-xs text-deuda">
                    No se cargó nada de este audio.
                  </p>
                ) : (
                  <ul className="mt-3 space-y-1.5 border-t border-linea pt-3">
                    {e.movimientos.map((m) => (
                      <li
                        key={m.id}
                        className="flex items-center justify-between gap-3"
                      >
                        <Link
                          href={`/cliente/${m.clienteId}`}
                          className="min-w-0 truncate text-sm underline-offset-4 hover:underline"
                        >
                          {m.cliente}
                          {m.anulado && (
                            <span className="ml-2 text-xs uppercase tracking-wider text-tinta-suave">
                              anulado
                            </span>
                          )}
                        </Link>
                        <Monto
                          tipo={m.tipo}
                          centavos={m.montoCentavos}
                          anulado={m.anulado}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ) : (
              <li
                key={e.id}
                className="rounded-2xl border border-linea bg-white/40 px-4 py-3"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-xs uppercase tracking-[0.16em] text-tinta-suave">
                    A mano
                  </span>
                  <span className="cifra text-xs text-tinta-suave">
                    {CUANDO.format(e.cuando)}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center justify-between gap-3">
                  <Link
                    href={`/cliente/${e.clienteId}`}
                    className="min-w-0 truncate text-sm underline-offset-4 hover:underline"
                  >
                    {e.cliente}
                    {e.anulado && (
                      <span className="ml-2 text-xs uppercase tracking-wider text-tinta-suave">
                        anulado
                      </span>
                    )}
                  </Link>
                  <Monto
                    tipo={e.tipo}
                    centavos={e.montoCentavos}
                    anulado={e.anulado}
                  />
                </div>
                {e.nota && (
                  <p className="mt-1 text-xs text-tinta-suave">{e.nota}</p>
                )}
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
