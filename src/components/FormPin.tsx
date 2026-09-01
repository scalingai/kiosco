"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ingresar } from "@/app/entrar/acciones";

export default function FormPin({ destino }: { destino: string }) {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [entrando, setEntrando] = useState(false);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);
    setEntrando(true);
    const resultado = await ingresar(pin);
    if (!resultado.ok) {
      setError(resultado.error);
      setPin("");
      setEntrando(false);
      return;
    }
    router.replace(destino);
    router.refresh();
  }

  return (
    <form onSubmit={enviar} className="mt-6 w-full max-w-[15rem]">
      <input
        value={pin}
        onChange={(e) => setPin(e.target.value)}
        type="password"
        inputMode="numeric"
        autoComplete="current-password"
        autoFocus
        aria-label="PIN"
        className="cifra w-full rounded-xl border border-linea bg-white px-4 py-3 text-center text-2xl tracking-[0.4em]"
      />

      {error && (
        <p role="alert" className="mt-3 text-center text-sm text-deuda">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={entrando}
        className="mt-4 w-full rounded-full bg-acento px-5 py-3 text-sm font-medium text-white disabled:opacity-45"
      >
        {entrando ? "Entrando…" : "Entrar"}
      </button>
    </form>
  );
}
