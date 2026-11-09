import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import PlanillaPedido from "@/components/PlanillaPedido";
import { leerPedido } from "@/lib/reposicion";
import { listarNombresDeProductos } from "@/lib/stock";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Pedido — El Osito" };

export default async function PedidoPage({
  params,
}: PageProps<"/reponer/[id]">) {
  const { id } = await params;
  const [pedido, productos] = await Promise.all([
    leerPedido(id),
    listarNombresDeProductos(),
  ]);

  if (!pedido) notFound();

  return (
    <>
      <header className="mb-5">
        <Link
          href="/reponer"
          className="text-xs font-medium text-tinta-suave hover:underline"
        >
          ← Pedidos
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          {pedido.proveedor}
        </h1>
        <p className="mt-1 text-sm text-tinta-suave">
          Anotá el precio del bulto como lo canta el proveedor. La planilla
          saca el costo por unidad y a cuánto conviene venderlo.
        </p>
      </header>

      <PlanillaPedido pedido={pedido} productos={productos} />
    </>
  );
}
