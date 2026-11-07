"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { moverPedido } from "@/app/acciones";
import type { EstadoPedido } from "@/lib/pedidos";

/**
 * Mover un pedido de estado.
 *
 * Se muestra sólo el paso SIGUIENTE y no una lista con los cinco: el pedido va
 * para adelante casi siempre, y cinco botones iguales en cada fila convierten
 * la pantalla en un tablero que hay que leer antes de tocar.
 *
 * Cancelar está aparte porque es el único que no va para adelante.
 */
const SIGUIENTE: Partial<Record<EstadoPedido, { a: EstadoPedido; texto: string }>> =
  {
    nuevo: { a: "preparando", texto: "Lo estoy preparando" },
    preparando: { a: "listo", texto: "Está listo" },
    listo: { a: "entregado", texto: "Se lo llevó" },
  };

export default function EstadoDePedido({
  id,
  estado,
}: {
  id: string;
  estado: EstadoPedido;
}) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();

  const siguiente = SIGUIENTE[estado];
  if (!siguiente) return null;

  function mover(a: EstadoPedido) {
    empezar(async () => {
      await moverPedido(id, a);
      router.refresh();
    });
  }

  return (
    <span className="flex items-center gap-2">
      <button
        type="button"
        disabled={pendiente}
        onClick={() => mover(siguiente.a)}
        className="rounded-full bg-acento px-4 py-2 text-sm font-medium text-white disabled:opacity-45"
      >
        {siguiente.texto}
      </button>
      <button
        type="button"
        disabled={pendiente}
        onClick={() => mover("cancelado")}
        className="text-xs text-tinta-suave underline underline-offset-4 disabled:opacity-45"
      >
        Cancelar
      </button>
    </span>
  );
}
