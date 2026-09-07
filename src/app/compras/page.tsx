import Link from "next/link";
import type { Metadata } from "next";
import BotonCompra from "@/components/BotonCompra";
import SelectorMes from "@/components/SelectorMes";
import { listarProveedores } from "@/lib/caja";
import {
  agruparPorFecha,
  agruparPorMedio,
  agruparPorProducto,
  agruparPorProveedor,
  historialDeCompras,
  rangoDelMes,
  totalDesglosado,
} from "@/lib/compras";
import { fechaLarga, hoyLocal } from "@/lib/fechas";
import { formatearCentavos } from "@/lib/plata";
import { listarNombresDeProductos } from "@/lib/stock";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Compras — El Osito" };

const CORTES = [
  { clave: "proveedor", etiqueta: "Proveedores" },
  { clave: "fecha", etiqueta: "Días" },
  { clave: "producto", etiqueta: "Productos" },
  { clave: "medio", etiqueta: "Medios" },
] as const;

type Corte = (typeof CORTES)[number]["clave"];

const MES = /^\d{4}-\d{2}$/;

function Chip({
  href,
  activo,
  children,
}: {
  href: string;
  activo: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={
        "shrink-0 rounded-full border px-3 py-1.5 text-xs " +
        (activo
          ? "border-acento bg-acento text-white"
          : "border-linea bg-white/70 text-tinta")
      }
    >
      {children}
    </Link>
  );
}

/** Una tarjeta que lleva a otro nivel: proveedor o día. */
function Puerta({
  href,
  titulo,
  detalle,
  monto,
  impago,
  aviso,
}: {
  href: string;
  titulo: string;
  detalle: string;
  monto: number;
  impago: number;
  aviso?: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-2xl border border-linea bg-white/60 px-4 py-3.5 transition-colors hover:bg-white"
    >
      <span className="min-w-0">
        <span className="block truncate font-display text-xl leading-none">
          {titulo}
        </span>
        <span className="mt-1 block text-xs text-tinta-suave">
          {detalle}
          {impago > 0 && (
            <span className="text-deuda">
              {" · "}
              {formatearCentavos(impago)} sin pagar
            </span>
          )}
          {aviso && <span className="text-deuda"> · faltan precios</span>}
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="cifra text-sm font-medium">
          {formatearCentavos(monto)}
        </span>
        <span aria-hidden="true" className="text-tinta-suave">
          ›
        </span>
      </span>
    </Link>
  );
}

