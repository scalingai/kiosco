import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import BotonCompra from "@/components/BotonCompra";
import CabeceraStock, {
  colaDelPeriodo,
  rangoDeLaUrl,
} from "@/components/CabeceraStock";
import CompraEnPlanilla from "@/components/CompraEnPlanilla";
import { Corte } from "@/components/Planilla";
import PreciosDeCompra from "@/components/PreciosDeCompra";
import Tira from "@/components/Tira";
import { listarProveedores } from "@/lib/caja";
import {
  deudaDelProveedor,
  historialDeCompras,
  obtenerProveedor,
} from "@/lib/compras";
import { fechaCorta, hoyLocal } from "@/lib/fechas";
import { formatearCentavos } from "@/lib/plata";
import { contarPedidosAbiertos } from "@/lib/reposicion";
import { listarNombresDeProductos } from "@/lib/stock";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: PageProps<"/compras/proveedor/[id]">): Promise<Metadata> {
  const { id } = await params;
  const proveedor = await obtenerProveedor(id);
  return { title: proveedor ? `${proveedor.nombre} — El Osito` : "El Osito" };
}

export default async function FichaProveedor({
  params,
  searchParams,
}: PageProps<"/compras/proveedor/[id]">) {
  const { id } = await params;
  const query = await searchParams;
  const verParam = Array.isArray(query.ver) ? query.ver[0] : query.ver;

  const proveedor = await obtenerProveedor(id);
  if (!proveedor) notFound();

  const rango = rangoDeLaUrl(query);
  const verProductos = verParam !== "compras";
  const hoy = hoyLocal();

  const [lista, deuda, proveedores, catalogo, pedidosAbiertos] =
    await Promise.all([
      historialDeCompras({
        desde: rango.desde ?? undefined,
        hasta: rango.hasta ?? undefined,
        proveedorId: id,
      }),
      deudaDelProveedor(id),
      listarProveedores(),
      listarNombresDeProductos(),
      contarPedidosAbiertos(),
    ]);

  const total = lista.reduce((t, c) => t + c.montoCentavos, 0);
  const impago = lista.reduce(
    (t, c) => t + (c.pagadoEn ? 0 : c.montoCentavos),
    0,
  );
  const sinPrecios = lista.filter((c) => c.faltanPrecios).length;
  const cola = colaDelPeriodo(rango);
  const base = `/compras/proveedor/${id}`;

  return (
    <div className="space-y-3">
      <CabeceraStock
        activa="compras"
        rango={rango}
        base={base}
        extra={{ ver: verProductos ? undefined : "compras" }}
        pedidosAbiertos={pedidosAbiertos}
      />

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <Link
            href={`/compras?${cola}`}
            className="text-sm text-tinta-suave underline underline-offset-4"
          >
            ← Compras
          </Link>
          <h2 className="font-display text-2xl leading-none">
            {proveedor.nombre}
          </h2>
        </div>
        <div className="w-full sm:w-72">
          <BotonCompra
            fecha={hoy}
            proveedores={proveedores}
            productos={catalogo}
            proveedorInicial={proveedor.nombre}
          />
        </div>
      </div>

      <Tira
        datos={[
          { etiqueta: "Compras", valor: lista.length, pie: rango.titulo.toLowerCase() },
          {
            etiqueta: "Sin pagar",
            valor: formatearCentavos(impago),
            tono: impago > 0 ? "deuda" : "suave",
            pie: "en este período",
          },
          {
            etiqueta: "Faltan precios",
            valor: sinPrecios,
            tono: sinPrecios > 0 ? "deuda" : "suave",
          },
          // La deuda es de siempre, no del período: una factura de agosto sin
          // pagar no deja de existir porque estés mirando noviembre.
          {
            etiqueta: "Le debés en total",
            valor: formatearCentavos(deuda),
            tono: deuda > 0 ? "deuda" : "suave",
            pie: "todos los períodos",
          },
        ]}
        destacado={{
          etiqueta: "Le compraste",
          valor: formatearCentavos(total),
          tono: "normal",
          pie: rango.titulo,
        }}
      />

      <div className="flex items-center gap-1.5">
        <Corte
          href={`${base}?${cola}`}
          activo={verProductos}
        >
          Compra y precios
        </Corte>
        <Corte href={`${base}?${cola}&ver=compras`} activo={!verProductos}>
          Historial
        </Corte>
      </div>

      {lista.length === 0 ? (
        <p className="rounded-xl border border-linea bg-tarjeta px-4 py-6 text-center text-sm text-tinta-suave">
          No hay compras de este proveedor en {rango.titulo.toLowerCase()}. Probá
          con otro período.
        </p>
      ) : verProductos ? (
        <PreciosDeCompra compras={lista} />
      ) : (
        lista.map((compra) => (
          <CompraEnPlanilla
            key={compra.id}
            compra={compra}
            hoy={hoy}
            titulo={
              <Link
                href={`/compras/dia/${compra.fecha}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {fechaCorta(compra.fecha)}
              </Link>
            }
          />
        ))
      )}
    </div>
  );
}
