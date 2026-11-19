import type { Metadata } from "next";
import BarraPeriodo from "@/components/BarraPeriodo";
import EstadoDePedido from "@/components/EstadoDePedido";
import Pastilla, { type Tono } from "@/components/Pastilla";
import Tabla, { Nada, type Columna } from "@/components/Tabla";
import Tira from "@/components/Tira";
import { hoyLocal } from "@/lib/fechas";
import { cuandoCorto, haceCuanto } from "@/lib/hace";
import {
  listarPedidosDelPeriodo,
  type EstadoPedido,
  type FilaPedido,
} from "@/lib/pedidos";
import {
  leerFecha,
  leerPeriodo,
  resolverRango,
} from "@/lib/periodo";
import { formatearCentavos } from "@/lib/plata";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Pedidos — El Osito" };

/** Cómo se dice cada estado y de qué tono se pinta. */
const ESTADO: Record<EstadoPedido, { texto: string; tono: Tono }> = {
  // Nuevo es el único que pide una persona YA: hay alguien esperando.
  nuevo: { texto: "Nuevo", tono: "deuda" },
  preparando: { texto: "Preparando", tono: "espera" },
  listo: { texto: "Listo", tono: "pago" },
  entregado: { texto: "Entregado", tono: "apagado" },
  cancelado: { texto: "Cancelado", tono: "apagado" },
};

/** Orden de la planilla: lo que espera primero, y adentro, lo más viejo. */
const PRIORIDAD: Record<EstadoPedido, number> = {
  nuevo: 0,
  preparando: 1,
  listo: 2,
  entregado: 3,
  cancelado: 4,
};

function ordenar(a: FilaPedido, b: FilaPedido): number {
  if (PRIORIDAD[a.estado] !== PRIORIDAD[b.estado]) {
    return PRIORIDAD[a.estado] - PRIORIDAD[b.estado];
  }
  // Los abiertos: el que más espera arriba. Los cerrados: el más reciente.
  const diferencia = a.creadoEn.getTime() - b.creadoEn.getTime();
  return PRIORIDAD[a.estado] <= 2 ? diferencia : -diferencia;
}

/** "2× Coca 2,25 · 1× Papas": lo que pidió, en una línea. */
function resumirRenglones(p: FilaPedido): string {
  return p.renglones
    .map((r) => `${r.cantidad}× ${r.descripcion}`)
    .join(" · ");
}

