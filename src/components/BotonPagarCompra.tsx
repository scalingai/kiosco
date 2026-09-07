"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { despagarCompra, pagarCompra } from "@/app/acciones";

/**
 * Marcar una compra como pagada mueve plata: la salida cae en el día que se
 * elija acá, que es cuando de verdad salió el billete, no cuando llegó el
 * pedido. Por eso la fecha se puede editar antes de confirmar.
 */
export default function BotonPagarCompra({
  id,
  pagadoEn,
  hoy,
}: {
  id: string;
  pagadoEn: string | null;
  /** el día que se está mirando: es el que se propone por defecto */
  hoy: string;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [fecha, setFecha] = useState(hoy);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  function correr(accion: () => Promise<{ ok: boolean; error?: string }>) {
    empezar(async () => {
      const resultado = await accion();
      if (!resultado.ok) {
        setError(resultado.error ?? "No se pudo");
        return;
      }
      setAbierto(false);
      setError(null);
      router.refresh();
    });
  }

  if (pagadoEn) {
    return (
      <button
        type="button"
        disabled={pendiente}
        onClick={() => correr(() => despagarCompra(id))}
        className="text-xs text-tinta-suave underline underline-offset-4 disabled:opacity-45"
      >
        Marcar impaga
      </button>
    );
  }

  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="rounded-full border border-linea px-2.5 py-1 text-xs font-medium"
      >
        Pagar
      </button>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2 text-xs">
      {error && <span className="text-deuda">{error}</span>}
      <input
        type="date"
        value={fecha}
        onChange={(e) => setFecha(e.target.value)}
        aria-label="Día en que se pagó"
        className="cifra rounded-lg border border-linea bg-white px-2 py-1"
      />
      <button
        type="button"
        disabled={pendiente}
        onClick={() => correr(() => pagarCompra(id, fecha))}
        className="rounded-full bg-acento px-2.5 py-1 font-medium text-white disabled:opacity-45"
      >
        Pagada
      </button>
      <button
        type="button"
        onClick={() => {
          setAbierto(false);
          setError(null);
        }}
        className="rounded-full border border-linea px-2.5 py-1"
      >
        No
      </button>
    </span>
  );
}