export default async function Compras({ searchParams }: PageProps<"/compras">) {
  const params = await searchParams;
  const leer = (clave: string) => {
    const valor = params[clave];
    return Array.isArray(valor) ? valor[0] : valor;
  };

  const hoy = hoyLocal();
  const mesActual = hoy.slice(0, 7);
  const pedidoMes = leer("mes");
  const mes = pedidoMes && MES.test(pedidoMes) ? pedidoMes : mesActual;

  const pedido = leer("por");
  const corte: Corte = CORTES.some((c) => c.clave === pedido)
    ? (pedido as Corte)
    : "proveedor";

  const { desde, hasta } = rangoDelMes(mes);
  const [lista, proveedores, productos] = await Promise.all([
    historialDeCompras({ desde, hasta }),
    listarProveedores(),
    listarNombresDeProductos(),
  ]);

  const total = lista.reduce((t, c) => t + c.montoCentavos, 0);
  const impago = lista.reduce(
    (t, c) => t + (c.pagadoEn ? 0 : c.montoCentavos),
    0,
  );

  const enlace = (c: Corte) =>
    `/compras?mes=${mes}${c === "proveedor" ? "" : `&por=${c}`}`;

  const porProducto = corte === "producto" ? agruparPorProducto(lista) : [];
  const desglosado = corte === "producto" ? totalDesglosado(lista) : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-display text-3xl leading-none">Compras</h1>
        <SelectorMes
          mes={mes}
          base="/compras"
          tope={mesActual}
          extra={corte === "proveedor" ? undefined : { por: corte }}
        />
      </div>

      <section className="rounded-2xl border border-linea bg-papel-hondo px-5 py-5">
        <p className="text-xs uppercase tracking-[0.18em] text-tinta-suave">
          Comprado en el mes
        </p>
        <p className="cifra mt-1 text-3xl font-medium sm:text-4xl">
          {formatearCentavos(total)}
        </p>
        <p className="mt-1 text-sm text-tinta-suave">
          {lista.length === 0
            ? "No entró mercadería este mes."
            : lista.length === 1
              ? "1 compra"
              : `${lista.length} compras`}
          {impago > 0 && (
            <span className="text-deuda">
              {" · "}
              {formatearCentavos(impago)} todavía sin pagar
            </span>
          )}
        </p>
      </section>

      <BotonCompra fecha={hoy} proveedores={proveedores} productos={productos} />

      <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-2">
          {CORTES.map((c) => (
            <Chip key={c.clave} href={enlace(c.clave)} activo={c.clave === corte}>
              {c.etiqueta}
            </Chip>
          ))}
        </div>
      </div>

      {lista.length === 0 ? (
        <p className="text-sm text-tinta-suave">
          Las compras se cargan desde{" "}
          <Link href="/caja" className="underline underline-offset-4">
            la caja del día
          </Link>
          .
        </p>
      ) : corte === "proveedor" ? (
        /* El nivel de arriba: a quién le compré este mes. Cada uno abre su
           ficha, con sus productos y su historial. */
        <div className="space-y-3">
          {agruparPorProveedor(lista).map((g) => (
            <Puerta
              key={g.clave}
              href={`/compras/proveedor/${g.clave}?mes=${mes}`}
              titulo={g.titulo}
              detalle={g.detalle}
              monto={g.totalCentavos}
              impago={g.impagoCentavos}
              aviso={g.faltanPrecios}
            />
          ))}
        </div>
      ) : corte === "fecha" ? (
        <div className="space-y-3">
          {agruparPorFecha(lista).map((g) => (
            <Puerta
              key={g.clave}
              href={`/compras/dia/${g.clave}`}
              titulo={fechaLarga(g.clave)}
              detalle={g.detalle}
              monto={g.totalCentavos}
              impago={g.impagoCentavos}
              aviso={g.faltanPrecios}
            />
          ))}
        </div>
      ) : corte === "medio" ? (
        <div className="space-y-3">
          {agruparPorMedio(lista).map((g) => (
            <section
              key={g.clave}
              className="rounded-2xl border border-linea bg-white/60 px-4 py-3.5"
            >
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="font-display text-xl leading-none">{g.titulo}</h2>
                <span className="cifra text-sm font-medium">
                  {formatearCentavos(g.totalCentavos)}
                </span>
              </div>
              <p className="mt-1 text-xs text-tinta-suave">{g.detalle}</p>
            </section>
          ))}
        </div>
      ) : (
        <>
          {/*
            Acá se agrupan renglones y no facturas, así que la suma de los
            grupos NO da el total de arriba. Decirlo es la diferencia entre una
            pantalla que se entiende y una que parece tener un error de cuentas.
          */}
          <p className="rounded-xl bg-papel-hondo px-3 py-2 text-xs text-tinta-suave">
            Este corte suma renglones, no facturas. De{" "}
            <span className="cifra">{formatearCentavos(total)}</span> comprados,{" "}
            <span className="cifra">{formatearCentavos(desglosado)}</span> están
            detallados por producto; el resto entró como total de factura sin
            desglose.
          </p>

          <div className="space-y-3">
            {porProducto.map((p) => (
              <section
                key={p.clave}
                className="rounded-2xl border border-linea bg-white/60 px-4 py-3.5"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="min-w-0 truncate font-display text-xl leading-none">
                    {p.nombre}
                  </h2>
                  <span className="cifra shrink-0 text-sm font-medium">
                    {formatearCentavos(p.totalCentavos)}
                  </span>
                </div>
                <p className="mt-1 text-xs text-tinta-suave">
                  {p.veces === 1 ? "1 compra" : `${p.veces} compras`}
                  {p.ultimoCosto?.costoCentavos != null && (
                    <>
                      {" · última a "}
                      <span className="cifra text-tinta">
                        {formatearCentavos(p.ultimoCosto.costoCentavos)}
                      </span>{" "}
                      {p.ultimoCosto.porCada}
                    </>
                  )}
                  {p.variacion != null && p.variacion !== 0 && (
                    <span className={p.variacion > 0 ? "text-deuda" : "text-pago"}>
                      {" · "}
                      {p.variacion > 0 ? "+" : ""}
                      {p.variacion}% en el mes
                    </span>
                  )}
                </p>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
