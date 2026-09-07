"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { guardarGasto } from "@/app/acciones";
import SelectorMedio from "@/components/SelectorMedio";
import { AVISO_TARDANZA, conLimiteDeTiempo } from "@/lib/espera";
import {
  CATEGORIAS_GASTO,
  ETIQUETA_GASTO,
  type CategoriaGasto,
  type MedioPago,
} from "@/lib/negocio";
import { parsearMonto } from "@/lib/plata";

/**
 * Todo lo que sale y no es mercadería. El retiro está entre las categorías a
 * propósito: la plata que sacás no es un gasto del kiosco, pero si no se anota
 * el día no cierra y uno termina buscando un faltante que no existe.
 */
export default function FormGasto({
  fecha,
  alGuardar,
}: {
  fecha: string;
  alGuardar?: () => void;
}) {
  const router = useRouter();
  const [categoria, setCategoria] = useState<CategoriaGasto>("otros");
  const [monto, setMonto] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [medio, setMedio] = useState<MedioPago>("efectivo");
  const [cuando, setCuando] = useState(fecha);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);

    const montoCentavos = parsearMonto(monto);
    if (montoCentavos == null || montoCentavos <= 0) {
      setError("Poné cuánto fue el gasto.");
      return;
    }

    setGuardando(true);
    const espera = await conLimiteDeTiempo(
      guardarGasto({
        categoria,
        montoCentavos,
        descripcion,
        fecha: cuando,
        medio,
      }),
    );
    setGuardando(false);

    if (espera.venció) {
      setError(AVISO_TARDANZA);
      return;
    }
    if (!espera.valor.ok) {
      setError(espera.valor.error);
      return;
    }

    setMonto("");
    setDescripcion("");
    router.refresh();
    alGuardar?.();
  }

  return (
    <form onSubmit={enviar} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs text-tinta-suave">Qué fue</span>
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value as CategoriaGasto)}
            className="mt-1 w-full rounded-lg border border-linea bg-white px-3 py-2 text-sm"
          >
            {CATEGORIAS_GASTO.map((c) => (
              <option key={c} value={c}>
                {ETIQUETA_GASTO[c]}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="text-xs text-tinta-suave">Cuánto</span>
          <input
            value={monto}
            inputMode="decimal"
            autoFocus
            placeholder="0"
            onChange={(e) => setMonto(e.target.value)}
            className="cifra mt-1 w-full rounded-lg border border-linea bg-white px-3 py-2 text-sm"
          />
        </label>
      </div>

      <label className="block">
        <span className="text-xs text-tinta-suave">Detalle</span>
        <input
          value={descripcion}
          placeholder="opcional: factura de luz, arreglo de la heladera…"
          onChange={(e) => setDescripcion(e.target.value)}
          className="mt-1 w-full rounded-lg border border-linea bg-white px-3 py-2 text-sm"
        />
      </label>

      <SelectorMedio valor={medio} onCambio={setMedio} etiqueta="Con qué se pagó" />

      <label className="block">
        <span className="text-xs text-tinta-suave">Día</span>
        <input
          type="date"
          value={cuando}
          onChange={(e) => setCuando(e.target.value)}
          className="cifra mt-1 w-full rounded-lg border border-linea bg-white px-3 py-2 text-sm"
        />
      </label>

      {categoria === "retiro" && (
        <p className="rounded-lg bg-papel-hondo px-3 py-2 text-xs text-tinta-suave">
          El retiro sale de la caja pero no es un costo del kiosco. Se muestra
          aparte para que no ensucie lo que de verdad cuesta tener abierto.
        </p>
      )}

      {error && (
        <p className="rounded-lg bg-deuda-tenue px-3 py-2 text-sm text-deuda">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={guardando}
        className="rounded-full bg-acento px-5 py-2.5 text-sm font-medium text-white disabled:opacity-45"
      >
        {guardando ? "Anotando…" : "Anotar gasto"}
      </button>
    </form>
  );
}
