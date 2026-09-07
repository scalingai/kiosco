"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { guardarVenta } from "@/app/acciones";
import SelectorMedio from "@/components/SelectorMedio";
import { AVISO_TARDANZA, conLimiteDeTiempo } from "@/lib/espera";
import type { MedioPago } from "@/lib/negocio";
import { parsearMonto } from "@/lib/plata";

/**
 * La venta del día. Es un renglón por carga, no uno por día: se puede anotar el
 * turno de la mañana y el de la tarde por separado, y corregir anulando en vez
 * de pisar un número que ya estaba.
 */
export default function FormVenta({
  fecha,
  alGuardar,
}: {
  fecha: string;
  alGuardar?: () => void;
}) {
  const router = useRouter();
  const [monto, setMonto] = useState("");
  const [nota, setNota] = useState("");
  const [medio, setMedio] = useState<MedioPago>("efectivo");
  const [cuando, setCuando] = useState(fecha);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);

    const montoCentavos = parsearMonto(monto);
    if (montoCentavos == null || montoCentavos <= 0) {
      setError("Poné cuánto vendiste.");
      return;
    }

    setGuardando(true);
    const espera = await conLimiteDeTiempo(
      guardarVenta({ montoCentavos, nota, fecha: cuando, medio }),
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
    setNota("");
    router.refresh();
    alGuardar?.();
  }

  return (
    <form onSubmit={enviar} className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="text-xs text-tinta-suave">Cuánto se vendió</span>
          <input
            value={monto}
            inputMode="decimal"
            autoFocus
            placeholder="0"
            onChange={(e) => setMonto(e.target.value)}
            className="cifra mt-1 w-full rounded-lg border border-linea bg-white px-3 py-2 text-sm"
          />
        </label>

        <label className="block">
          <span className="text-xs text-tinta-suave">Día</span>
          <input
            type="date"
            value={cuando}
            onChange={(e) => setCuando(e.target.value)}
            className="cifra mt-1 w-full rounded-lg border border-linea bg-white px-3 py-2 text-sm"
          />
        </label>
      </div>

      <SelectorMedio valor={medio} onCambio={setMedio} etiqueta="Cómo entró" />

      <label className="block">
        <span className="text-xs text-tinta-suave">Nota</span>
        <input
          value={nota}
          placeholder="opcional: mañana, tarde, feriado…"
          onChange={(e) => setNota(e.target.value)}
          className="mt-1 w-full rounded-lg border border-linea bg-white px-3 py-2 text-sm"
        />
      </label>

      <p className="text-xs text-tinta-suave">
        Si cobraste por varios medios, cargá uno por cada uno: se suman. El fiado que diste no
        va acá, ya está anotado en la cuenta de cada cliente.
      </p>

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
        {guardando ? "Anotando…" : "Anotar venta"}
      </button>
    </form>
  );
}
