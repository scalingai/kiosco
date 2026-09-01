"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { FilaDeudor } from "@/lib/consultas";
import { diasDesde, fechaCorta } from "@/lib/fechas";
import { normalizarNombre } from "@/lib/nombres";
import { formatearCentavos } from "@/lib/plata";

type Orden = "saldo" | "nombre" | "antiguedad";

export default function TablaDeudores({ filas }: { filas: FilaDeudor[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<Orden>("saldo");
  const [verSaldados, setVerSaldados] = useState(false);

  const visibles = useMemo(() => {
    const objetivo = normalizarNombre(busqueda);
    const filtradas = filas.filter((f) => {
      // Un cliente puede estar en cero y aun así tener mercadería sin precio.
      // Ese no se esconde nunca: es justamente el que hay que mirar.
      if (!verSaldados && f.saldoCentavos === 0 && !f.faltanPrecios) return false;
      if (!objetivo) return true;
      return normalizarNombre(f.nombre).includes(objetivo);
    });

    return [...filtradas].sort((a, b) => {
      if (orden === "nombre") return a.nombre.localeCompare(b.nombre, "es");
      if (orden === "antiguedad") {
        // sin movimientos va al final
        if (!a.ultimoMovimiento) return 1;
        if (!b.ultimoMovimiento) return -1;
        return a.ultimoMovimiento.localeCompare(b.ultimoMovimiento);
      }
      return b.saldoCentavos - a.saldoCentavos;
    });
  }, [filas, busqueda, orden, verSaldados]);

  const saldados = filas.filter(
    (f) => f.saldoCentavos === 0 && !f.faltanPrecios,
  ).length;

  return (
    <section>
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar cliente"
          className="min-w-0 flex-1 rounded-full border border-linea bg-white px-4 py-2 text-sm"
        />
        <select
          value={orden}
          onChange={(e) => setOrden(e.target.value as Orden)}
          className="rounded-full border border-linea bg-white px-3 py-2 text-sm"
          aria-label="Ordenar por"
        >
          <option value="saldo">Mayor deuda</option>
          <option value="nombre">Nombre</option>
          <option value="antiguedad">Más viejo</option>
        </select>
      </div>

      {saldados > 0 && (
        <button
          type="button"
          onClick={() => setVerSaldados((v) => !v)}
          className="mt-2 text-xs text-tinta-suave underline underline-offset-4"
        >
          {verSaldados
            ? "Ocultar los que están en cero"
            : "Ver también los " + saldados + " que están en cero"}
        </button>
      )}

      {visibles.length === 0 ? (
        <p className="mt-6 rounded-2xl border border-dashed border-linea px-4 py-10 text-center text-sm text-tinta-suave">
          {filas.length === 0
            ? "Todavía no hay nadie anotado. Grabá un audio o cargá el primero a mano."
            : "Ningún cliente coincide con la búsqueda."}
        </p>
      ) : (
        <ul className="mt-4 divide-y divide-linea overflow-hidden rounded-2xl border border-linea bg-white/60">
          {visibles.map((f) => {
            const dias = f.ultimoMovimiento ? diasDesde(f.ultimoMovimiento) : null;
            return (
              <li key={f.id}>
                <Link
                  href={`/cliente/${f.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3.5 transition-colors hover:bg-papel-hondo"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{f.nombre}</span>
                    {f.faltanPrecios && (
                      <span className="mt-0.5 inline-block rounded-full bg-deuda-tenue px-2 py-0.5 text-[0.65rem] font-medium uppercase tracking-wider text-deuda">
                        faltan precios
                      </span>
                    )}
                    <span className="block text-xs text-tinta-suave">
                      {f.ultimoMovimiento
                        ? "Último: " +
                          fechaCorta(f.ultimoMovimiento) +
                          (dias !== null && dias > 30 ? " · hace " + dias + " días" : "")
                        : "Sin movimientos"}
                    </span>
                  </span>
                  <span
                    className={
                      "cifra shrink-0 text-right text-base font-medium " +
                      (f.saldoCentavos > 0
                        ? "text-deuda"
                        : f.saldoCentavos < 0
                          ? "text-pago"
                          : "text-tinta-suave")
                    }
                  >
                    {formatearCentavos(f.saldoCentavos)}
                    {f.saldoCentavos < 0 && (
                      <span className="block text-[0.65rem] font-normal uppercase tracking-wider">
                        a favor
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
