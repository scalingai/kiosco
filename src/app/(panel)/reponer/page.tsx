import Link from "next/link";
import type { Metadata } from "next";
import NuevoPedido from "@/components/NuevoPedido";
import { listarProveedores } from "@/lib/caja";
import { fechaLarga } from "@/lib/fechas";
import { listarPedidos } from "@/lib/reposicion";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Reponer — El Osito" };

export default async function ReponerPage() {
  const [pedidos, proveedores] = await Promise.all([
    listarPedidos(),
    listarProveedores(),
  ]);

  const abiertos = pedidos.filter((p) => !p.cerradaEn);
  const cerrados = pedidos.filter((p) => p.cerradaEn);

  return (
    <>
      <header className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Reponer</h1>
        <p className="mt-1 text-sm text-tinta-suave">
          Lo que hay que pedirle a cada proveedor. Se arma antes de que venga,
          y los precios se completan con él enfrente.
        </p>
      </header>

      <NuevoPedido proveedores={proveedores} />

      {abiertos.length > 0 && (
        <ul className="mt-6 space-y-2">
          {abiertos.map((p) => (
            <li key={p.id}>
              <Link
                href={`/reponer/${p.id}`}
                className="flex items-center justify-between gap-4 rounded-xl border border-linea bg-tarjeta p-4 transition-colors hover:bg-papel-hondo"
              >
                <span className="min-w-0">
                  <span className="block font-semibold">{p.proveedor}</span>
                  <span className="block text-xs text-tinta-suave">
                    {p.renglones === 0
                      ? "sin renglones todavía"
                      : `${p.renglones} ${p.renglones === 1 ? "renglón" : "renglones"}`}
                    {" · "}
                    {p.enBlanco ? "en blanco" : "en negro"}
                    {" · "}
                    {fechaLarga(p.creadaEn.toISOString().slice(0, 10))}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-acento">
                  Abrir
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {abiertos.length === 0 && (
        <p className="mt-6 rounded-xl border border-dashed border-linea p-6 text-center text-sm text-tinta-suave">
          No hay ningún pedido armado. Elegí un proveedor arriba y empezá.
        </p>
      )}

      {cerrados.length > 0 && (
        <section className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-tinta-suave">
            Ya entraron
          </h2>
          <ul className="mt-2 space-y-1">
            {cerrados.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-tinta-suave"
              >
                <span>{p.proveedor}</span>
                <span className="text-xs">{fechaLarga(p.creadaEn.toISOString().slice(0, 10))}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
