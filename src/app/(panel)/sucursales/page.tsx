import type { Metadata } from "next";
import FormSucursal from "@/components/FormSucursal";
import TarjetaSucursal from "@/components/TarjetaSucursal";
import { listarSucursales } from "@/lib/sucursales";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Sucursales — El Osito" };

/** Lo que puede haber salido de una vuelta de Mercado Pago. */
const AVISOS: Record<string, { texto: string; mal: boolean }> = {
  conectada: { texto: "Mercado Pago quedó conectado.", mal: false },
  cancelado: { texto: "No se completó la conexión.", mal: false },
  invalido: {
    texto: "La vuelta de Mercado Pago no se pudo validar. Probá de nuevo.",
    mal: true,
  },
  fallo: {
    texto: "Mercado Pago no respondió bien. Probá de nuevo en un rato.",
    mal: true,
  },
  sin_configurar: {
    texto: "Falta terminar de configurar la app de Mercado Pago del servidor.",
    mal: true,
  },
  sucursal_invalida: { texto: "Esa sucursal no existe.", mal: true },
};

export default async function Sucursales({
  searchParams,
}: PageProps<"/sucursales">) {
  const parametros = await searchParams;
  const clave = typeof parametros.mp === "string" ? parametros.mp : null;
  const aviso = clave ? AVISOS[clave] : null;

  const locales = await listarSucursales();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl leading-none">Sucursales</h1>
        <p className="mt-1 text-sm text-tinta-suave">
          Cada local cobra con su propia cuenta de Mercado Pago. El QR que sale
          acá es el que se imprime y se pega en el mostrador.
        </p>
      </div>

      {aviso && (
        <p
          role="status"
          className={
            "rounded-xl px-4 py-2.5 text-sm " +
            (aviso.mal
              ? "bg-deuda-tenue text-deuda"
              : "bg-pago-tenue text-pago")
          }
        >
          {aviso.texto}
        </p>
      )}

      <section className="rounded-2xl border border-linea bg-tarjeta px-4 py-3.5">
        <h2 className="font-display text-xl leading-none">Agregar un local</h2>
        <div className="mt-3">
          <FormSucursal />
        </div>
      </section>

      {locales.length === 0 ? (
        <p className="text-sm text-tinta-suave">
          Todavía no hay sucursales cargadas.
        </p>
      ) : (
        <ul className="space-y-3">
          {locales.map((local) => (
            <li key={local.id}>
              <TarjetaSucursal sucursal={local} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
