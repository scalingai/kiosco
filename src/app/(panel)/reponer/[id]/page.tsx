import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import CabeceraStock from "@/components/CabeceraStock";
import PlanillaPedido from "@/components/PlanillaPedido";
import Tira from "@/components/Tira";
import { formatearCentavos } from "@/lib/plata";
import { resolverRango } from "@/lib/periodo";
import { contarPedidosAbiertos, leerPedido } from "@/lib/reposicion";
import { listarNombresDeProductos } from "@/lib/stock";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Cargar compra — El Osito" };

export default async function CompraAbiertaPage({
  params,
}: PageProps<"/reponer/[id]">) {
  const { id } = await params;
  const [pedido, productos, pedidosAbiertos] = await Promise.all([
    leerPedido(id),
    listarNombresDeProductos(),
    contarPedidosAbiertos(),
  ]);

  if (!pedido) notFound();

  const incompleto = pedido.sinPrecio > 0;

  return (
    <div className="space-y-3">
      <CabeceraStock
        activa="cargar"
        rango={resolverRango("mes", new Date().toLocaleDateString("sv-SE"))}
        base="/reponer"
        pedidosAbiertos={pedidosAbiertos}
        sinSelector
      />

      <div className="flex flex-wrap items-baseline gap-x-3">
        <Link
          href="/reponer"
          className="text-sm text-tinta-suave underline underline-offset-4"
        >
          ← Compras abiertas
        </Link>
        <h2 className="font-display text-2xl leading-none">{pedido.proveedor}</h2>
      </div>

      <Tira
        datos={[
          { etiqueta: "Renglones", valor: pedido.renglones.length },
          {
            etiqueta: "Sin precio",
            valor: pedido.sinPrecio,
            tono: incompleto ? "deuda" : "suave",
            pie: incompleto ? "esperan que el proveedor los cante" : undefined,
          },
          {
            etiqueta: "Factura",
            valor: pedido.enBlanco ? "En blanco" : "En negro",
            pie: pedido.enBlanco ? "el costo real suma 21% de IVA" : undefined,
          },
        ]}
        destacado={{
          etiqueta: incompleto ? "Total parcial" : "Total",
          valor: formatearCentavos(pedido.totalCentavos),
          tono: "normal",
          pie: incompleto
            ? `incompleto: faltan los precios de ${pedido.sinPrecio} ${pedido.sinPrecio === 1 ? "renglón" : "renglones"}`
            : undefined,
        }}
      />

      <p className="text-sm text-tinta-suave">
        Anotá el precio del bulto como lo canta el proveedor. La planilla saca el
        costo por unidad y a cuánto conviene venderlo.
      </p>

      <PlanillaPedido pedido={pedido} productos={productos} />
    </div>
  );
}