export default async function Pedidos({
  searchParams,
}: PageProps<"/pedidos">) {
  const parametros = await searchParams;
  const rango = resolverRango(
    leerPeriodo(
      typeof parametros.periodo === "string" ? parametros.periodo : undefined,
    ),
    leerFecha(
      typeof parametros.fecha === "string" ? parametros.fecha : undefined,
    ),
  );

  const filas = (await listarPedidosDelPeriodo(rango)).sort(ordenar);

  const hoy = hoyLocal();

  const cuantos = (estado: EstadoPedido) =>
    filas.filter((p) => p.estado === estado).length;
  const nuevos = filas.filter((p) => p.estado === "nuevo");
  const entregados = filas.filter((p) => p.estado === "entregado");
  const entregadoCentavos = entregados.reduce(
    (t, p) => t + p.totalCentavos,
    0,
  );

  // Después de ordenar, el primero de los nuevos es el que más lleva esperando.
  const masViejo = nuevos[0];

  const columnas: Columna<FilaPedido>[] = [
    {
      clave: "numero",
      titulo: "Nº",
      celda: (p) => (
        <span className="flex items-center gap-1.5">
          {p.estado === "nuevo" && (
            <span
              className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-deuda"
              aria-label="Sin atender"
            />
          )}
          <span
            className={
              "cifra " +
              (p.estado === "nuevo" ? "font-semibold text-deuda" : "font-medium")
            }
          >
            #{p.numero}
          </span>
        </span>
      ),
      total: () => "Total",
    },
    {
      clave: "cuando",
      titulo: "Cuándo",
      celda: (p) => (
        <>
          <span className="cifra whitespace-nowrap">
            {cuandoCorto(p.creadoEn, hoy)}
          </span>
          {p.estado === "nuevo" && (
            <span className="block whitespace-nowrap text-[0.65rem] text-deuda">
              {haceCuanto(p.creadoEn)}
            </span>
          )}
        </>
      ),
    },
    {
      clave: "cliente",
      titulo: "Cliente",
      ancho: "min-w-32",
      celda: (p) => (
        <>
          {p.nombre}
          <span className="block text-[0.65rem] text-tinta-suave">
            {p.entrega === "envio"
              ? `Envío${p.direccion ? ` · ${p.direccion}` : ""}`
              : "Lo pasa a buscar"}
          </span>
        </>
      ),
    },
    {
      clave: "telefono",
      titulo: "Teléfono",
      celda: (p) => (
        // Link de teléfono: desde el celular del mostrador se llama sin
        // copiarlo a mano.
        <a
          href={`tel:${p.telefono.replace(/[^\d+]/g, "")}`}
          className="cifra whitespace-nowrap underline underline-offset-2"
        >
          {p.telefono}
        </a>
      ),
    },
    {
      clave: "pidio",
      titulo: "Qué pidió",
      ancho: "min-w-56",
      celda: (p) => (
        <>
          {resumirRenglones(p) || <Nada />}
          {p.nota && (
            <span className="block text-[0.65rem] italic text-tinta-suave">
              “{p.nota}”
            </span>
          )}
        </>
      ),
    },
    {
      clave: "total",
      titulo: "Total",
      ayuda: "sin cancelados",
      numerica: true,
      celda: (p) => (
        <span className={p.estado === "cancelado" ? "text-tinta-suave line-through" : ""}>
          {formatearCentavos(p.totalCentavos)}
        </span>
      ),
      total: (todas) =>
        formatearCentavos(
          todas
            .filter((p) => p.estado !== "cancelado")
            .reduce((t, p) => t + p.totalCentavos, 0),
        ),
    },
    {
      clave: "estado",
      titulo: "Estado",
      celda: (p) => (
        <Pastilla tono={ESTADO[p.estado].tono}>{ESTADO[p.estado].texto}</Pastilla>
      ),
    },
    {
      clave: "accion",
      titulo: "Acción",
      celda: (p) =>
        p.estado === "entregado" || p.estado === "cancelado" ? (
          <Nada />
        ) : (
          <EstadoDePedido id={p.id} estado={p.estado} />
        ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-4">
          <h1 className="font-display text-2xl leading-none">Pedidos</h1>
          <p className="text-sm text-tinta-suave">
            Los de la tienda. Un pedido no es una venta: se cobra cuando lo
            retiran.
          </p>
        </div>
        <BarraPeriodo rango={rango} base="/pedidos" />
      </div>

      {/*
        Un pedido nuevo es lo único de toda la app que es urgente: hay una
        persona esperando. Por eso tiene su propia franja y no queda como un
        número más de la tira.
      */}
      {masViejo && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-xl bg-deuda-tenue px-4 py-2 text-sm font-medium text-deuda"
        >
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-deuda" />
          {nuevos.length === 1
            ? "Hay 1 pedido sin atender"
            : `Hay ${nuevos.length} pedidos sin atender`}
          <span className="font-normal">
            · el más viejo llegó {haceCuanto(masViejo.creadoEn)}
          </span>
        </p>
      )}

      <Tira
        datos={[
          {
            etiqueta: "Nuevos",
            valor: cuantos("nuevo"),
            pie: "sin atender",
            tono: cuantos("nuevo") > 0 ? "deuda" : "suave",
          },
          {
            etiqueta: "Preparando",
            valor: cuantos("preparando"),
            pie: "en el mostrador",
          },
          {
            etiqueta: "Listos",
            valor: cuantos("listo"),
            pie: "esperando que vengan",
            tono: cuantos("listo") > 0 ? "pago" : "suave",
          },
          {
            etiqueta: "Entregados",
            valor: entregados.length,
            pie: rango.titulo.toLowerCase(),
          },
          {
            etiqueta: "Cancelados",
            valor: cuantos("cancelado"),
            tono: "suave",
          },
        ]}
        destacado={{
          etiqueta: "Entregado",
          valor: formatearCentavos(entregadoCentavos),
          pie:
            entregados.length === 0
              ? "ningún pedido entregado"
              : `${entregados.length} ${entregados.length === 1 ? "pedido" : "pedidos"} · ${rango.titulo.toLowerCase()}`,
          tono: "pago",
        }}
      />

      <section className="overflow-hidden rounded-xl border border-linea bg-tarjeta px-4 py-1">
        <Tabla
          columnas={columnas}
          filas={filas}
          claveDe={(p) => p.id}
          vacio="No entró ningún pedido en este período."
        />
        {filas.length > 0 && (
          <p className="border-t border-linea py-2 text-xs text-tinta-suave">
            Lo que sigue abierto se muestra siempre, aunque sea de otro día.
          </p>
        )}
      </section>
    </div>
  );
}
