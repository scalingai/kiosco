import Link from "next/link";
import { notFound } from "next/navigation";
import AccionesFlotantes from "@/components/AccionesFlotantes";
import BotonAnular from "@/components/BotonAnular";
import {
  listarCandidatos,
  obtenerCliente,
  type MovimientoConItems,
} from "@/lib/consultas";
import { fechaLarga } from "@/lib/fechas";
import { formatearCentavos } from "@/lib/plata";

export const dynamic = "force-dynamic";

/**
 * Mercadería que salió sin precio y sin un total dicho: está anotada pero no
 * suma a la deuda, así que hay que verlo.
 */
function faltanPrecios(m: MovimientoConItems): boolean {
  if (m.totalDeclarado) return false;
  return m.items.some((item) => item.precioUnitarioCentavos == null);
}

export default async function Ficha({ params }: PageProps<"/cliente/[id]">) {
  const { id } = await params;
  const ficha = await obtenerCliente(id);
  if (!ficha) notFound();

  const { cliente, movimientos, saldoCentavos } = ficha;
  const candidatos = await listarCandidatos();

  return (
    <div className="space-y-6">
      <Link
        href="/"
        className="inline-block text-sm text-tinta-suave underline underline-offset-4"
      >
        ← Todos los clientes
      </Link>

      <section className="rounded-2xl border border-linea bg-papel-hondo px-5 py-6">
        <h1 className="font-display text-3xl leading-none">{cliente.nombre}</h1>
        <p className="mt-3 text-xs uppercase tracking-[0.18em] text-tinta-suave">
          {saldoCentavos > 0 ? "Debe" : saldoCentavos < 0 ? "A favor" : "Saldo"}
        </p>
        <p
          className={
            "cifra mt-1 text-4xl font-medium " +
            (saldoCentavos > 0
              ? "text-deuda"
              : saldoCentavos < 0
                ? "text-pago"
                : "text-tinta-suave")
          }
        >
          {formatearCentavos(Math.abs(saldoCentavos))}
        </p>
      </section>

      <section>
        <h2 className="font-display text-xl leading-none">Movimientos</h2>
        {movimientos.length === 0 ? (
          <p className="mt-3 rounded-2xl border border-dashed border-linea px-4 py-8 text-center text-sm text-tinta-suave">
            Todavía no hay movimientos.
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-linea overflow-hidden rounded-2xl border border-linea bg-white/60">
            {movimientos.map((m) => (
              <li
                key={m.id}
                className={
                  "flex items-start justify-between gap-4 px-4 py-3.5 " +
                  (m.anuladoEn ? "opacity-45" : "")
                }
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    {m.tipo === "fiado" ? "Fiado" : "Pago"}
                    {m.anuladoEn && (
                      <span className="ml-2 text-xs font-normal uppercase tracking-wider text-tinta-suave">
                        anulado
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-tinta-suave">
                    {fechaLarga(m.fecha)}
                    {m.nota ? " · " + m.nota : ""}
                    {m.origen === "audio" ? " · por audio" : ""}
                  </p>

                  {m.items.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5">
                      {m.items.map((item) => (
                        <li key={item.id} className="flex gap-2 text-xs">
                          <span className="cifra text-tinta-suave">
                            {item.cantidad}×
                          </span>
                          <span>{item.descripcion}</span>
                          {item.precioUnitarioCentavos != null ? (
                            <span className="cifra text-tinta-suave">
                              {formatearCentavos(
                                item.precioUnitarioCentavos * item.cantidad,
                              )}
                            </span>
                          ) : m.totalDeclarado ? (
                            // El precio de la línea no se dijo, pero el total sí:
                            // está cobrado igual, no hay nada que avisar.
                            <span className="text-tinta-suave">va en el total</span>
                          ) : (
                            <span className="text-deuda">sin precio</span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}

                  {faltanPrecios(m) && (
                    <p className="mt-1.5 text-xs text-deuda">
                      Faltan precios: lo anotado no está cobrado del todo.
                    </p>
                  )}

                  {m.transcripcion && (
                    <p className="mt-1.5 text-xs italic text-tinta-suave">
                      {m.transcripcion}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span
                    className={
                      "cifra text-sm font-medium " +
                      (m.tipo === "fiado" ? "text-deuda" : "text-pago")
                    }
                  >
                    {m.tipo === "fiado" ? "+" : "−"}
                    {formatearCentavos(m.montoCentavos)}
                  </span>
                  {!m.anuladoEn && <BotonAnular id={m.id} />}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <AccionesFlotantes
        clientes={candidatos}
        clienteFijo={{ id: cliente.id, nombre: cliente.nombre }}
      />
    </div>
  );
}
