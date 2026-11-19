import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import CabeceraStock from "@/components/CabeceraStock";
import CompraEnPlanilla from "@/components/CompraEnPlanilla";
import Tira from "@/components/Tira";
import { historialDeCompras } from "@/lib/compras";
import { fechaCorta, fechaLarga, hoyLocal } from "@/lib/fechas";
import { resolverRango } from "@/lib/periodo";
import { formatearCentavos } from "@/lib/plata";
import { contarPedidosAbiertos } from "@/lib/reposicion";

export const dynamic = "force-dynamic";

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export async function generateMetadata({
  params,
}: PageProps<"/compras/dia/[fecha]">): Promise<Metadata> {
  const { fecha } = await params;
  return {
    title: FECHA.test(fecha)
      ? `Compras del ${fechaCorta(fecha)} — El Osito`
      : "Compras — El Osito",
  };
}

/**
 * El último nivel: todo lo que entró un día puntual, de todos los proveedores.
 *
 * Se llega desde el proveedor o desde la lista de días, y contesta la pregunta
 * que ninguna de las dos contesta sola: "el martes, ¿qué me trajeron?".
 */
export default async function DiaDeCompras({
  params,
}: PageProps<"/compras/dia/[fecha]">) {
  const { fecha } = await params;
  if (!FECHA.test(fecha)) notFound();

  const [lista, pedidosAbiertos] = await Promise.all([
    historialDeCompras({ desde: fecha, hasta: fecha }),
    contarPedidosAbiertos(),
  ]);

  const total = lista.reduce((t, c) => t + c.montoCentavos, 0);
  const impago = lista.reduce(
    (t, c) => t + (c.pagadoEn ? 0 : c.montoCentavos),
    0,
  );
  const sinPrecios = lista.filter((c) => c.faltanPrecios).length;
  const hoy = hoyLocal();
  const rango = resolverRango("dia", fecha);

  return (
    <div className="space-y-3">
      <CabeceraStock
        activa="compras"
        rango={rango}
        base="/compras"
        pedidosAbiertos={pedidosAbiertos}
        sinSelector
      />

      <div className="flex flex-wrap items-baseline gap-x-3">
        <Link
          href={`/compras?periodo=mes&fecha=${fecha}&por=fecha`}
          className="text-sm text-tinta-suave underline underline-offset-4"
        >
          ← Todos los días
        </Link>
        <h2 className="font-display text-2xl leading-none">
          {fecha === hoy ? "Hoy" : fechaLarga(fecha)}
        </h2>
      </div>

      <Tira
        datos={[
          { etiqueta: "Compras", valor: lista.length },
          {
            etiqueta: "Proveedores",
            valor: new Set(lista.map((c) => c.proveedorId)).size,
          },
          {
            etiqueta: "Sin pagar",
            valor: formatearCentavos(impago),
            tono: impago > 0 ? "deuda" : "suave",
            pie: impago > 0 ? "quedó a cuenta" : undefined,
          },
          {
            etiqueta: "Faltan precios",
            valor: sinPrecios,
            tono: sinPrecios > 0 ? "deuda" : "suave",
          },
        ]}
        destacado={{
          etiqueta: "Entró de mercadería",
          valor: formatearCentavos(total),
          tono: "normal",
          pie: lista.length === 0 ? "No llegó nada este día." : undefined,
        }}
      />

      {lista.length === 0 ? (
        <p className="rounded-xl border border-linea bg-tarjeta px-4 py-6 text-center text-sm text-tinta-suave">
          No hay compras cargadas con esta fecha.
        </p>
      ) : (
        lista.map((compra) => (
          <CompraEnPlanilla
            key={compra.id}
            compra={compra}
            hoy={hoy}
            titulo={
              <Link
                href={`/compras/proveedor/${compra.proveedorId}?periodo=mes&fecha=${fecha}`}
                className="font-medium underline-offset-4 hover:underline"
              >
                {compra.proveedor}
              </Link>
            }
          />
        ))
      )}
    </div>
  );
}
