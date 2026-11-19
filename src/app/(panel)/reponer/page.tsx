import Link from "next/link";
import type { Metadata } from "next";
import CabeceraStock, { rangoDeLaUrl } from "@/components/CabeceraStock";
import NuevoPedido from "@/components/NuevoPedido";
import Pastilla, { Punto, Tilde } from "@/components/Pastilla";
import Planilla from "@/components/Planilla";
import Tabla, { Nada, type Columna } from "@/components/Tabla";
import Tira from "@/components/Tira";
import { listarProveedores } from "@/lib/caja";
import { fechaCorta } from "@/lib/fechas";
import { formatearCentavos } from "@/lib/plata";
import { listarPedidos } from "@/lib/reposicion";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Cargar compra — El Osito" };

type Pedido = Awaited<ReturnType<typeof listarPedidos>>[number];

/** El día local en que se armó, `YYYY-MM-DD`, igual que se guardan las fechas. */
function diaDe(pedido: Pedido): string {
  return pedido.creadaEn.toLocaleDateString("sv-SE");
}

/**
 * «Cargar compra»: la compra que todavía no tiene los precios.
 *
 * Un pedido al proveedor y una compra son la misma planilla en dos momentos:
 * el pedido se arma ANTES de que venga la mercadería, con las cantidades y los
 * importes en blanco, y se completa con el proveedor enfrente. Por eso vive
 * acá, en Stock, y no aparte.
 *
 * Lo que NO se hace es tratar un importe en blanco como cero. «Todavía no
 * sabemos» y «es gratis» no son lo mismo: cada total de esta pantalla dice
 * cuántos renglones le faltan, y no se presenta como el total hasta que no
 * falte ninguno.
 */
