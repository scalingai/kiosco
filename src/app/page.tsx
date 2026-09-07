import Link from "next/link";
import type { Metadata } from "next";
import { balanceDelDia, deudaProveedores, resumenDelMes } from "@/lib/caja";
import { listarClientes } from "@/lib/consultas";
import { fechaLarga, hoyLocal } from "@/lib/fechas";
import { formatearCentavos } from "@/lib/plata";
import { listarFaltantes } from "@/lib/stock";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "El Osito" };

/** Una cifra que lleva a su pantalla. Todo el inicio es esto repetido. */
function Tarjeta({
  href,
  titulo,
  cifra,
  color = "text-tinta",
  pie,
}: {
  href: string;
  titulo: string;
  cifra: string;
  color?: string;
  pie: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="block rounded-2xl border border-linea bg-white/60 px-4 py-3.5 transition-colors hover:bg-white"
    >
      <p className="text-xs uppercase tracking-[0.16em] text-tinta-suave">
        {titulo}
      </p>
      <p className={"cifra mt-1 text-2xl font-medium " + color}>{cifra}</p>
      <p className="mt-1 text-xs text-tinta-suave">{pie}</p>
    </Link>
  );
}

export default async function Inicio() {
  const hoy = hoyLocal();

  const [clientes, balance, mes, deudas, faltantes] = await Promise.all([
    listarClientes(),
    balanceDelDia(hoy),
    resumenDelMes(hoy),
    deudaProveedores(),
    listarFaltantes(),
  ]);

  const fiadoCentavos = clientes.reduce(
    (total, c) => total + Math.max(c.saldoCentavos, 0),
    0,
  );
  const deudores = clientes.filter((c) => c.saldoCentavos > 0).length;
  const sinPrecio = clientes.filter((c) => c.faltanPrecios).length;

  const aProveedores = deudas.reduce((t, d) => t + d.totalCentavos, 0);
  const proveedoresSinPrecio = deudas.some((d) => d.faltanPrecios);

  const positivo = balance.resultadoCentavos >= 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl leading-none">Cómo va todo</h1>
        <p className="mt-1 text-sm text-tinta-suave">{fechaLarga(hoy)}</p>
      </div>

      {/* La caja de hoy va sola y grande: es lo que se mira al pasar. */}
      <Link
        href="/caja"
        className="block rounded-2xl border border-linea bg-papel-hondo px-5 py-6 transition-colors hover:border-tinta-suave"
      >
        <p className="text-xs uppercase tracking-[0.18em] text-tinta-suave">
          Quedó en caja hoy
        </p>
        <p
          className={
            "cifra mt-1 text-4xl font-medium sm:text-5xl " +
            (positivo ? "text-pago" : "text-deuda")
          }
        >
          {positivo ? "" : "−"}
          {formatearCentavos(Math.abs(balance.resultadoCentavos))}
        </p>
        <p className="mt-1 text-sm text-tinta-suave">
          {formatearCentavos(balance.entroCentavos)} entró ·{" "}
          {formatearCentavos(balance.salioCentavos)} salió
          {balance.ventasCentavos === 0 && (
            <span className="text-deuda"> · falta anotar la venta del día</span>
          )}
        </p>
      </Link>

      <div className="grid gap-3 sm:grid-cols-2">
        <Tarjeta
          href="/fiado"
          titulo="Fiado en la calle"
          cifra={formatearCentavos(fiadoCentavos)}
          color="text-deuda"
          pie={
            deudores === 0
              ? "Nadie debe nada."
              : `${deudores === 1 ? "1 cliente" : deudores + " clientes"} con deuda${sinPrecio > 0 ? ` · ${sinPrecio} con precios sin poner` : ""}`
          }
        />

        <Tarjeta
          href="/ventas"
          titulo="Ventas del mes"
          cifra={formatearCentavos(mes.ventasCentavos)}
          color="text-pago"
          pie={
            mes.cobrosCentavos > 0
              ? `Más ${formatearCentavos(mes.cobrosCentavos)} de fiado cobrado`
              : "Sin fiado cobrado este mes"
          }
        />

        <Tarjeta
          href="/compras?por=estado&impagas=1"
          titulo="Se le debe a proveedores"
          cifra={
            aProveedores === 0 && proveedoresSinPrecio
              ? "a definir"
              : formatearCentavos(aProveedores)
          }
          color={aProveedores > 0 ? "text-deuda" : "text-tinta"}
          pie={
            deudas.length === 0
              ? "Todo pagado."
              : `${deudas.length === 1 ? "1 proveedor" : deudas.length + " proveedores"} con compras sin pagar`
          }
        />

        <Tarjeta
          href="/stock"
          titulo="Falta comprar"
          cifra={String(faltantes.length)}
          color={faltantes.length > 0 ? "text-deuda" : "text-tinta"}
          pie={
            faltantes.length === 0
              ? "Nada marcado como faltante."
              : faltantes
                  .slice(0, 4)
                  .map((f) => f.nombre)
                  .join(", ") + (faltantes.length > 4 ? "…" : "")
          }
        />
      </div>

      <section className="rounded-2xl border border-linea bg-white/60 px-4 py-3.5">
        <h2 className="font-display text-xl leading-none">Resultado del mes</h2>
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-tinta-suave">Ventas</dt>
            <dd className="cifra">{formatearCentavos(mes.ventasCentavos)}</dd>
          </div>
          <div>
            <dt className="text-xs text-tinta-suave">Fiado cobrado</dt>
            <dd className="cifra">{formatearCentavos(mes.cobrosCentavos)}</dd>
          </div>
          <div>
            <dt className="text-xs text-tinta-suave">Proveedores</dt>
            <dd className="cifra">
              −{formatearCentavos(mes.pagosProveedoresCentavos)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-tinta-suave">Gastos</dt>
            <dd className="cifra">−{formatearCentavos(mes.gastosCentavos)}</dd>
          </div>
        </dl>
        <p className="mt-3 border-t border-linea pt-3 text-sm">
          Queda{" "}
          <span
            className={
              "cifra font-medium " +
              (mes.resultadoCentavos >= 0 ? "text-pago" : "text-deuda")
            }
          >
            {mes.resultadoCentavos < 0 ? "−" : ""}
            {formatearCentavos(Math.abs(mes.resultadoCentavos))}
          </span>{" "}
          en lo que va del mes.
        </p>
      </section>
    </div>
  );
}
