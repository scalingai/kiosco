"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crearSucursal } from "@/app/acciones";

/** Dar de alta un local. Lo único obligatorio es el nombre. */
export default function FormSucursal() {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);
    if (!nombre.trim()) {
      setError("Ponele un nombre.");
      return;
    }
    empezar(async () => {
      const resultado = await crearSucursal(nombre);
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setNombre("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={enviar} className="flex flex-wrap items-end gap-2">
      <label className="min-w-0 flex-1">
        <span className="text-xs text-tinta-suave">Nombre del local</span>
        <input
          value={nombre}
          placeholder="El Osito — Centro"
          onChange={(e) => setNombre(e.target.value)}
          className="mt-1 w-full rounded-lg border border-linea bg-white px-3 py-2 text-sm"
        />
      </label>

      <button
        type="submit"
        disabled={pendiente}
        className="rounded-full bg-acento px-5 py-2.5 text-sm font-medium text-white disabled:opacity-45"
      >
        {pendiente ? "Agregando…" : "Agregar"}
      </button>

      {error && (
        <p className="w-full rounded-lg bg-deuda-tenue px-3 py-2 text-sm text-deuda">
          {error}
        </p>
      )}
    </form>
  );
}
