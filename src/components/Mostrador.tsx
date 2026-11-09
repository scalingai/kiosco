"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  altaPorCodigo,
  cobrarConQr,
  editarProducto,
  guardarVenta,
  identificarCodigo,
  soltarCobroQr,
} from "@/app/acciones";
import type { CandidatoEan, Parecido } from "@/lib/buscar-ean";
import SelectorNombre from "@/components/SelectorNombre";
import RepartoDePago, {
  mediosUsados,
  montoDe,
  montosVacios,
  sumarMontos,
  type MontosPorMedio,
} from "@/components/RepartoDePago";
import {
  agregar,
  cambiarCantidad,
  conRecargo,
  gananciaDelCarrito,
  sacar,
  totalDelCarrito,
  unidadesDelCarrito,
  type RenglonCarrito,
} from "@/lib/carrito";
import { AVISO_TARDANZA, conLimiteDeTiempo } from "@/lib/espera";
import { normalizarNombre } from "@/lib/nombres";
import { repartirPago, type MedioPago } from "@/lib/negocio";
import { formatearCentavos, parsearMonto } from "@/lib/plata";
import { pareceCodigoDeBarras } from "@/lib/codigos";
import type { ProductoVendible } from "@/lib/stock";

/** Cuántas sugerencias se dibujan mientras se escribe. */
const MAXIMO = 8;

/**
 * Lo máximo que puede valer UN renglón cobrado como monto suelto: $1.000.000.
 *
 * No es el tope de la venta ni del carrito, es el de un renglón solo. Está
 * holgado a propósito —un cartón de cigarrillos no llega ni cerca— porque su
 * trabajo no es ajustar el precio sino cortar lo absurdo.
 */
const TOPE_SUELTO = 100_000_000;

function IconoQr() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5 shrink-0"
      aria-hidden="true"
    >
      <rect x="3.5" y="3.5" width="6" height="6" rx="1" />
      <rect x="14.5" y="3.5" width="6" height="6" rx="1" />
      <rect x="3.5" y="14.5" width="6" height="6" rx="1" />
      <path d="M14.5 14.5h3v3h-3zM20.5 14.5v3M17.5 20.5h3" />
    </svg>
  );
}

/**
 * La foto del envase, o un cuadrito con la inicial.
 *
 * El hueco se dibuja SIEMPRE, con foto o sin ella: si apareciera sólo cuando
 * hay imagen, las filas se correrían de a una y la lista dejaría de ser una
 * columna que se puede barrer con la vista, que es justo para lo que sirve.
 *
 * Va con `<img>` y no con el `<Image>` de Next porque son URLs de la CDN del
 * supermercado de donde salió cada producto: optimizarlas obligaría a declarar
 * esos dominios y a proxear fotos ajenas por nuestro servidor.
 */
