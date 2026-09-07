import Link from "next/link";
import type { Metadata } from "next";
import BotonAnularFila from "@/components/BotonAnularFila";
import BotonPagarCompra from "@/components/BotonPagarCompra";
import {
  agruparPorEstado,
  agruparPorMedio,
  agruparPorMes,
  agruparPorProducto,
  agruparPorProveedor,
  historialDeCompras,
  totalDesglosado,
  type CompraDelHistorial,
  type GrupoDeCompras,
} from "@/lib/compras";
import { fechaCorta, fechaLarga, hoyLocal } from "@/lib/fechas";
import { formatearContenido, MEDIO_CORTO } from "@/lib/negocio";
import { formatearCentavos } from "@/lib/plata";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Compras — El Osito" };

const CORTES = [
  { clave: "fecha", etiqueta: "Por fecha" },
  { clave: "proveedor", etiqueta: "Por proveedor" },
  { clave: "producto", etiqueta: "Por producto" },
  { clave: "mes", etiqueta: "Por mes" },
  { clave: "estado", etiqueta: "Por estado" },
  { clave: "medio", etiqueta: "Por medio" },
] as const;

type Corte = (typeof CORTES)[number]["clave"];

const PERIODOS = [
  { clave: "mes", etiqueta: "Este mes", meses: 0 },
  { clave: "3meses", etiqueta: "3 meses", meses: 2 },
  { clave: "ano", etiqueta: "12 meses", meses: 11 },
  { clave: "todo", etiqueta: "Todo", meses: null },
] as const;

type Periodo = (typeof PERIODOS)[number]["clave"];

const MES_LARGO = new Intl.DateTimeFormat("es-AR", {
  month: "long",
  year: "numeric",
});

/** "2026-09" → "septiembre de 2026" */
function nombreDeMes(clave: string): string {
  return MES_LARGO.format(new Date(`${clave}-01T12:00:00Z`));
}

/** El primer día del mes que arranca el período elegido. */
function desdeDelPeriodo(periodo: Periodo, hoy: string): string | undefined {
  const meses = PERIODOS.find((p) => p.clave === periodo)?.meses;
  if (meses == null) return undefined;
  const [anio, mes] = hoy.split("-").map(Number);
  const inicio = new Date(Date.UTC(anio, mes - 1 - meses, 1));
  return inicio.toISOString().slice(0, 10);
}

function enlace(corte: Corte, periodo: Periodo, impagas: boolean): string {
  const params = new URLSearchParams();
  if (corte !== "fecha") params.set("por", corte);
  if (periodo !== "3meses") params.set("periodo", periodo);
  if (impagas) params.set("impagas", "1");
  const query = params.toString();
  return query ? `/compras?${query}` : "/compras";
}

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

