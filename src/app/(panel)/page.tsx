import type { Metadata } from "next";
import BloqueInicio from "@/components/BloqueInicio";
import Pastilla from "@/components/Pastilla";
import Tabla, { Nada, type Columna } from "@/components/Tabla";
import Tira from "@/components/Tira";
import { balanceDelDia, deudaProveedores, type DeudaProveedor } from "@/lib/caja";
import { listarClientes } from "@/lib/consultas";
import { diasDesde, fechaLarga, hoyLocal } from "@/lib/fechas";
import { cuandoCorto, haceCuanto } from "@/lib/hace";
import { MEDIO_CORTO } from "@/lib/negocio";
import { listarPedidos, type FilaPedido } from "@/lib/pedidos";
import { resolverRango } from "@/lib/periodo";
import { formatearCentavos } from "@/lib/plata";
import { listarFaltantes } from "@/lib/stock";
import {
  listarVentas,
  resumenDeVentas,
  type FilaVenta,
} from "@/lib/ventas";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "El Osito" };

/** Cuántas ventas del día se dibujan; el resto queda en /ventas. */
const VENTAS_VISIBLES = 8;

function plural(n: number, uno: string, varios: string): string {
  return `${n} ${n === 1 ? uno : varios}`;
}

/** Los medios con los que se pagó una venta: "efvo + MP". */
function mediosDe(v: FilaVenta): string {
  const medios = Object.keys(v.porMedio) as (keyof typeof MEDIO_CORTO)[];
  return medios.length
    ? medios.map((m) => MEDIO_CORTO[m]).join(" + ")
    : "";
}