function Miniatura({
  producto,
}: {
  producto: { nombre: string; imagenUrl?: string | null };
}) {
  if (!producto.imagenUrl) {
    return (
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-papel-hondo text-sm font-medium text-tinta-suave">
        {producto.nombre.trim().charAt(0).toUpperCase() || "?"}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={producto.imagenUrl}
      alt=""
      loading="lazy"
      className="h-10 w-10 shrink-0 rounded-lg bg-white object-contain"
    />
  );
}

/**
 * El mostrador: cobrar una venta producto por producto.
 *
 * Está pensado para una mano sola y un lector de códigos. El lector escribe los
 * dígitos como si fuera un teclado y termina con Enter, así que el campo de
 * arriba hace las dos cosas sin que haya que elegir un modo: si lo que entró es
 * un código que existe, el producto entra al carrito y el campo se limpia solo;
 * si es texto, busca por nombre.
 *
 * El catálogo entero viaja al navegador (ver `listarParaVender`). Escanear
 * resuelve en el acto, sin pedirle nada al servidor, y sigue andando con el
 * wifi caído. En un mostrador eso es la diferencia entre cobrar y esperar.
 */
export default function Mostrador({
  fecha,
  productos,
  clientes,
  sucursalConQr,
  alGuardar,
}: {
  fecha: string;
  productos: ProductoVendible[];
  /** para poder poner la venta a nombre de alguien que ya existe */
  clientes: { id: string; nombre: string }[];
  /**
   * La sucursal con el QR listo, si hay alguna. Sin esto no se ofrece cobrar
   * así: un botón que lleva a "no está conectado" se aprieta con el cliente
   * esperando y es peor que no tenerlo.
   */
  sucursalConQr: { id: string; nombre: string } | null;
  alGuardar?: () => void;
}) {
  const router = useRouter();
  const [renglones, setRenglones] = useState<RenglonCarrito[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [montos, setMontos] = useState<MontosPorMedio>(montosVacios());
  const [cliente, setCliente] = useState("");
  const [clienteId, setClienteId] = useState<string | null>(null);
  const [telefono, setTelefono] = useState("");
  /*
   * Lo tecleado en los precios que faltan, mientras se teclea. Va aparte del
   * carrito porque un precio a medio escribir ("1" camino a "1200") no es un
   * precio: metido en el renglón, el primer dígito ya valdría un peso y la
   * fila dejaría de pedir el número justo cuando se estaba poniendo.
   *
   * La llave es la misma con la que el carrito junta renglones iguales, así
   * que sigue al producto aunque se muevan las filas.
   */
  const [precios, setPrecios] = useState<Record<string, string>>({});
  /*
   * Si esta venta se cobra con algo que no es efectivo. Es UNA decisión para
   * todo el carrito y no una por renglón, porque así se pregunta en el
   * mostrador: "¿efectivo o tarjeta?" antes de cantar el total.
   *
   * No sale del reparto de medios de abajo: ese se completa DESPUÉS de decir
   * el precio, y si el recargo dependiera de él, el total cambiaría mientras
   * el cliente ya está pagando.
   */
  const [conTarjeta, setConTarjeta] = useState(false);
  /** la venta que quedó esperando que el cliente escanee */
  const [esperando, setEsperando] = useState<{
    ventaId: string;
    total: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  /** un código que se escaneó y no es de ningún producto todavía */
  const [codigoHuerfano, setCodigoHuerfano] = useState<string | null>(null);
  /** qué dice el catálogo del supermercado que es ese código */
  const [candidato, setCandidato] = useState<CandidatoEan | null>(null);
  /** lo que YA está en el catálogo y podría ser lo mismo, sin el código */
  const [parecidos, setParecidos] = useState<Parecido[]>([]);
  const [buscandoCodigo, setBuscandoCodigo] = useState(false);
  const [guardandoCodigo, setGuardandoCodigo] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  const total = totalDelCarrito(renglones);
  const unidades = unidadesDelCarrito(renglones);
  const ganancia = gananciaDelCarrito(renglones);
  const sinPrecio = renglones.filter((r) => r.precioUnitarioCentavos <= 0).length;

  /** El código de barras es la llave más rápida: se arma una sola vez. */
  const porCodigo = useMemo(() => {
    const mapa = new Map<string, ProductoVendible>();
    for (const p of productos) if (p.codigoBarras) mapa.set(p.codigoBarras, p);
    return mapa;
  }, [productos]);

  /*
   * Busca por PALABRAS sueltas, no por la frase entera: quien atiende escribe
   * "coca 600" y el producto se llama "Coca-Cola común 600 ml". Pidiendo que
   * el texto aparezca de corrido, esa búsqueda —la natural— no encuentra nada,
   * porque entre "coca" y "600" hay dos palabras más.
   *
   * Tienen que estar TODAS las palabras: cada una que se agrega achica la
   * lista, que es lo que uno espera al seguir escribiendo.
   */
  const sugerencias = useMemo(() => {
    const palabras = normalizarNombre(busqueda).split(" ").filter(Boolean);
    if (!palabras.length) return [];

    const puntuadas: { p: ProductoVendible; puntaje: number }[] = [];
    for (const p of productos) {
      const nombre = normalizarNombre(p.nombre);
      const marca = normalizarNombre(p.marca ?? "");
      const donde = marca ? nombre + " " + marca : nombre;
      if (!palabras.every((palabra) => donde.includes(palabra))) continue;
      // Lo que empieza con lo escrito va primero: es lo más probable.
      puntuadas.push({ p, puntaje: nombre.startsWith(palabras[0]) ? 0 : 1 });
    }

    puntuadas.sort(
      (a, b) => a.puntaje - b.puntaje || a.p.nombre.localeCompare(b.p.nombre),
    );
    return puntuadas.slice(0, MAXIMO).map((x) => x.p);
  }, [productos, busqueda]);

  function meter(producto: ProductoVendible) {
    setRenglones((previo) =>
      agregar(previo, {
        productoId: producto.id,
        descripcion: producto.nombre,
        imagenUrl: producto.imagenUrl,
        precioBaseCentavos: producto.precioVentaCentavos ?? 0,
        recargoMilesimas: producto.recargoMilesimas,
        cantidad: 1,
        // Sin precio cargado entra en cero y la fila pide el número. Frenar la
        // venta porque falta un precio sería dejar de cobrar por un dato que se
        // puede poner en el momento.
        //
        // Si ya se eligió "con tarjeta", el producto entra con el recargo
        // puesto: sumarlo recién al final haría que el precio que se le cantó
        // al cliente no sea el que termina pagando.
        precioUnitarioCentavos: conTarjeta
          ? conRecargo(
              producto.precioVentaCentavos ?? 0,
              producto.recargoMilesimas,
            )
          : (producto.precioVentaCentavos ?? 0),
        costoUnitarioCentavos: producto.costoRealCentavos,
      }),
    );
    setBusqueda("");
    setError(null);
    campo.current?.focus();
  }

  /** Algo que no está en el catálogo: entra con su precio y sin nombre de ficha. */
  function meterSuelto(texto: string) {
    const centavos = parsearMonto(texto);
    if (centavos == null || centavos <= 0) return false;

    /*
     * Un renglón de kiosco no llega al millón de pesos. Un número así no es un
     * precio: es un código mal leído, o un cero de más. El tope es la segunda
     * red —la primera es `pareceCodigoDeBarras` de arriba— y está acá porque
     * cobrar de más no se deshace solo: hay que anular la venta.
     */
    if (centavos > TOPE_SUELTO) {
      setError(
        `${formatearCentavos(centavos)} es demasiado para un renglón. Si es un código de barras, el producto todavía no lo tiene cargado.`,
      );
      return true;
    }
    setRenglones((previo) =>
      agregar(previo, {
        productoId: null,
        descripcion: "Varios",
        cantidad: 1,
        precioUnitarioCentavos: centavos,
        costoUnitarioCentavos: null,
      }),
    );
    setBusqueda("");
    setError(null);
    campo.current?.focus();
    return true;
  }

  function alTeclear(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();

    const texto = busqueda.trim();
    if (!texto) return;

    // 1) Un código que existe entra derecho: es el camino del lector y tiene
    //    que ganarle a cualquier otra interpretación.
    const porEscaneo = porCodigo.get(texto.replace(/\D/g, ""));
    if (porEscaneo) return void meter(porEscaneo);

    /*
     * 2) Un escaneo que no encontró producto TERMINA ACÁ.
     *
     * Antes seguía de largo hasta el monto suelto, y ese era el peor bug que
     * tuvo el mostrador: de los productos con precio cargado, la mayoría no
     * tiene código todavía. Escanear uno de ésos no fallaba — cobraba el
     * código COMO SI FUERA EL PRECIO, y metía un renglón "Varios" de miles de
     * millones de pesos sin que nada avisara.
     *
     * Tampoco se pasa a la búsqueda por nombre: trece dígitos no son el nombre
     * de nada, y si por casualidad matchearan algo, agregaría un producto que
     * nadie pidió.
     */
    if (pareceCodigoDeBarras(texto)) {
      olvidarCodigo();
      setCodigoHuerfano(texto);
      setError(null);
      setBusqueda("");
      void preguntarQueEs(texto);
      return;
    }

    // 3) Si hay coincidencia por nombre, la primera.
    if (sugerencias.length) return void meter(sugerencias[0]);

    // 4) Lo que no está cargado se cobra como monto suelto.
    if (meterSuelto(texto)) return;

    setError(
      `No encontré "${texto}". Si es un precio suelto, escribí sólo el número.`,
    );
  }

  /**
   * Le pregunta a los catálogos de los supermercados qué producto es ese
   * código. Es sólo una consulta: no da de alta nada hasta que alguien
   * confirme.
   */
  async function preguntarQueEs(codigo: string) {
    setBuscandoCodigo(true);
    const r = await identificarCodigo(codigo);
    setBuscandoCodigo(false);
    if (!r.ok) return;
    // Si mientras tanto se escaneó otra cosa, esta respuesta ya no sirve.
    if (r.datos.candidato && r.datos.candidato.codigo !== codigo) return;
    setCandidato(r.datos.candidato);
    setParecidos(r.datos.parecidos);
  }

  /** "Es este": lo da de alta con el código pegado y lo mete al carrito. */
  async function altaDelCandidato() {
    if (!candidato) return;

    setGuardandoCodigo(true);
    const r = await altaPorCodigo(candidato);
    setGuardandoCodigo(false);
    if (!r.ok) return setError(r.error);

    // Entra a la venta sin precio: el renglón lo pide. Frenar el cobro para ir
    // a cargar un precio es perder la venta por un dato que se pone acá mismo.
    meter({
      id: r.datos.id,
      nombre: candidato.nombre,
      marca: candidato.marca,
      codigoBarras: candidato.codigo,
      imagenUrl: candidato.imagenUrl,
      precioVentaCentavos: null,
      costoRealCentavos: null,
      multiplicadorMilesimas: null,
      recargoMilesimas: null,
    });

    olvidarCodigo();
    router.refresh();
  }

  /** Le pega el código escaneado a un producto que YA está en el catálogo. */
  async function adoptarCodigo(producto: ProductoVendible) {
    const codigo = codigoHuerfano;
    if (!codigo) return;

    setGuardandoCodigo(true);
    const r = await editarProducto(producto.id, { codigoBarras: codigo });
    setGuardandoCodigo(false);
    if (!r.ok) return setError(r.error);

    olvidarCodigo();
    meter(producto);
    router.refresh();
  }

  /** Lo mismo, desde la lista de parecidos, que sólo trae el id. */
  async function adoptarPorId(id: string) {
    const producto = productos.find((p) => p.id === id);
    if (producto) return adoptarCodigo(producto);
    // No debería pasar: los parecidos salen del mismo catálogo que `productos`.
    setError("Ese producto ya no está en la lista. Recargá la pantalla.");
  }

  function olvidarCodigo() {
    setCodigoHuerfano(null);
    setCandidato(null);
    setParecidos([]);
  }

  /**
   * Cambia la forma de pago y vuelve a poner los precios de todo el carrito.
   *
   * Se reescribe `precioUnitarioCentavos` en vez de calcularlo al mostrar
   * porque ESE es el número que se guarda: la venta tiene que quedar diciendo
   * lo que de verdad se cobró, no el precio de lista más una regla que hay que
   * volver a aplicar para entenderla.
   */
  function cambiarFormaDePago(tarjeta: boolean) {
    setConTarjeta(tarjeta);
    setRenglones((previo) =>
      previo.map((r) => {
        // El monto suelto y el precio puesto a mano no tienen lista: lo que se
        // tecleó es lo que se cobra, con tarjeta o sin ella.
        if (r.precioBaseCentavos == null) return r;
        return {
          ...r,
          precioUnitarioCentavos: tarjeta
            ? conRecargo(r.precioBaseCentavos, r.recargoMilesimas)
            : r.precioBaseCentavos,
        };
      }),
    );
  }

  /** Cuántos renglones del carrito cambian de precio con la tarjeta. */
  const conRecargoEncima = renglones.filter(
    (r) =>
      r.precioBaseCentavos != null &&
      conRecargo(r.precioBaseCentavos, r.recargoMilesimas) >
        r.precioBaseCentavos,
  ).length;

  /** La identidad de un renglón: la misma con la que el carrito deduplica. */
  function llaveDe(renglon: RenglonCarrito): string {
    return renglon.productoId ?? "suelto:" + renglon.descripcion;
  }

  function ponerPrecio(renglon: RenglonCarrito, texto: string) {
    const llave = llaveDe(renglon);
    setPrecios((previo) => ({ ...previo, [llave]: texto }));

    const centavos = texto.trim() ? (parsearMonto(texto) ?? 0) : 0;
    setRenglones((previo) =>
      previo.map((r) =>
        llaveDe(r) === llave ? { ...r, precioUnitarioCentavos: centavos } : r,
      ),
    );
  }

  async function cobrar() {
    setError(null);

    if (!renglones.length) {
      setError("El carrito está vacío.");
      return;
    }
    if (sinPrecio) {
      setError(
        sinPrecio === 1
          ? "Hay un producto sin precio."
          : `Hay ${sinPrecio} productos sin precio.`,
      );
      return;
    }

    /*
     * Con qué pagó sale de lo escrito en los tres campos, sin ningún modo que
     * declarar: uno solo con plata es un pago simple, dos o tres es un reparto,
     * y ninguno es todo en efectivo (lo más común en el mostrador, y por eso el
     * default).
     */
    const usados = mediosUsados(montos);
    let medio: MedioPago = usados[0] ?? "efectivo";
    let reparto;

    if (usados.length) {
      if (sumarMontos(montos) !== total) {
        setError(
          `Los medios suman ${formatearCentavos(sumarMontos(montos))} y la ` +
            `venta es ${formatearCentavos(total)}. Tienen que dar lo mismo.`,
        );
        return;
      }
      if (usados.length > 1) {
        medio = usados.reduce((mayor, m) =>
          montoDe(montos, m) > montoDe(montos, mayor) ? m : mayor,
        );
        try {
          reparto =
            repartirPago(
              usados.map((m) => ({
                medio: m,
                importeCentavos: montoDe(montos, m),
              })),
              total,
            ) ?? undefined;
        } catch (problema) {
          setError(
            problema instanceof Error ? problema.message : "Revisá el reparto.",
          );
          return;
        }
      }
    }

    setGuardando(true);
    const espera = await conLimiteDeTiempo(
      guardarVenta({
        // Sin monto: lo dice el carrito. Mandarlo calculado desde acá sería que
        // la pantalla y el servidor puedan discrepar sobre el mismo total.
        fecha,
        medio,
        items: renglones,
        pagos: reparto,
        clienteId,
        // Sólo si es alguien nuevo: con el id ya elegido, mandar el nombre
        // haría que el servidor lo busque de nuevo por texto.
        nombreCliente: clienteId ? null : cliente.trim() || null,
        telefonoCliente: clienteId ? null : telefono.trim() || null,
      }),
    );
    setGuardando(false);

    if (espera.venció) {
      setError(AVISO_TARDANZA);
      return;
    }
    if (!espera.valor.ok) {
      setError(espera.valor.error);
      return;
    }

    setRenglones([]);
    setPrecios({});
    setMontos(montosVacios());
    setBusqueda("");
    setConTarjeta(false);
    setCliente("");
    setClienteId(null);
    setTelefono("");
    router.refresh();
    alGuardar?.();
  }

  /**
   * Cobra poniéndole el monto al QR impreso del mostrador.
   *
   * La venta se anota pendiente ANTES de hablar con Mercado Pago: si la API no
   * contesta, lo que no se puede perder es la venta. Queda ahí, se ve, y se
   * cobra por otro medio sin volver a cargar el carrito.
   */
  async function cobrarQr() {
    setError(null);

    if (!sucursalConQr) return;
    if (!renglones.length) {
      setError("El carrito está vacío.");
      return;
    }
    if (sinPrecio) {
      setError(
        sinPrecio === 1
          ? "Hay un producto sin precio."
          : `Hay ${sinPrecio} productos sin precio.`,
      );
      return;
    }

    setGuardando(true);
    const espera = await conLimiteDeTiempo(
      cobrarConQr({
        fecha,
        // Lo que entra por QR entra por Mercado Pago: el medio no se pregunta.
        medio: "mercadopago",
        items: renglones,
        sucursalId: sucursalConQr.id,
        clienteId,
        nombreCliente: clienteId ? null : cliente.trim() || null,
        telefonoCliente: clienteId ? null : telefono.trim() || null,
      }),
    );
    setGuardando(false);

    if (espera.venció) {
      setError(AVISO_TARDANZA);
      return;
    }
    if (!espera.valor.ok) {
      setError(espera.valor.error);
      return;
    }

    // El carrito se vacía: la venta ya está anotada y lo que falta pasa del
    // otro lado del mostrador. Dejarlo cargado invitaría a cobrarlo dos veces.
    setEsperando({ ventaId: espera.valor.datos.ventaId, total });
    setRenglones([]);
    setPrecios({});
    setMontos(montosVacios());
    setBusqueda("");
    router.refresh();
  }

  /** El cliente se arrepintió: se saca el monto del QR y se anula la venta. */
  async function soltar(ventaId: string) {
    setEsperando(null);
    const resultado = await soltarCobroQr(ventaId);
    if (!resultado.ok) setError(resultado.error);
    router.refresh();
  }

  const buscador = (
    <div>
      <input
        ref={campo}
        value={busqueda}
        autoFocus
        enterKeyHint="done"
        aria-label="Escaneá o buscá un producto"
        placeholder="Escaneá el código o escribí el producto"
        onChange={(e) => setBusqueda(e.target.value)}
        onKeyDown={alTeclear}
        className="w-full rounded-xl border border-linea bg-white px-4 py-3 text-base"
      />

      {/*
        Un código que no es de nadie. En vez de un error y nada más, acá se le
        asigna a un producto: el escaneo que falló es justo el momento en que
        se sabe qué código tiene esa cosa, con el envase en la mano.
      */}
      {codigoHuerfano && (
        <div className="mt-2 rounded-xl border border-linea bg-tarjeta p-3 shadow-sm">
          <p className="font-mono text-[11px] tracking-tight text-tinta-suave">
            {codigoHuerfano}
          </p>

          {buscandoCodigo && (
            <p className="mt-1 text-sm text-tinta-suave">
              Buscando qué producto es…
            </p>
          )}

          {/* Lo encontró: una foto, un nombre y un botón. */}
          {!buscandoCodigo && candidato && (
            <>
              <div className="mt-1 flex items-center gap-3">
                {candidato.imagenUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={candidato.imagenUrl}
                    alt=""
                    className="h-14 w-14 shrink-0 rounded-lg bg-white object-contain p-1 ring-1 ring-linea"
                  />
                )}
                <span className="min-w-0">
                  <span className="block text-sm font-semibold leading-snug">
                    {candidato.nombre}
                  </span>
                  <span className="block text-xs text-tinta-suave">
                    lo reconoció {candidato.fuente}
                  </span>
                </span>
              </div>

              {/*
                ESTO VA ANTES DEL ALTA, a propósito. Si el producto ya está en
                el catálogo sin su código, dar de alta otro parte el historial
                de costos en dos filas que después nadie desarma. Acá la opción
                de arriba es siempre pegarle el código al que ya existe.
              */}
              {parecidos.length > 0 && (
                <div className="mt-2.5 rounded-lg bg-papel-hondo p-2">
                  <p className="text-xs font-semibold">
                    Esto ya lo tenés cargado
                  </p>
                  <ul className="mt-1 space-y-1">
                    {parecidos.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          disabled={guardandoCodigo}
                          onClick={() => void adoptarPorId(p.id)}
                          className="flex w-full items-center gap-2 rounded-md bg-tarjeta px-2 py-1.5 text-left ring-1 ring-linea disabled:opacity-60"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">
                              {p.nombre}
                            </span>
                            <span className="block text-[11px] text-tinta-suave">
                              {p.porque}
                              {p.codigoBarras &&
                                " · ojo: ya tiene otro código y se lo cambiás"}
                            </span>
                          </span>
                          <span className="shrink-0 text-xs font-semibold text-marca">
                            Es este
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <button
                type="button"
                onClick={() => void altaDelCandidato()}
                disabled={guardandoCodigo}
                className={`mt-2.5 w-full rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60 ${
                  parecidos.length
                    ? "border border-linea bg-tarjeta text-tinta-suave"
                    : "bg-marca text-white"
                }`}
              >
                {guardandoCodigo
                  ? "Cargando…"
                  : parecidos.length
                    ? "No, es uno nuevo: cargalo"
                    : "Es este, cargalo"}
              </button>
              <p className="mt-1.5 text-center text-[11px] text-tinta-suave">
                Entra sin precio: lo escribís en el carrito.
              </p>
            </>
          )}

          {/* No lo encontró, o no es el que dice: se elige del catálogo. */}
          {!buscandoCodigo && (
            <div className="mt-2.5">
              <p className="text-xs text-tinta-suave">
                {candidato
                  ? "¿No es ese? Elegilo de tu catálogo:"
                  : "No lo encontré en ningún catálogo. ¿Cuál es?"}
              </p>
              <div className="mt-1.5">
                <SelectorNombre
                  queEs="producto"
                  valor=""
                  opciones={productos.map((p) => ({
                    id: p.id,
                    nombre: p.nombre,
                    detalle: p.marca ?? undefined,
                  }))}
                  permitirCrear={false}
                  placeholder="Buscalo por nombre"
                  etiquetaAria="Producto al que pertenece el código"
                  alCambiar={(_nombre, id) => {
                    const p = productos.find((x) => x.id === id);
                    if (p) void adoptarCodigo(p);
                  }}
                />
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              olvidarCodigo();
              campo.current?.focus();
            }}
            className="mt-2 text-xs font-medium text-tinta-suave underline"
          >
            Dejarlo para después
          </button>
        </div>
      )}

      {sugerencias.length > 0 ? (
        <ul className="mt-1 overflow-hidden rounded-xl border border-linea bg-tarjeta">
          {sugerencias.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => meter(p)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-papel-hondo"
              >
                <Miniatura producto={p} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{p.nombre}</span>
                  {p.marca && (
                    <span className="block truncate text-xs text-tinta-suave">
                      {p.marca}
                    </span>
                  )}
                </span>
                <span className="cifra shrink-0 text-sm">
                  {p.precioVentaCentavos != null
                    ? formatearCentavos(p.precioVentaCentavos)
                    : "sin precio"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-tinta-suave">
          El lector escribe acá solo: pasá el producto y entra al carrito. Si no
          está cargado, escribí el precio y se cobra como monto suelto.
        </p>
      )}
    </div>
  );

  /*
   * El cliente va DEBAJO del buscador y no arriba: ponerlo primero haría que
   * cada venta empiece pidiendo un nombre que casi nunca hace falta, y eso
   * frena lo único que siempre importa, que es cobrar.
   */
  const fichaCliente = (
    <div className="rounded-xl border border-linea bg-tarjeta p-3">
      <p className="text-xs text-tinta-suave">A nombre de (opcional)</p>

      <div className="mt-2">
        <SelectorNombre
          valor={cliente}
          alCambiar={(nombre, id) => {
            setCliente(nombre);
            setClienteId(id);
          }}
          opciones={clientes}
          queEs="Cliente"
          placeholder="Nombre del cliente"
        />
      </div>

      {/* El teléfono sólo si es alguien nuevo: al que ya está cargado se le
          pide desde su ficha, y repetirlo acá invita a dejar dos distintos. */}
      {cliente.trim() && !clienteId && (
        <input
          value={telefono}
          inputMode="tel"
          placeholder="Teléfono (opcional)"
          aria-label="Teléfono del cliente"
          onChange={(e) => setTelefono(e.target.value)}
          className="cifra mt-2 w-full rounded-lg border border-linea bg-white px-3 py-2 text-sm"
        />
      )}

      <p className="mt-2 text-xs text-tinta-suave">
        Ponerle nombre NO lo fía: la venta se cobra igual. Sirve para saber
        quién compró qué.
      </p>
    </div>
  );

  const carrito =
    renglones.length === 0 ? (
      <p className="rounded-xl border border-dashed border-linea px-4 py-10 text-center text-sm text-tinta-suave">
        El carrito está vacío.
        <br />
        Pasá el primer producto por el lector.
      </p>
    ) : (
      <ul className="divide-y divide-linea overflow-hidden rounded-xl border border-linea bg-tarjeta">
        {renglones.map((renglon, i) => (
          <li
            key={llaveDe(renglon)}
            className="flex items-center gap-2.5 px-3 py-2.5"
          >
            <Miniatura
              producto={{
                nombre: renglon.descripcion,
                imagenUrl: renglon.imagenUrl,
              }}
            />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm">
                {renglon.descripcion}
              </span>
              {renglon.precioUnitarioCentavos > 0 ? (
                <span className="cifra block text-xs text-tinta-suave">
                  {formatearCentavos(renglon.precioUnitarioCentavos)} c/u
                </span>
              ) : (
                <input
                  value={precios[llaveDe(renglon)] ?? ""}
                  inputMode="decimal"
                  autoFocus
                  placeholder="precio"
                  aria-label={"Precio de " + renglon.descripcion}
                  onChange={(e) => ponerPrecio(renglon, e.target.value)}
                  className="cifra mt-1 w-24 rounded-lg border border-deuda bg-white px-2 py-1 text-xs"
                />
              )}
            </span>

            {/* El más y el menos son de dedo: en el mostrador se corrige una
                cantidad sin mirar, y un campo de texto obliga a apuntar. */}
            <span className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                aria-label={"Uno menos de " + renglon.descripcion}
                onClick={() =>
                  setRenglones((p) =>
                    cambiarCantidad(p, i, renglon.cantidad - 1),
                  )
                }
                className="h-8 w-8 rounded-lg border border-linea text-base leading-none"
              >
                −
              </button>
              <span className="cifra w-7 text-center text-sm">
                {renglon.cantidad}
              </span>
              <button
                type="button"
                aria-label={"Uno más de " + renglon.descripcion}
                onClick={() =>
                  setRenglones((p) =>
                    cambiarCantidad(p, i, renglon.cantidad + 1),
                  )
                }
                className="h-8 w-8 rounded-lg border border-linea text-base leading-none"
              >
                +
              </button>
            </span>

            <span className="cifra w-24 shrink-0 text-right text-sm font-medium">
              {formatearCentavos(
                renglon.precioUnitarioCentavos * renglon.cantidad,
              )}
            </span>

            <button
              type="button"
              aria-label={"Sacar " + renglon.descripcion}
              onClick={() => setRenglones((p) => sacar(p, i))}
              className="shrink-0 px-1 text-lg leading-none text-tinta-suave"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    );

  return (
    /*
     * Dos columnas: a la izquierda lo que se BUSCA, a la derecha lo que se
     * ACUMULA. En una sola columna el carrito empujaba el buscador fuera de la
     * pantalla justo en la venta larga, que es la única donde el carrito sirve.
     * En el celular se apilan, con el buscador arriba porque es donde está la
     * mano.
     */
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-3">
        {buscador}
        {fichaCliente}
      </div>

      <div className="space-y-3">
        {carrito}

        {renglones.length > 0 && (
          <>
            {/* Sólo cuando hay algo que cambie de precio: un interruptor que
                no mueve ningún número es una pregunta de más en cada venta. */}
            {conRecargoEncima > 0 && (
              <div className="rounded-xl border border-linea bg-tarjeta p-2">
                <div className="flex gap-1">
                  {[
                    { tarjeta: false, texto: "Efectivo" },
                    { tarjeta: true, texto: "Tarjeta o transferencia" },
                  ].map((opcion) => (
                    <button
                      key={opcion.texto}
                      type="button"
                      aria-pressed={conTarjeta === opcion.tarjeta}
                      onClick={() => cambiarFormaDePago(opcion.tarjeta)}
                      className={
                        "flex-1 rounded-lg px-3 py-2 text-sm transition-colors " +
                        (conTarjeta === opcion.tarjeta
                          ? "bg-acento text-white"
                          : "text-tinta hover:bg-papel-hondo")
                      }
                    >
                      {opcion.texto}
                    </button>
                  ))}
                </div>
                <p className="mt-1.5 px-1 text-xs text-tinta-suave">
                  {conRecargoEncima === 1
                    ? "1 producto de este carrito"
                    : `${conRecargoEncima} productos de este carrito`}{" "}
                  {conRecargoEncima === 1 ? "tiene" : "tienen"} recargo con
                  tarjeta.
                </p>
              </div>
            )}

            <div className="rounded-xl bg-papel-hondo px-4 py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm text-tinta-suave">
                  {unidades === 1 ? "1 producto" : `${unidades} productos`}
                </span>
                <span className="cifra text-3xl font-medium text-pago">
                  {formatearCentavos(total)}
                </span>
              </div>
              {ganancia.centavos > 0 && (
                <p className="mt-1 text-right text-xs text-tinta-suave">
                  deja{" "}
                  <span className="cifra">
                    {formatearCentavos(ganancia.centavos)}
                  </span>
                  {/* Con un renglón sin costo, lo que se puede calcular es
                      MENOS que lo real: decirlo evita leerlo como el final. */}
                  {!ganancia.completa && " (de lo que tiene costo cargado)"}
                </p>
              )}
            </div>

            <RepartoDePago
              montos={montos}
              alCambiar={setMontos}
              totalCentavos={total}
            />
          </>
        )}

        {error && (
          <p className="rounded-lg bg-deuda-tenue px-3 py-2 text-sm text-deuda">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={cobrar}
          disabled={guardando || renglones.length === 0}
          className="w-full rounded-full bg-acento px-5 py-3 text-base font-medium text-white disabled:opacity-45"
        >
          {guardando
            ? "Cobrando…"
            : total > 0
              ? `Cobrar ${formatearCentavos(total)}`
              : "Cobrar"}
        </button>

        {/*
          El QR sólo aparece si ESTA sucursal lo tiene creado. Un botón que
          lleva a "no está conectado" es peor que no tenerlo: se aprieta con el
          cliente esperando.
        */}
        {sucursalConQr && (
          <button
            type="button"
            onClick={cobrarQr}
            disabled={guardando || renglones.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-full border border-acento px-5 py-3 text-base font-medium text-acento disabled:opacity-45"
          >
            <IconoQr />
            Que lo escanee
          </button>
        )}

        {esperando && (
          <div className="rounded-xl border border-acento bg-acento-tenue px-4 py-3">
            <p className="text-sm font-medium text-pago">
              Esperando que pague{" "}
              <span className="cifra">{formatearCentavos(esperando.total)}</span>
            </p>
            <p className="mt-1 text-xs text-tinta-suave">
              El monto ya está en el QR del mostrador. Cuando pague, la venta se
              marca cobrada sola.
            </p>
            <button
              type="button"
              onClick={() => soltar(esperando.ventaId)}
              className="mt-2 text-xs text-deuda underline underline-offset-4"
            >
              No pagó — cancelar
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
