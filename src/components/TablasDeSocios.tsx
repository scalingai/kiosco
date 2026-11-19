import MontoConSigno from "@/components/MontoConSigno";
import Pastilla from "@/components/Pastilla";
import Tabla, { Nada, type Columna } from "@/components/Tabla";
import { fechaCorta } from "@/lib/fechas";
import type { FilaAporte } from "@/lib/inversion";
import type { FilaRetiro, PartidaDeSocio } from "@/lib/finanzas";
import { MEDIO_CORTO } from "@/lib/negocio";
import { formatearCentavos } from "@/lib/plata";

/**
 * Las planillas de plata que va y viene entre los socios y el negocio:
 * aportes (entra), retiros (sale) y la cuenta de cada socio.
 *
 * Están juntas porque son la misma planilla con otro sentido: una fila por
 * movimiento, una persona, un monto. Lo que cambia es el signo.
 */

/* ── Aportes de la inversión inicial ──────────────────────────────────────── */

export function TablaAportes({
  filas,
  totalCentavos,
}: {
  filas: FilaAporte[];
  totalCentavos: number;
}) {
  const columnas: Columna<FilaAporte>[] = [
    {
      clave: "fecha",
      titulo: "Fecha",
      celda: (f) => (
        <span className="cifra whitespace-nowrap">{fechaCorta(f.fecha)}</span>
      ),
      total: () => "Total puesto",
    },
    {
      clave: "socio",
      titulo: "Socio",
      celda: (f) =>
        f.socio ? (
          <span className="whitespace-nowrap">{f.socio}</span>
        ) : (
          // Sin dueño suma al total pero no se le acredita a nadie.
          <Pastilla tono="espera">Sin asignar</Pastilla>
        ),
    },
    {
      clave: "concepto",
      titulo: "Concepto",
      ancho: "min-w-48",
      celda: (f) => (
        <span className="block max-w-xs truncate sm:max-w-md" title={f.concepto}>
          {f.concepto}
        </span>
      ),
    },
    {
      clave: "medio",
      titulo: "Medio",
      celda: (f) => (
        <span className="whitespace-nowrap text-tinta-suave">
          {MEDIO_CORTO[f.medio]}
        </span>
      ),
    },
    {
      clave: "monto",
      titulo: "Monto",
      numerica: true,
      celda: (f) => (
        <span className="text-pago">{formatearCentavos(f.montoCentavos)}</span>
      ),
      total: () => (
        <span className="text-pago">{formatearCentavos(totalCentavos)}</span>
      ),
    },
  ];

  return (
    <Tabla
      columnas={columnas}
      filas={filas}
      claveDe={(f) => f.id}
      vacio="Todavía no se cargó ningún aporte."
    />
  );
}

/* ── Retiros ──────────────────────────────────────────────────────────────── */

export function TablaRetiros({
  filas,
  totalCentavos,
}: {
  filas: FilaRetiro[];
  totalCentavos: number;
}) {
  const columnas: Columna<FilaRetiro>[] = [
    {
      clave: "fecha",
      titulo: "Fecha",
      celda: (f) => (
        <span className="cifra whitespace-nowrap">{fechaCorta(f.fecha)}</span>
      ),
      total: () => "Total retirado",
    },
    {
      clave: "socio",
      titulo: "Socio",
      celda: (f) =>
        f.socio ? (
          <span className="whitespace-nowrap">{f.socio}</span>
        ) : (
          <Pastilla tono="espera">Sin asignar</Pastilla>
        ),
    },
    {
      clave: "concepto",
      titulo: "Concepto",
      ancho: "min-w-48",
      celda: (f) =>
        f.descripcion?.trim() ? (
          <span
            className="block max-w-xs truncate sm:max-w-md"
            title={f.descripcion}
          >
            {f.descripcion}
          </span>
        ) : (
          <Nada />
        ),
    },
    {
      clave: "medio",
      titulo: "Medio",
      celda: (f) => (
        <span className="whitespace-nowrap text-tinta-suave">
          {MEDIO_CORTO[f.medio]}
        </span>
      ),
    },
    {
      clave: "monto",
      titulo: "Monto",
      numerica: true,
      celda: (f) => <MontoConSigno centavos={-f.montoCentavos} />,
      total: () => <MontoConSigno centavos={-totalCentavos} />,
    },
  ];

  return (
    <Tabla
      columnas={columnas}
      filas={filas}
      claveDe={(f) => f.id}
      vacio="Todavía nadie retiró ganancia."
    />
  );
}

/* ── La cuenta de cada socio ──────────────────────────────────────────────── */

/**
 * Cuánto se llevó cada uno contra cuánto le tocaba.
 *
 * "Le toca" es la parte igual de TODO lo retirado, no de la ganancia: la
 * ganancia se queda en el negocio hasta que alguien la saca, y lo que se
 * divide en dos es el retiro. Si uno sacó más que el otro, la diferencia dice
 * cuánto, y el que sacó de menos puede retirar esa parte sin que el reparto se
 * rompa.
 */
export function TablaPartidas({
  filas,
  retiradoCentavos,
  sinSocioCentavos,
}: {
  filas: PartidaDeSocio[];
  retiradoCentavos: number;
  sinSocioCentavos: number;
}) {
  const columnas: Columna<PartidaDeSocio>[] = [
    {
      clave: "socio",
      titulo: "Socio",
      celda: (f) => <span className="font-medium">{f.nombre}</span>,
      total: () => "Entre todos",
    },
    {
      clave: "retiro",
      titulo: "Se llevó",
      numerica: true,
      celda: (f) => formatearCentavos(f.retiroCentavos),
      total: () => formatearCentavos(retiradoCentavos - sinSocioCentavos),
    },
    {
      clave: "toca",
      titulo: "Le toca",
      ayuda: "partes iguales de lo retirado",
      numerica: true,
      celda: (f) => formatearCentavos(f.leTocaCentavos),
      total: () => formatearCentavos(retiradoCentavos),
    },
    {
      clave: "diferencia",
      titulo: "Diferencia",
      ayuda: "se llevó − le toca",
      numerica: true,
      celda: (f) =>
        f.diferenciaCentavos === 0 ? (
          <Nada />
        ) : (
          // Llevarse de más es deuda con el otro socio: rojo. Llevarse de
          // menos es plata a favor: verde.
          <span
            className={f.diferenciaCentavos > 0 ? "text-deuda" : "text-pago"}
          >
            {f.diferenciaCentavos > 0 ? "+" : "−"}
            {formatearCentavos(Math.abs(f.diferenciaCentavos))}
          </span>
        ),
    },
    {
      clave: "estado",
      titulo: "",
      celda: (f) =>
        f.diferenciaCentavos > 0 ? (
          <Pastilla tono="deuda">Retiró de más</Pastilla>
        ) : f.diferenciaCentavos < 0 ? (
          <Pastilla tono="espera">Retiró de menos</Pastilla>
        ) : (
          <Pastilla tono="pago">Parejo</Pastilla>
        ),
    },
  ];

  return (
    <Tabla
      columnas={columnas}
      filas={filas}
      claveDe={(f) => f.id}
      vacio="Todavía no hay socios cargados."
    />
  );
}