/** Una compra, con sus renglones adentro de un desplegable. */
function Compra({ compra }: { compra: CompraDelHistorial }) {
  return (
    <details className="group py-2">
      <summary className="cursor-pointer list-none">
        <span className="flex items-center justify-between gap-3">
          <span className="min-w-0">
            <span className="block truncate text-sm">{compra.proveedor}</span>
            <span className="text-xs text-tinta-suave">
              {fechaCorta(compra.fecha)}
              {compra.pagadoEn
                ? compra.pagadoEn === compra.fecha
                  ? " · pagada"
                  : ` · pagada el ${fechaCorta(compra.pagadoEn)}`
                : " · sin pagar"}
              {compra.medio && ` · ${MEDIO_CORTO[compra.medio]}`}
              {compra.comprobante && ` · N.º ${compra.comprobante}`}
              {compra.faltanPrecios && (
                <span className="text-deuda"> · faltan precios</span>
              )}
            </span>
          </span>
          <span
            className={
              "cifra shrink-0 text-sm font-medium " +
              (compra.pagadoEn ? "text-tinta" : "text-deuda")
            }
          >
            {formatearCentavos(compra.montoCentavos)}
          </span>
        </span>
      </summary>

      <div className="mt-2 border-l border-linea pl-3">
        {compra.renglones.length === 0 ? (
          <p className="text-xs text-tinta-suave">
            Se cargó sólo el total, sin detalle de qué vino.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {compra.renglones.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-baseline gap-x-2 text-xs text-tinta-suave"
              >
                <span className="text-tinta">{r.descripcion || "sin nombre"}</span>
                <span className="cifra">
                  {r.cantidad} × {formatearContenido(r.unidadesPorBulto, r.unidad)}
                </span>
                {r.importeCentavos != null && (
                  <span className="cifra">
                    {formatearCentavos(r.importeCentavos)}
                  </span>
                )}
                {r.costoCentavos != null && (
                  <span className="cifra text-tinta">
                    {formatearCentavos(r.costoCentavos)} {r.porCada}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}

        {compra.nota && (
          <p className="mt-1 text-xs text-tinta-suave">{compra.nota}</p>
        )}

        <div className="mt-2 flex items-center gap-3">
          <BotonPagarCompra
            id={compra.id}
            pagadoEn={compra.pagadoEn}
            hoy={hoyLocal()}
          />
          <BotonAnularFila que="compra" id={compra.id} />
        </div>
      </div>
    </details>
  );
}

function Grupo({ grupo, titulo }: { grupo: GrupoDeCompras; titulo: string }) {
  return (
    <section className="rounded-2xl border border-linea bg-white/60 px-4 py-3.5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="min-w-0 truncate font-display text-xl leading-none">
          {titulo}
        </h2>
        <span className="cifra shrink-0 text-sm font-medium">
          {formatearCentavos(grupo.totalCentavos)}
        </span>
      </div>
      <p className="mt-1 text-xs text-tinta-suave">
        {grupo.detalle}
        {grupo.impagoCentavos > 0 && (
          <span className="text-deuda">
            {" · "}
            {formatearCentavos(grupo.impagoCentavos)} sin pagar
          </span>
        )}
        {grupo.faltanPrecios && (
          <span className="text-deuda"> · con precios sin poner</span>
        )}
      </p>
      <div className="mt-2 divide-y divide-linea border-t border-linea">
        {grupo.compras.map((compra) => (
          <Compra key={compra.id} compra={compra} />
        ))}
      </div>
    </section>
  );
}

export default async function Compras({ searchParams }: PageProps<"/compras">) {
  const params = await searchParams;
  const leer = (clave: string) => {
    const valor = params[clave];
    return Array.isArray(valor) ? valor[0] : valor;
  };

  const pedido = leer("por");
  const corte: Corte = CORTES.some((c) => c.clave === pedido)
    ? (pedido as Corte)
    : "fecha";

  const pedidoPeriodo = leer("periodo");
  const periodo: Periodo = PERIODOS.some((p) => p.clave === pedidoPeriodo)
    ? (pedidoPeriodo as Periodo)
    : "3meses";

  const soloImpagas = leer("impagas") === "1";

  const hoy = hoyLocal();
  const lista = await historialDeCompras({
    desde: desdeDelPeriodo(periodo, hoy),
    soloImpagas,
  });

  const total = lista.reduce((t, c) => t + c.montoCentavos, 0);
  const impago = lista.reduce(
    (t, c) => t + (c.pagadoEn ? 0 : c.montoCentavos),
    0,
  );

  const porProducto = corte === "producto" ? agruparPorProducto(lista) : [];
  const desglosado = corte === "producto" ? totalDesglosado(lista) : 0;

  const grupos: { titulo: string; grupo: GrupoDeCompras }[] =
    corte === "proveedor"
      ? agruparPorProveedor(lista).map((g) => ({ titulo: g.titulo, grupo: g }))
      : corte === "mes"
        ? agruparPorMes(lista).map((g) => ({
            titulo: nombreDeMes(g.clave),
            grupo: g,
          }))
        : corte === "estado"
          ? agruparPorEstado(lista).map((g) => ({ titulo: g.titulo, grupo: g }))
          : corte === "medio"
            ? agruparPorMedio(lista).map((g) => ({ titulo: g.titulo, grupo: g }))
            : [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-display text-3xl leading-none">Compras</h1>
        <p className="mt-1 text-sm text-tinta-suave">
          Todo lo que entró de mercadería. Tocá una compra para ver qué vino y a
          cuánto.
        </p>
      </div>

      <section className="rounded-2xl border border-linea bg-papel-hondo px-5 py-5">
        <p className="text-xs uppercase tracking-[0.18em] text-tinta-suave">
          {soloImpagas ? "Sin pagar" : "Comprado en el período"}
        </p>
        <p className="cifra mt-1 text-3xl font-medium sm:text-4xl">
          {formatearCentavos(total)}
        </p>
        <p className="mt-1 text-sm text-tinta-suave">
          {lista.length === 0
            ? "No hay compras en este período."
            : `${lista.length === 1 ? "1 compra" : lista.length + " compras"}`}
          {!soloImpagas && impago > 0 && (
            <span className="text-deuda">
              {" · "}
              {formatearCentavos(impago)} todavía sin pagar
            </span>
          )}
        </p>
      </section>

      {/* Los cortes viven en la URL: se puede compartir el link de "lo que le
          compré a Coca-Cola este año" y el server lo arma sin estado de nadie. */}
      <div className="-mx-4 space-y-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
        <div className="flex gap-2">
          {CORTES.map((c) => (
            <Chip
              key={c.clave}
              href={enlace(c.clave, periodo, soloImpagas)}
              activo={c.clave === corte}
            >
              {c.etiqueta}
            </Chip>
          ))}
        </div>
        <div className="flex gap-2">
          {PERIODOS.map((p) => (
            <Chip
              key={p.clave}
              href={enlace(corte, p.clave, soloImpagas)}
              activo={p.clave === periodo}
            >
              {p.etiqueta}
            </Chip>
          ))}
          <Chip
            href={enlace(corte, periodo, !soloImpagas)}
            activo={soloImpagas}
          >
            Sólo sin pagar
          </Chip>
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
      ) : corte === "fecha" ? (
        <section className="rounded-2xl border border-linea bg-white/60 px-4 py-3.5">
          <div className="divide-y divide-linea">
            {lista.map((compra) => (
              <Compra key={compra.id} compra={compra} />
            ))}
          </div>
        </section>
      ) : corte === "producto" ? (
        <>
          {/*
            Acá se agrupan renglones y no compras, así que la suma de los grupos
            NO da el total de arriba. Decirlo es la diferencia entre una pantalla
            que se entiende y una que parece tener un error de cuentas.
          */}
          <p className="rounded-xl bg-papel-hondo px-3 py-2 text-xs text-tinta-suave">
            Este corte suma renglones, no facturas. De{" "}
            <span className="cifra">{formatearCentavos(total)}</span> comprados,{" "}
            <span className="cifra">{formatearCentavos(desglosado)}</span> están
            detallados por producto; el resto entró como total de factura sin
            desglose.
          </p>

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
                    {p.variacion}% desde la primera del período
                  </span>
                )}
              </p>

              <ul className="mt-2 divide-y divide-linea border-t border-linea">
                {p.compras.map((c, i) => (
                  <li
                    key={c.compraId + i}
                    className="flex flex-wrap items-baseline justify-between gap-x-3 py-1.5 text-xs"
                  >
                    <span className="text-tinta-suave">
                      {fechaCorta(c.fecha)} · {c.proveedor}
                    </span>
                    <span className="flex items-baseline gap-3">
                      {c.costoCentavos != null && (
                        <span className="cifra text-tinta">
                          {formatearCentavos(c.costoCentavos)} {c.porCada}
                        </span>
                      )}
                      <span className="cifra text-tinta-suave">
                        {c.importeCentavos != null
                          ? formatearCentavos(c.importeCentavos)
                          : "sin importe"}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </>
      ) : (
        grupos.map(({ titulo, grupo }) => (
          <Grupo key={grupo.clave} grupo={grupo} titulo={titulo} />
        ))
      )}

      {lista.length > 0 && (
        <p className="text-xs text-tinta-suave">
          Desde el {fechaLarga(lista[lista.length - 1].fecha)}.
        </p>
      )}
    </div>
  );
}
