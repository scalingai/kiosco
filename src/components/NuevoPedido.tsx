"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { abrirPedidoDeReposicion } from "@/app/acciones";
import SelectorNombre from "@/components/SelectorNombre";

/**
 * Empezar un pedido: elegir el proveedor y si se le compra en blanco.
 *
 * El "en blanco" se pregunta ACÁ, antes de cargar nada, y no al final. No es
 * un dato administrativo: cambia el costo real de cada renglón un 21%, y por
 * lo tanto el precio sugerido que se mira mientras se arma el pedido. Puesto
 * al final, habría que volver a leer la lista entera.
 */
export default function NuevoPedido({
  proveedores,
}: {
  proveedores: { id: string; nombre: string }[];
}) {
  const router = useRouter();
  const [proveedorId, setProveedorId] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [enBlanco, setEnBlanco] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [yendo, empezar] = useTransition();

  function abrir() {
    if (!proveedorId) {
      setError("Elegí un proveedor de la lista");
      return;
    }
    empezar(async () => {
      const r = await abrirPedidoDeReposicion(proveedorId, enBlanco);
      if (!r.ok) return setError(r.error);
      router.push(`/reponer/${r.datos.id}`);
    });
  }

  return (
    <div className="rounded-xl border border-linea bg-tarjeta p-4">
      <p className="text-sm font-semibold">Armar un pedido</p>

      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
        <SelectorNombre
          queEs="proveedor"
          valor={nombre}
          opciones={proveedores}
          placeholder="¿A quién se lo pedís?"
          etiquetaAria="Proveedor del pedido"
          permitirCrear={false}
          alCambiar={(texto, id) => {
            setNombre(texto);
            setProveedorId(id);
            setError(null);
          }}
        />

        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={enBlanco}
            onChange={(e) => setEnBlanco(e.target.checked)}
            className="h-4 w-4"
          />
          En blanco
          <span className="text-xs font-normal text-tinta-suave">(+21%)</span>
        </label>

        <button
          type="button"
          onClick={abrir}
          disabled={yendo}
          className="rounded-xl bg-acento px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
        >
          {yendo ? "Abriendo…" : "Empezar"}
        </button>
      </div>

      {error && <p className="mt-2 text-sm text-deuda">{error}</p>}
    </div>
  );
}
