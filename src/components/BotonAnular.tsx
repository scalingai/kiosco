"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { anular } from "@/app/acciones";

/**
 * Anular no borra la fila: le pone fecha de baja y deja de sumar. Pide
 * confirmación porque cambia el saldo de una persona.
 */
export default function BotonAnular({ id }: { id: string }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className="text-xs text-tinta-suave underline underline-offset-4"
      >
        Anular
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 text-xs">
      {error ? <span className="text-deuda">{error}</span> : <span>¿Seguro?</span>}
      <button
        type="button"
        disabled={pendiente}
        onClick={() =>
          empezar(async () => {
            const resultado = await anular(id);
            if (!resultado.ok) {
              setError(resultado.error);
              return;
            }
            setConfirmando(false);
            router.refresh();
          })
        }
        className="rounded-full bg-deuda px-2.5 py-1 font-medium text-white disabled:opacity-45"
      >
        Sí
      </button>
      <button
        type="button"
        onClick={() => {
          setConfirmando(false);
          setError(null);
        }}
        className="rounded-full border border-linea px-2.5 py-1"
      >
        No
      </button>
    </span>
  );
}
