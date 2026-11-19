"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import Pastilla from "@/components/Pastilla";
import Tabla, { Nada, type Columna } from "@/components/Tabla";
import type { FilaDeudor } from "@/lib/consultas";
import { diasDesde, fechaCorta } from "@/lib/fechas";
import { normalizarNombre } from "@/lib/nombres";
import { formatearCentavos } from "@/lib/plata";

type Orden = "saldo" | "nombre" | "antiguedad";

/**
 * La planilla de lo que se debe, con buscador y orden.
 *
 * El buscador es lo que hace usable la pantalla con cien deudores: el que
 * llega a pagar es uno solo y hay que ubicarlo ya. Y el orden contesta dos
 * preguntas distintas: "quién debe más" y "quién debe hace más tiempo", que es
 * la que decide a quién reclamarle.
 *
 * El saldo no se guarda: viene calculado de los movimientos, y el pie suma sólo
 * las deudas (los saldos a favor no compensan lo que otro debe).
 */
export default function TablaFiado({ filas }: { filas: FilaDeudor[] }) {
  const [busqueda, setBusqueda] = useState("");
  const [orden, setOrden] = useState<Orden>("saldo");

  // Se busca con `normalizarNombre`, la misma función que usa la base: "perez"
  // encuentra a "Pérez" y las mayúsculas no importan.
  const visibles = useMemo(() => {
    const objetivo = normalizarNombre(busqueda);
    const filtradas = objetivo
      ? filas.filter((f) => normalizarNombre(f.nombre).includes(objetivo))
      : filas;

    return [...filtradas].sort((a, b) => {
      if (orden === "nombre") return a.nombre.localeCompare(b.nombre, "es");
      if (orden === "antiguedad") {
        // El más viejo primero; sin movimientos va al final.
        if (!a.ultimoMovimiento) return 1;
        if (!b.ultimoMovimiento) return -1;
        return a.ultimoMovimiento.localeCompare(b.ultimoMovimiento);
      }
      return b.saldoCentavos - a.saldoCentavos;
    });
  }, [filas, busqueda, orden]);

  const columnas: Columna<FilaDeudor>[] = [
    {
      clave: "cliente",
      titulo: "Cliente",
      ancho: "min-w-40",
      celda: (f) => (
        <span className="flex items-center gap-2">
          <Link
            href={`/cliente/${f.id}`}
            className="font-medium underline-offset-4 hover:underline"
          >
            {f.nombre}
          </Link>
          {f.faltanPrecios && <Pastilla tono="deuda">Faltan precios</Pastilla>}
        </span>
      ),
      total: (todas) => `${todas.length} clientes`,
    },
    {
      clave: "ultimo",
      titulo: "Último movimiento",
      numerica: true,
      celda: (f) =>
        f.ultimoMovimiento ? fechaCorta(f.ultimoMovimiento) : <Nada />,
    },
    {
      clave: "dias",
      titulo: "Hace",
      numerica: true,
      celda: (f) => {
        if (!f.ultimoMovimiento) return <Nada />;
        const dias = diasDesde(f.ultimoMovimiento);
        // Pasados los 30 días se pinta: es la deuda que ya se está enfriando.
        return (
          <span className={dias > 30 ? "text-deuda" : "text-tinta-suave"}>
            {dias} {dias === 1 ? "día" : "días"}
          </span>
        );
      },
    },
    {
      clave: "saldo",
      titulo: "Debe",
      numerica: true,
      celda: (f) =>
        f.saldoCentavos === 0 ? (
          <Nada />
        ) : f.saldoCentavos > 0 ? (
          <span className="font-medium text-deuda">
            {formatearCentavos(f.saldoCentavos)}
          </span>
        ) : (
          <span className="text-pago">
            {formatearCentavos(-f.saldoCentavos)} a favor
          </span>
        ),
      total: (todas) =>
        formatearCentavos(
          todas.reduce((t, f) => t + Math.max(f.saldoCentavos, 0), 0),
        ),
    },
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 border-b border-linea py-2">
        <input
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          placeholder="Buscar cliente"
          aria-label="Buscar cliente"
          className="min-w-0 flex-1 rounded-lg border border-linea bg-white px-3 py-1.5 text-sm"
        />
        <select
          value={orden}
          onChange={(e) => setOrden(e.target.value as Orden)}
          aria-label="Ordenar por"
          className="rounded-lg border border-linea bg-white px-3 py-1.5 text-sm"
        >
          <option value="saldo">Mayor deuda</option>
          <option value="antiguedad">Debe hace más tiempo</option>
          <option value="nombre">Nombre</option>
        </select>
      </div>
      <Tabla
        columnas={columnas}
        filas={visibles}
        claveDe={(f) => f.id}
        vacio={
          filas.length === 0
            ? "Nadie debe nada."
            : "Ningún cliente coincide con la búsqueda."
        }
      />
    </>
  );
}
