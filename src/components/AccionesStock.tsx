"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { agregarProducto, archivar, marcarQueFalta } from "@/app/acciones";

/**
 * El botón de "falta" es lo único que se carga a mano en esta pantalla: el
 * resto (nombre, proveedor, último costo) lo escriben las compras.
 */
export function BotonFalta({ id, falta }: { id: string; falta: boolean }) {
  const router = useRouter();
  const [pendiente, empezar] = useTransition();

  return (
    <button
      type="button"
      disabled={pendiente}
      onClick={() =>
        empezar(async () => {
          await marcarQueFalta(id, !falta);
          router.refresh();
        })
      }
      className={
        "shrink-0 rounded-full px-3 py-1 text-xs font-medium disabled:opacity-45 " +
        (falta
          ? "bg-deuda text-white"
          : "border border-linea text-tinta-suave")
      }
    >
      {falta ? "Falta" : "Marcar falta"}
    </button>
  );
}

export function BotonArchivar({ id }: { id: string }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [pendiente, empezar] = useTransition();

  if (!confirmando) {
    return (
      <button
        type="button"
        onClick={() => setConfirmando(true)}
        className="text-xs text-tinta-suave underline underline-offset-4"
      >
        Archivar
      </button>
    );
  }

  return (
    <span className="flex items-center gap-2 text-xs">
      <span>¿Seguro?</span>
      <button
        type="button"
        disabled={pendiente}
        onClick={() =>
          empezar(async () => {
            await archivar(id);
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
        onClick={() => setConfirmando(false)}
        className="rounded-full border border-linea px-2.5 py-1"
      >
        No
      </button>
    </span>
  );
}

/**
 * Agregar algo que todavía no se compró nunca. La mayoría de los productos
 * entran solos por las compras; esto es para anotar un faltante antes de que
 * exista una factura que lo mencione.
 */
export function FormProducto() {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);
    if (!nombre.trim()) {
      setError("Poné un nombre.");
      return;
    }
    empezar(async () => {
      const resultado = await agregarProducto(nombre);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setNombre("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={enviar} className="flex flex-wrap items-start gap-2">
      <span className="min-w-0 flex-1">
        <input
          value={nombre}
          placeholder="Agregar un producto a mano"
          onChange={(e) => setNombre(e.target.value)}
          className="w-full rounded-lg border border-linea bg-white px-3 py-2 text-sm"
        />
        {error && <span className="mt-1 block text-xs text-deuda">{error}</span>}
      </span>
      <button
        type="submit"
        disabled={pendiente}
        className="rounded-full bg-acento px-4 py-2 text-sm font-medium text-white disabled:opacity-45"
      >
        Agregar
      </button>
    </form>
  );
}
