"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { archivarVarios } from "@/app/acciones";

type Seleccion = {
  elegidos: Set<string>;
  alMarcar: (clave: string, marcado: boolean) => void;
  alMarcarTodas: (claves: string[], marcado: boolean) => void;
};

const Contexto = createContext<Seleccion | null>(null);

export function useSeleccion(): Seleccion {
  const valor = useContext(Contexto);
  if (!valor) throw new Error("Falta envolver con <SeleccionStock>");
  return valor;
}

/**
 * La selección de productos del catálogo, compartida por todas las tablas.
 *
 * Vive acá arriba y no adentro de cada tabla porque el stock está partido en
 * una tabla por subcategoría: sin un estado común, marcar tres gaseosas y dos
 * galletitas serían dos selecciones distintas y habría que archivar dos veces.
 *
 * Archiva en vez de borrar, igual que el botón de una sola fila: un producto
 * archivado sale de la lista pero sigue explicando las compras viejas que lo
 * mencionan.
 */
export default function SeleccionStock({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  const alMarcar = useCallback((clave: string, marcado: boolean) => {
    setElegidos((previo) => {
      const siguiente = new Set(previo);
      if (marcado) siguiente.add(clave);
      else siguiente.delete(clave);
      return siguiente;
    });
  }, []);

  const alMarcarTodas = useCallback((claves: string[], marcado: boolean) => {
    setElegidos((previo) => {
      const siguiente = new Set(previo);
      for (const clave of claves) {
        if (marcado) siguiente.add(clave);
        else siguiente.delete(clave);
      }
      return siguiente;
    });
  }, []);

  const valor = useMemo(
    () => ({ elegidos, alMarcar, alMarcarTodas }),
    [elegidos, alMarcar, alMarcarTodas],
  );

  const cuantos = elegidos.size;

  return (
    <Contexto.Provider value={valor}>
      {children}

      {cuantos > 0 && (
        // Flota abajo para que no haya que subir hasta un botón después de
        // marcar cincuenta cosas.
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-linea bg-papel px-4 py-3 shadow-lg">
            <span className="text-sm">
              {cuantos === 1
                ? "1 producto marcado"
                : `${cuantos} productos marcados`}
            </span>

            {error && <span className="text-xs text-deuda">{error}</span>}

            <button
              type="button"
              disabled={pendiente}
              onClick={() =>
                empezar(async () => {
                  const resultado = await archivarVarios([...elegidos]);
                  if (!resultado.ok) {
                    setError(resultado.error);
                    return;
                  }
                  setElegidos(new Set());
                  setError(null);
                  router.refresh();
                })
              }
              className="rounded-full bg-deuda px-4 py-2 text-sm font-medium text-white disabled:opacity-45"
            >
              {pendiente ? "Sacando…" : `Sacar ${cuantos} de la lista`}
            </button>

            <button
              type="button"
              onClick={() => {
                setElegidos(new Set());
                setError(null);
              }}
              className="rounded-full border border-linea px-4 py-2 text-sm"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </Contexto.Provider>
  );
}