export default async function CargarCompra({
  searchParams,
}: PageProps<"/reponer">) {
  const rango = rangoDeLaUrl(await searchParams);
  const [pedidos, proveedores] = await Promise.all([
    listarPedidos(),
    listarProveedores(),
  ]);

  // Los abiertos se muestran siempre: son trabajo pendiente, no historia, y
  // esconder uno porque se armó el mes pasado es perderlo de vista. El período
  // sólo recorta lo que ya entró.
  const abiertos = pedidos.filter((p) => !p.cerradaEn);
  const cerrados = pedidos.filter((p) => {
    if (!p.cerradaEn) return false;
    const dia = diaDe(p);
    return (
      (rango.desde == null || dia >= rango.desde) &&
      (rango.hasta == null || dia <= rango.hasta)
    );
  });

  const renglones = abiertos.reduce((t, p) => t + p.renglones, 0);
  const sinPrecio = abiertos.reduce((t, p) => t + p.sinPrecio, 0);
  const parcial = abiertos.reduce((t, p) => t + p.totalCentavos, 0);

  const columnasAbiertos: Columna<Pedido>[] = [
    {
      clave: "proveedor",
      titulo: "Proveedor",
      ancho: "min-w-44",
      celda: (p) => (
        <Link
          href={`/reponer/${p.id}`}
          className="font-medium underline-offset-4 hover:underline"
        >
          {p.proveedor}
        </Link>
      ),
      total: (ps) => (
        <span className="text-xs font-normal text-tinta-suave">
          {ps.length === 1 ? "1 compra abierta" : `${ps.length} compras abiertas`}
        </span>
      ),
    },
    {
      clave: "renglones",
      titulo: "Renglones",
      numerica: true,
      celda: (p) => (p.renglones === 0 ? <Nada /> : p.renglones),
      total: (ps) => ps.reduce((t, p) => t + p.renglones, 0),
    },
    {
      clave: "estado",
      titulo: "Precios",
      celda: (p) =>
        p.renglones === 0 ? (
          <Pastilla tono="apagado">vacía</Pastilla>
        ) : p.sinPrecio > 0 ? (
          <Pastilla tono="espera" icono={<Punto />}>
            faltan {p.sinPrecio} de {p.renglones}
          </Pastilla>
        ) : (
          <Pastilla tono="pago" icono={<Tilde />}>
            completos
          </Pastilla>
        ),
      total: (ps) => {
        const faltan = ps.reduce((t, p) => t + p.sinPrecio, 0);
        return faltan > 0 ? (
          <span className="text-xs font-normal text-tinta-suave">
            faltan {faltan}
          </span>
        ) : null;
      },
    },
    {
      // Es lo que suman los renglones CON precio. Mientras falten, dice
      // «parcial» al lado: sin eso se lee como lo que va a costar el pedido.
      clave: "total",
      titulo: "Total",
      ayuda: "sólo lo que ya tiene precio",
      numerica: true,
      celda: (p) =>
        p.renglones === 0 || (p.totalCentavos === 0 && p.sinPrecio > 0) ? (
          <Nada />
        ) : (
          <>
            <span className="font-medium">
              {formatearCentavos(p.totalCentavos)}
            </span>
            {p.sinPrecio > 0 && (
              <span className="ml-1 text-[0.65rem] text-tinta-suave">
                parcial
              </span>
            )}
          </>
        ),
      total: (ps) => {
        const suma = ps.reduce((t, p) => t + p.totalCentavos, 0);
        const incompleto = ps.some((p) => p.sinPrecio > 0);
        return (
          <>
            {formatearCentavos(suma)}
            {incompleto && (
              <span className="ml-1 text-[0.65rem] font-normal text-tinta-suave">
                parcial
              </span>
            )}
          </>
        );
      },
    },
    {
      clave: "iva",
      titulo: "Factura",
      celda: (p) => (
        <span className="text-tinta-suave">
          {p.enBlanco ? "en blanco" : "en negro"}
        </span>
      ),
    },
    {
      clave: "creada",
      titulo: "Armada",
      numerica: true,
      celda: (p) => fechaCorta(diaDe(p)),
    },
  ];

  const columnasCerrados: Columna<Pedido>[] = [
    {
      clave: "proveedor",
      titulo: "Proveedor",
      ancho: "min-w-44",
      celda: (p) => (
        <Link
          href={`/reponer/${p.id}`}
          className="underline-offset-4 hover:underline"
        >
          {p.proveedor}
        </Link>
      ),
      total: (ps) => (
        <span className="text-xs font-normal text-tinta-suave">
          {ps.length === 1 ? "1 compra" : `${ps.length} compras`}
        </span>
      ),
    },
    {
      clave: "renglones",
      titulo: "Renglones",
      numerica: true,
      celda: (p) => (p.renglones === 0 ? <Nada /> : p.renglones),
      total: (ps) => ps.reduce((t, p) => t + p.renglones, 0),
    },
    {
      clave: "total",
      titulo: "Total",
      numerica: true,
      celda: (p) =>
        p.totalCentavos > 0 ? formatearCentavos(p.totalCentavos) : <Nada />,
      total: (ps) =>
        formatearCentavos(ps.reduce((t, p) => t + p.totalCentavos, 0)),
    },
    {
      clave: "creada",
      titulo: "Armada",
      numerica: true,
      celda: (p) => fechaCorta(diaDe(p)),
    },
  ];

  return (
    <div className="space-y-3">
      <CabeceraStock
        activa="cargar"
        rango={rango}
        base="/reponer"
        pedidosAbiertos={abiertos.length}
      />

      <Tira
        datos={[
          { etiqueta: "Compras abiertas", valor: abiertos.length },
          { etiqueta: "Renglones", valor: renglones },
          {
            etiqueta: "Sin precio",
            valor: sinPrecio,
            tono: sinPrecio > 0 ? "deuda" : "suave",
            pie: sinPrecio > 0 ? "esperan que el proveedor los cante" : undefined,
          },
          {
            etiqueta: "Ya entraron",
            valor: cerrados.length,
            pie: rango.titulo.toLowerCase(),
          },
        ]}
        destacado={{
          etiqueta: sinPrecio > 0 ? "Total parcial" : "Total",
          valor: formatearCentavos(parcial),
          tono: "normal",
          pie:
            sinPrecio > 0
              ? `incompleto: faltan los precios de ${sinPrecio} ${sinPrecio === 1 ? "renglón" : "renglones"}`
              : "todos los renglones tienen precio",
        }}
      />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto]">
        <NuevoPedido proveedores={proveedores} />

        {/* La compra directa: la que ya viene con la factura en la mano y no
            necesita pasar por la planilla de precios en blanco. */}
        <Link
          href="/reponer?nueva=compra"
          className="flex flex-col justify-center rounded-xl border border-linea bg-tarjeta px-4 py-3 transition-colors hover:bg-papel-hondo lg:w-72"
        >
          <span className="text-sm font-semibold">
            Cargar una compra con precios
          </span>
          <span className="mt-0.5 text-xs text-tinta-suave">
            Ya llegó y tenés la factura: anotala completa.
          </span>
        </Link>
      </div>

      <Planilla
        titulo="Compras abiertas"
        derecha="se muestran siempre, sin importar el período"
      >
        <Tabla
          columnas={columnasAbiertos}
          filas={abiertos}
          claveDe={(p) => p.id}
          vacio="No hay ninguna compra abierta. Elegí un proveedor arriba y empezá una."
        />
      </Planilla>

      <Planilla titulo="Ya entraron" derecha={rango.titulo}>
        <Tabla
          columnas={columnasCerrados}
          filas={cerrados}
          claveDe={(p) => p.id}
          vacio={`No entró ninguna en ${rango.titulo.toLowerCase()}.`}
        />
      </Planilla>
    </div>
  );
}
