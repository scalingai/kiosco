import type { Metadata } from "next";
import EstadoDePedido from "@/components/EstadoDePedido";
import { listarPedidos } from "@/lib/pedidos";
import { formatearCentavos } from "@/lib/plata";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Pedidos — El Osito" };

/** Cómo se dice cada estado y de qué color se pinta. */
const ETIQUETA = {
  nuevo: { texto: "Nuevo", clase: "bg-deuda-tenue text-deuda" },
  preparando: { texto: "Preparando", clase: "bg-papel-hondo text-tinta" },
  listo: { texto: "Listo", clase: "bg-pago-tenue text-pago" },
  entregado: { texto: "Entregado", clase: "bg-papel-hondo text-tinta-suave" },
  cancelado: { texto: "Cancelado", clase: "bg-papel-hondo text-tinta-suave" },
} as const;

function cuando(fecha: Date): string {
  return fecha.toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function Pedidos() {
  const pedidos = await listarPedidos();
  const nuevos = pedidos.filter((p) => p.estado === "nuevo").length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl leading-none">Pedidos</h1>
        <p className="mt-1 text-sm text-tinta-suave">
          Lo que entra por la tienda. Un pedido NO es una venta: se cobra
          cuando el cliente lo retira.
        </p>
      </div>

      {nuevos > 0 && (
        <p className="rounded-xl bg-deuda-tenue px-4 py-2.5 text-sm text-deuda">
          {nuevos === 1
            ? "Hay 1 pedido sin mirar."
            : `Hay ${nuevos} pedidos sin mirar.`}
        </p>
      )}

      {pedidos.length === 0 ? (
        <p className="text-sm text-tinta-suave">
          Todavía no entró ningún pedido.
        </p>
      ) : (
        <ul className="space-y-3">
          {pedidos.map((pedido) => {
            const etiqueta = ETIQUETA[pedido.estado];
            return (
              <li
                key={pedido.id}
                className="rounded-2xl border border-linea bg-tarjeta px-4 py-3.5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="flex items-baseline gap-2">
                    <span className="cifra text-lg font-medium">
                      #{pedido.numero}
                    </span>
                    <span className="text-sm">{pedido.nombre}</span>
                  </span>
                  <span
                    className={
                      "rounded-full px-3 py-1 text-xs " + etiqueta.clase
                    }
                  >
                    {etiqueta.texto}
                  </span>
                </div>

                <p className="mt-1 text-xs text-tinta-suave">
                  {cuando(pedido.creadoEn)} ·{" "}
                  {pedido.entrega === "envio" ? "Envío" : "Lo pasa a buscar"} ·{" "}
                  {/* El teléfono es un link: desde el celular del mostrador se
                      llama sin copiarlo a mano. */}
                  <a
                    href={`tel:${pedido.telefono.replace(/[^\d+]/g, "")}`}
                    className="cifra underline underline-offset-2"
                  >
                    {pedido.telefono}
                  </a>
                </p>

                {pedido.direccion && (
                  <p className="mt-1 text-xs text-tinta-suave">
                    {pedido.direccion}
                  </p>
                )}
                {pedido.nota && (
                  <p className="mt-1 text-xs italic text-tinta-suave">
                    “{pedido.nota}”
                  </p>
                )}

                <ul className="mt-2.5 divide-y divide-linea border-t border-linea">
                  {pedido.renglones.map((r, i) => (
                    <li
                      key={i}
                      className="flex items-center justify-between gap-3 py-1.5 text-sm"
                    >
                      <span className="min-w-0 truncate">
                        <span className="cifra text-tinta-suave">
                          {r.cantidad}×
                        </span>{" "}
                        {r.descripcion}
                      </span>
                      <span className="cifra shrink-0">
                        {formatearCentavos(
                          r.precioUnitarioCentavos * r.cantidad,
                        )}
                      </span>
                    </li>
                  ))}
                </ul>

                <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3 border-t border-linea pt-2.5">
                  <span className="cifra text-lg font-medium text-pago">
                    {formatearCentavos(pedido.totalCentavos)}
                  </span>
                  <EstadoDePedido id={pedido.id} estado={pedido.estado} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
