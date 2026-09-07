import Link from "next/link";
import type { Metadata } from "next";
import BotonAnularFila from "@/components/BotonAnularFila";
import BotonPagarCompra from "@/components/BotonPagarCompra";
import CargaDelDia from "@/components/CargaDelDia";
import SelectorDia from "@/components/SelectorDia";
import {
  balanceDelDia,
  deudaProveedores,
  listarProveedores,
  resumenDelMes,
} from "@/lib/caja";
import { fechaCorta, fechaLarga, hoyLocal } from "@/lib/fechas";
import { ETIQUETA_GASTO } from "@/lib/negocio";
import { formatearCentavos } from "@/lib/plata";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Caja — El Osito" };

const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const MES = new Intl.DateTimeFormat("es-AR", { month: "long", year: "numeric" });

function Seccion({
  titulo,
  total,
  children,
}: {
  titulo: string;
  total?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-linea bg-white/60 px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="font-display text-xl leading-none">{titulo}</h2>
        {total && <span className="cifra text-sm font-medium">{total}</span>}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Vacio({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-tinta-suave">{children}</p>;
}

export default async function Caja({ searchParams }: PageProps<"/caja">) {
  const params = await searchParams;
  const pedida = Array.isArray(params.f) ? params.f[0] : params.f;
  // Una fecha rota en la URL no puede tumbar la pantalla: se cae en hoy.
  const fecha = pedida && FECHA.test(pedida) ? pedida : hoyLocal();
  const esHoy = fecha === hoyLocal();

  const [balance, mes, proveedores, deudas] = await Promise.all([
    balanceDelDia(fecha),
    resumenDelMes(fecha),
    listarProveedores(),
    deudaProveedores(),
  ]);

  const positivo = balance.resultadoCentavos >= 0;
  const deudaTotal = deudas.reduce((t, d) => t + d.totalCentavos, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl leading-none">
            {esHoy ? "Hoy" : fechaCorta(fecha)}
          </h1>
          <p className="mt-1 text-sm text-tinta-suave">{fechaLarga(fecha)}</p>
        </div>
        <SelectorDia fecha={fecha} />
      </div>

      {/* El número grande es el resultado: es la pregunta que se hace todos los
          días al bajar la persiana. */}
      <section className="rounded-2xl border border-linea bg-papel-hondo px-5 py-6">
        <p className="text-xs uppercase tracking-[0.18em] text-tinta-suave">
          Quedó en caja
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

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-white/70 px-3 py-2.5">
            <dt className="text-xs text-tinta-suave">Entró</dt>
            <dd className="cifra mt-0.5 font-medium text-pago">
              {formatearCentavos(balance.entroCentavos)}
            </dd>
            <dd className="mt-1 text-xs text-tinta-suave">
              {formatearCentavos(balance.ventasCentavos)} de venta
              {balance.cobrosCentavos > 0 &&
                ` · ${formatearCentavos(balance.cobrosCentavos)} de fiado cobrado`}
            </dd>
          </div>

          <div className="rounded-xl bg-white/70 px-3 py-2.5">
            <dt className="text-xs text-tinta-suave">Salió</dt>
            <dd className="cifra mt-0.5 font-medium text-deuda">
              {formatearCentavos(balance.salioCentavos)}
            </dd>
            <dd className="mt-1 text-xs text-tinta-suave">
              {formatearCentavos(balance.pagosProveedoresCentavos)} a proveedores
              {balance.gastosCentavos > 0 &&
                ` · ${formatearCentavos(balance.gastosCentavos)} de gastos`}
            </dd>
          </div>
        </dl>

        {balance.fiadoOtorgadoCentavos > 0 && (
          <p className="mt-3 text-xs text-tinta-suave">
            Además fiaste{" "}
            <span className="cifra">
              {formatearCentavos(balance.fiadoOtorgadoCentavos)}
            </span>
            : mercadería que salió y todavía no es plata.
          </p>
        )}
      </section>

      <CargaDelDia fecha={fecha} proveedores={proveedores} />

      <Seccion
        titulo="Ventas"
        total={formatearCentavos(balance.ventasCentavos)}
      >
        {balance.ventas.length === 0 ? (
          <Vacio>Todavía no anotaste la venta de este día.</Vacio>
        ) : (
          <ul className="divide-y divide-linea">
            {balance.ventas.map((v) => (
              <li
                key={v.id}
                className="flex items-center justify-between gap-3 py-2"
              >
                <span className="min-w-0 text-sm">
                  {v.nota || <span className="text-tinta-suave">Venta</span>}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="cifra text-sm font-medium text-pago">
                    {formatearCentavos(v.montoCentavos)}
                  </span>
                  <BotonAnularFila que="venta" id={v.id} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      <Seccion
        titulo="Compras"
        total={formatearCentavos(balance.pagosProveedoresCentavos)}
      >
        {balance.compras.length === 0 ? (
          <Vacio>No llegó ni se pagó mercadería este día.</Vacio>
        ) : (
          <ul className="divide-y divide-linea">
            {balance.compras.map((c) => {
              const pagadaHoy = c.pagadoEn === fecha;
              const llegoHoy = c.fecha === fecha;
              return (
                <li key={c.id} className="py-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-sm">{c.proveedor}</span>
                    <span
                      className={
                        "cifra shrink-0 text-sm font-medium " +
                        (pagadaHoy ? "text-deuda" : "text-tinta-suave")
                      }
                    >
                      {pagadaHoy ? "−" : ""}
                      {formatearCentavos(c.montoCentavos)}
                    </span>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-tinta-suave">
                    <span>
                      {/* Que la plata salga otro día es lo normal cuando se
                          compra a cuenta, así que se dice en cada fila. */}
                      {pagadaHoy && !llegoHoy
                        ? `pagada hoy · llegó el ${fechaCorta(c.fecha)}`
                        : pagadaHoy
                          ? "llegó y se pagó"
                          : c.pagadoEn
                            ? `pagada el ${fechaCorta(c.pagadoEn)}`
                            : "a cuenta, sin pagar"}
                    </span>
                    {c.comprobante && <span>N.º {c.comprobante}</span>}
                    {c.nota && <span>{c.nota}</span>}
                    {c.faltanPrecios && (
                      <span className="text-deuda">faltan precios</span>
                    )}
                    <span className="ml-auto flex items-center gap-3">
                      <BotonPagarCompra
                        id={c.id}
                        pagadoEn={c.pagadoEn}
                        hoy={fecha}
                      />
                      <BotonAnularFila que="compra" id={c.id} />
                    </span>
                  </div>

                  {/* Lo que entró y a cuánto salió cada unidad: es el número
                      con el que después se pone el precio de venta. */}
                  {c.renglones.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 border-l border-linea pl-3">
                      {c.renglones.map((r) => (
                        <li
                          key={r.id}
                          className="flex flex-wrap items-baseline gap-x-2 text-xs text-tinta-suave"
                        >
                          <span className="text-tinta">
                            {r.descripcion || "sin nombre"}
                          </span>
                          <span className="cifra">
                            {r.cantidad}
                            {r.unidadesPorBulto > 1 && `×${r.unidadesPorBulto}`}
                          </span>
                          {r.importeCentavos != null && (
                            <span className="cifra">
                              {formatearCentavos(r.importeCentavos)}
                            </span>
                          )}
                          {r.costoUnitarioCentavos != null && (
                            <span className="cifra text-tinta">
                              {formatearCentavos(r.costoUnitarioCentavos)} c/u
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Seccion>

      <Seccion titulo="Gastos" total={formatearCentavos(balance.gastosCentavos)}>
        {balance.gastos.length === 0 ? (
          <Vacio>Ningún gasto anotado.</Vacio>
        ) : (
          <ul className="divide-y divide-linea">
            {balance.gastos.map((g) => (
              <li
                key={g.id}
                className="flex items-center justify-between gap-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm">
                    {g.descripcion || ETIQUETA_GASTO[g.categoria]}
                  </span>
                  {g.descripcion && (
                    <span className="text-xs text-tinta-suave">
                      {ETIQUETA_GASTO[g.categoria]}
                    </span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <span className="cifra text-sm font-medium text-deuda">
                    −{formatearCentavos(g.montoCentavos)}
                  </span>
                  <BotonAnularFila que="gasto" id={g.id} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      {balance.cobros.length > 0 && (
        <Seccion
          titulo="Fiado cobrado"
          total={formatearCentavos(balance.cobrosCentavos)}
        >
          <ul className="divide-y divide-linea">
            {balance.cobros.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-3 py-2"
              >
                <Link
                  href={`/cliente/${c.clienteId}`}
                  className="min-w-0 truncate text-sm underline underline-offset-4"
                >
                  {c.cliente}
                </Link>
                <span className="cifra shrink-0 text-sm font-medium text-pago">
                  {formatearCentavos(c.montoCentavos)}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-tinta-suave">
            Se anotan desde la cuenta del cliente. Acá se ven porque esa plata
            entró a la caja este día.
          </p>
        </Seccion>
      )}

      {deudaTotal > 0 && (
        <Seccion
          titulo="Se le debe a proveedores"
          total={formatearCentavos(deudaTotal)}
        >
          <ul className="divide-y divide-linea">
            {deudas.map((d) => (
              <li
                key={d.proveedorId}
                className="flex items-center justify-between gap-3 py-2"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm">{d.proveedor}</span>
                  <span className="text-xs text-tinta-suave">
                    {d.compras === 1
                      ? "1 compra sin pagar"
                      : `${d.compras} compras sin pagar`}{" "}
                    · desde el {fechaCorta(d.masVieja)}
                    {d.faltanPrecios && (
                      <span className="text-deuda"> · faltan precios</span>
                    )}
                  </span>
                </span>
                <span className="cifra shrink-0 text-sm font-medium text-deuda">
                  {/* Un renglón sin importe no vale cero: vale "todavía no
                      sabemos", y taparlo con un cero sería mentir el número. */}
                  {d.totalCentavos === 0 && d.faltanPrecios
                    ? "a definir"
                    : formatearCentavos(d.totalCentavos)}
                </span>
              </li>
            ))}
          </ul>
        </Seccion>
      )}

      <Seccion titulo={`Mes de ${MES.format(new Date(`${mes.desde}T12:00:00Z`))}`}>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
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
      </Seccion>
    </div>
  );
}