export default async function Inicio() {
  const hoy = hoyLocal();
  const rangoHoy = resolverRango("dia", hoy);

  const [balance, resumen, ventasDeHoy, clientes, deudas, faltantes, pedidos] =
    await Promise.all([
      balanceDelDia(hoy),
      resumenDeVentas(rangoHoy),
      listarVentas(rangoHoy),
      listarClientes(),
      deudaProveedores(),
      listarFaltantes(),
      listarPedidos(60),
    ]);

  const fiadoCentavos = clientes.reduce(
    (total, c) => total + Math.max(c.saldoCentavos, 0),
    0,
  );
  const deudores = clientes.filter((c) => c.saldoCentavos > 0).length;

  const aProveedores = deudas.reduce((t, d) => t + d.totalCentavos, 0);
  const proveedoresSinPrecio = deudas.some((d) => d.faltanPrecios);

  const nuevos = pedidos
    .filter((p) => p.estado === "nuevo")
    // El que más lleva esperando va primero.
    .sort((a, b) => a.creadoEn.getTime() - b.creadoEn.getTime());

  const hayNuevos = nuevos.length > 0;

  /* ── Bloque 1: las ventas de hoy ─────────────────────────────────────── */

  const visibles = ventasDeHoy.slice(0, VENTAS_VISIBLES);
  const hayMasVentas = ventasDeHoy.length > visibles.length;

  const columnasVentas: Columna<FilaVenta>[] = [
    {
      clave: "hora",
      titulo: "Hora",
      celda: (v) => (
        <span className="cifra text-tinta-suave">{cuandoCorto(v.cuando, hoy)}</span>
      ),
      // Sólo se totaliza cuando se ven todas: un total de "las primeras ocho"
      // se leería como el del día.
      total: () => (hayMasVentas ? <Nada /> : "Total"),
    },
    {
      clave: "detalle",
      titulo: "Qué se vendió",
      ancho: "min-w-44",
      celda: (v) => (
        <span className={v.anulada ? "text-tinta-suave line-through" : ""}>
          {v.detalle ?? <Nada />}
        </span>
      ),
    },
    {
      clave: "cliente",
      titulo: "Cliente",
      celda: (v) => v.cliente?.nombre ?? <Nada />,
    },
    {
      clave: "medio",
      titulo: "Medio",
      celda: (v) => mediosDe(v) || <Nada />,
    },
    {
      clave: "estado",
      titulo: "Estado",
      celda: (v) =>
        v.anulada ? (
          <Pastilla tono="apagado">Anulada</Pastilla>
        ) : v.pendiente ? (
          <Pastilla tono="espera">Esperando QR</Pastilla>
        ) : (
          <Pastilla tono="pago">Cobrada</Pastilla>
        ),
    },
    {
      clave: "total",
      titulo: "Total",
      numerica: true,
      celda: (v) => (
        <span className={v.anulada ? "text-tinta-suave line-through" : ""}>
          {formatearCentavos(v.totalCentavos)}
        </span>
      ),
      total: (filas) =>
        hayMasVentas ? (
          <Nada />
        ) : (
          formatearCentavos(
            filas
              .filter((v) => !v.anulada && !v.pendiente)
              .reduce((t, v) => t + v.totalCentavos, 0),
          )
        ),
    },
  ];

  /* ── Bloque 2: pedidos de la tienda sin atender ──────────────────────── */

  const columnasPedidos: Columna<FilaPedido>[] = [
    {
      clave: "numero",
      titulo: "Nº",
      celda: (p) => <span className="cifra font-medium">#{p.numero}</span>,
    },
    {
      clave: "espera",
      titulo: "Espera",
      celda: (p) => (
        <span className="whitespace-nowrap text-deuda">
          {haceCuanto(p.creadoEn)}
        </span>
      ),
    },
    {
      clave: "cliente",
      titulo: "Cliente",
      celda: (p) => (
        <>
          {p.nombre}
          <span className="block text-[0.65rem] text-tinta-suave">
            {p.entrega === "envio" ? "Envío" : "Retira"}
          </span>
        </>
      ),
    },
    {
      clave: "total",
      titulo: "Total",
      numerica: true,
      celda: (p) => formatearCentavos(p.totalCentavos),
      total: (filas) =>
        formatearCentavos(filas.reduce((t, p) => t + p.totalCentavos, 0)),
    },
  ];

  /* ── Bloque 3: lo que hay que pagar ──────────────────────────────────── */

  const columnasDeudas: Columna<DeudaProveedor>[] = [
    {
      clave: "proveedor",
      titulo: "Proveedor",
      celda: (d) => d.proveedor,
    },
    {
      clave: "compras",
      titulo: "Compras",
      numerica: true,
      celda: (d) => d.compras,
    },
    {
      clave: "antiguedad",
      titulo: "La más vieja",
      numerica: true,
      celda: (d) => {
        const dias = diasDesde(d.masVieja);
        return dias <= 0 ? "de hoy" : `${dias} d`;
      },
    },
    {
      clave: "debe",
      titulo: "Se debe",
      numerica: true,
      celda: (d) =>
        d.totalCentavos === 0 && d.faltanPrecios ? (
          <span className="text-tinta-suave">a definir</span>
        ) : (
          <span className={d.faltanPrecios ? "text-deuda" : ""}>
            {formatearCentavos(d.totalCentavos)}
            {d.faltanPrecios && " +"}
          </span>
        ),
      total: (filas) =>
        filas.length === 0
          ? null
          : formatearCentavos(filas.reduce((t, d) => t + d.totalCentavos, 0)),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4">
        <h1 className="font-display text-2xl leading-none">Inicio</h1>
        <p className="text-sm text-tinta-suave">{fechaLarga(hoy)}</p>
      </div>

      <Tira
        datos={[
          {
            etiqueta: "Ventas hoy",
            valor: resumen.cobradas,
            pie:
              resumen.pendientes > 0
                ? `${resumen.pendientes} esperando el QR`
                : resumen.cobradas > 0
                  ? `${formatearCentavos(Math.round(resumen.cobradoCentavos / resumen.cobradas))} cada una`
                  : "ninguna todavía",
            href: "/ventas",
          },
          {
            etiqueta: "Fiado en la calle",
            valor: formatearCentavos(fiadoCentavos),
            pie: deudores === 0 ? "nadie debe" : plural(deudores, "cliente", "clientes"),
            tono: fiadoCentavos > 0 ? "deuda" : "suave",
            href: "/fiado",
          },
          {
            etiqueta: "A pagar a proveedores",
            valor:
              aProveedores === 0 && proveedoresSinPrecio
                ? "a definir"
                : formatearCentavos(aProveedores),
            pie:
              deudas.length === 0
                ? "todo pago"
                : plural(deudas.length, "proveedor", "proveedores"),
            tono: aProveedores > 0 ? "deuda" : "suave",
            href: "/compras?por=estado&impagas=1",
          },
          {
            etiqueta: "Pedidos nuevos",
            valor: nuevos.length,
            pie: hayNuevos ? "alguien espera" : "nadie esperando",
            tono: hayNuevos ? "deuda" : "suave",
            href: "/pedidos",
          },
          {
            etiqueta: "Falta comprar",
            valor: faltantes.length,
            pie: faltantes.length === 0 ? "nada marcado" : "marcados en stock",
            tono: faltantes.length > 0 ? "deuda" : "suave",
            href: "/stock",
          },
        ]}
        destacado={{
          etiqueta: "Entró hoy",
          valor: formatearCentavos(balance.entroCentavos),
          pie:
            balance.salioCentavos > 0
              ? `salió ${formatearCentavos(balance.salioCentavos)} · quedó ${balance.resultadoCentavos < 0 ? "−" : ""}${formatearCentavos(Math.abs(balance.resultadoCentavos))}`
              : "todavía no salió nada",
          tono: "pago",
        }}
      />

      {/*
        El pedido nuevo es lo único urgente de toda la app —hay alguien
        esperando—, así que va ARRIBA de todo y primero en la grilla.
      */}
      {hayNuevos && (
        <p
          role="status"
          className="flex items-center gap-2 rounded-xl bg-deuda-tenue px-4 py-2 text-sm text-deuda"
        >
          <span className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-deuda" />
          {nuevos.length === 1
            ? "Hay 1 pedido de la tienda sin atender"
            : `Hay ${nuevos.length} pedidos de la tienda sin atender`}
          {" · "}el más viejo llegó {haceCuanto(nuevos[0].creadoEn)}
        </p>
      )}

      <div className="grid items-start gap-3 lg:grid-cols-3">
        {hayNuevos && (
          <BloqueInicio
            titulo="Pedidos sin atender"
            href="/pedidos"
            enlace="Ir a pedidos"
            urgente
          >
            <Tabla
              columnas={columnasPedidos}
              filas={nuevos}
              claveDe={(p) => p.id}
            />
          </BloqueInicio>
        )}

        <BloqueInicio
          titulo="Ventas de hoy"
          href="/ventas"
          enlace="Ver todas"
          className="lg:col-span-2"
          pie={
            hayMasVentas
              ? `Se ven las últimas ${visibles.length} de ${ventasDeHoy.length}.`
              : undefined
          }
        >
          <Tabla
            columnas={columnasVentas}
            filas={visibles}
            claveDe={(v) => v.id}
            vacio="Todavía no se vendió nada hoy."
          />
        </BloqueInicio>

        <BloqueInicio
          titulo="Hay que pagar"
          href="/compras?por=estado&impagas=1"
          enlace="Ver compras"
        >
          <Tabla
            columnas={columnasDeudas}
            filas={deudas}
            claveDe={(d) => d.proveedorId}
            vacio="No se le debe nada a nadie."
          />
        </BloqueInicio>
      </div>
    </div>
  );
}
