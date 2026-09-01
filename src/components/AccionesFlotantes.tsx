"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { guardarMovimientos } from "@/app/acciones";
import EditorItems from "@/components/EditorItems";
import FormMovimiento from "@/components/FormMovimiento";
import Hoja from "@/components/Hoja";
import { AVISO_TARDANZA, conLimiteDeTiempo } from "@/lib/espera";
import { hoyLocal } from "@/lib/fechas";
import {
  aItemsAGuardar,
  itemVacio,
  itemsCargados,
  MontoInvalido,
  sumarItems,
  type ItemBorrador,
  type MovimientoAGuardar,
} from "@/lib/movimiento";
import { centavosAPesos, formatearCentavos, parsearMonto } from "@/lib/plata";

type Candidato = { id: string; nombre: string };

type ItemPropuesto = {
  descripcion: string;
  cantidad: number;
  precioUnitarioCentavos: number | null;
};

type Propuesta = {
  nombreDicho: string;
  clienteId: string | null;
  nombreResuelto: string;
  esClienteNuevo: boolean;
  tipo: "fiado" | "pago";
  totalCentavos: number | null;
  items: ItemPropuesto[];
  nota: string | null;
};

/** Lo que se edita en pantalla: todo texto hasta que se confirma. */
type Borrador = {
  clienteId: string | null;
  nombre: string;
  tipo: "fiado" | "pago";
  /** vacío significa "usá la suma de los ítems" */
  total: string;
  items: ItemBorrador[];
  nota: string;
};

type Estado = "quieto" | "grabando" | "procesando" | "revisando" | "guardando";

const FORMATOS = [
  { mime: "audio/webm;codecs=opus", extension: "webm" },
  { mime: "audio/webm", extension: "webm" },
  { mime: "audio/mp4", extension: "mp4" },
  { mime: "audio/ogg;codecs=opus", extension: "ogg" },
];

function elegirFormato() {
  if (typeof MediaRecorder === "undefined") return null;
  return (
    FORMATOS.find((f) => MediaRecorder.isTypeSupported(f.mime)) ?? {
      mime: "",
      extension: "webm",
    }
  );
}

function aBorrador(p: Propuesta): Borrador {
  const items: ItemBorrador[] = p.items.map((item) => ({
    descripcion: item.descripcion,
    cantidad: String(item.cantidad),
    precio:
      item.precioUnitarioCentavos != null
        ? String(centavosAPesos(item.precioUnitarioCentavos))
        : "",
  }));

  return {
    clienteId: p.clienteId,
    nombre: p.nombreResuelto,
    tipo: p.tipo,
    total: p.totalCentavos != null ? String(centavosAPesos(p.totalCentavos)) : "",
    items: items.length ? items : [itemVacio()],
    nota: p.nota ?? "",
  };
}

function IconoMicrofono() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      className="h-7 w-7"
      aria-hidden="true"
    >
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0" />
      <path d="M12 17.5V21" />
    </svg>
  );
}

/** Lo que se va a anotar de verdad, para mostrarlo antes de confirmar. */
function totalEfectivo(b: Borrador): { centavos: number; declarado: boolean } {
  if (b.total.trim()) {
    return { centavos: parsearMonto(b.total) ?? 0, declarado: true };
  }
  try {
    return { centavos: sumarItems(aItemsAGuardar(b.items)), declarado: false };
  } catch {
    return { centavos: 0, declarado: false };
  }
}

export default function AccionesFlotantes({
  clientes,
  clienteFijo,
}: {
  clientes: Candidato[];
  /** En la ficha de un cliente, la carga a mano ya viene apuntada a esa persona. */
  clienteFijo?: Candidato;
}) {
  const router = useRouter();
  const [estado, setEstado] = useState<Estado>("quieto");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [transcripcion, setTranscripcion] = useState("");
  const [borradores, setBorradores] = useState<Borrador[]>([]);
  const [segundos, setSegundos] = useState(0);
  const [manualAbierto, setManualAbierto] = useState(false);

  const grabadorRef = useRef<MediaRecorder | null>(null);
  const trozosRef = useRef<Blob[]>([]);

  useEffect(() => {
    if (estado !== "grabando") return;
    const id = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [estado]);

  // Si el componente se desmonta mientras graba, hay que soltar el micrófono.
  useEffect(() => {
    return () => {
      grabadorRef.current?.stream.getTracks().forEach((t) => t.stop());
    };
  }, []);

  // El cartelito de "anotado" se va solo; el de error se queda hasta el próximo intento.
  useEffect(() => {
    if (!aviso) return;
    const id = setTimeout(() => setAviso(null), 4000);
    return () => clearTimeout(id);
  }, [aviso]);

  const enviar = useCallback(async (blob: Blob, extension: string) => {
    setEstado("procesando");
    try {
      const cuerpo = new FormData();
      cuerpo.append(
        "audio",
        new File([blob], "nota." + extension, { type: blob.type }),
      );
      const respuesta = await fetch("/api/voz", { method: "POST", body: cuerpo });
      const datos = await respuesta.json();

      if (!respuesta.ok) {
        setError(datos.error ?? "Falló la transcripción");
        setEstado("quieto");
        return;
      }

      setTranscripcion(datos.transcripcion ?? "");
      const propuestas: Propuesta[] = datos.propuestas ?? [];
      if (!propuestas.length) {
        setError(
          datos.transcripcion
            ? "Escuché “" +
                datos.transcripcion +
                "” pero no encontré ningún fiado ni pago."
            : "No se escuchó nada.",
        );
        setEstado("quieto");
        return;
      }
      setBorradores(propuestas.map(aBorrador));
      setEstado("revisando");
    } catch {
      setError("No pude mandar el audio. Fijate la conexión.");
      setEstado("quieto");
    }
  }, []);

  const arrancar = useCallback(async () => {
    setError(null);
    setAviso(null);
    const formato = elegirFormato();
    if (!formato) {
      setError("Este navegador no puede grabar audio. Cargalo a mano con el +.");
      return;
    }

    // Fuera de un origen seguro el navegador ni expone mediaDevices. Sin este
    // chequeo el catch de abajo dice "no me diste permiso", que manda a buscar
    // el problema donde no está.
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError(
        "El micrófono sólo funciona con HTTPS. Entrá por https:// y no por IP.",
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const grabador = new MediaRecorder(
        stream,
        formato.mime ? { mimeType: formato.mime } : undefined,
      );
      trozosRef.current = [];
      grabador.ondataavailable = (e) => {
        if (e.data.size > 0) trozosRef.current.push(e.data);
      };
      grabador.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(trozosRef.current, {
          type: formato.mime || "audio/webm",
        });
        if (blob.size < 1200) {
          setError(
            "El audio salió muy corto. Tocá el micrófono, hablá, y tocalo de nuevo.",
          );
          setEstado("quieto");
          return;
        }
        void enviar(blob, formato.extension);
      };
      grabadorRef.current = grabador;
      grabador.start();
      setSegundos(0);
      setEstado("grabando");
    } catch (problema) {
      const nombre =
        problema instanceof Error ? problema.name : "";
      if (nombre === "NotFoundError" || nombre === "DevicesNotFoundError") {
        setError("No encontré ningún micrófono en este dispositivo.");
      } else if (nombre === "NotReadableError") {
        setError("Otra app está usando el micrófono. Cerrala y probá de nuevo.");
      } else {
        setError(
          "El navegador bloqueó el micrófono. Dale permiso en el candado de la barra de direcciones.",
        );
      }
    }
  }, [enviar]);

  const parar = useCallback(() => {
    grabadorRef.current?.stop();
    grabadorRef.current = null;
  }, []);

  function editar(indice: number, cambio: Partial<Borrador>) {
    setBorradores((previo) =>
      previo.map((b, i) => (i === indice ? { ...b, ...cambio } : b)),
    );
  }

  function descartar(indice: number) {
    setBorradores((previo) => previo.filter((_, i) => i !== indice));
  }

  function cerrarRevision() {
    setBorradores([]);
    setTranscripcion("");
    setEstado("quieto");
  }

  async function confirmar() {
    setError(null);
    const porGuardar: MovimientoAGuardar[] = [];

    for (const b of borradores) {
      if (!b.nombre.trim()) {
        setError("Hay un movimiento sin cliente.");
        return;
      }

      let items;
      try {
        items = b.tipo === "pago" ? [] : aItemsAGuardar(b.items);
      } catch (problema) {
        setError(
          problema instanceof MontoInvalido
            ? problema.message
            : "Revisá los productos de " + b.nombre + ".",
        );
        return;
      }

      let montoCentavos: number | null = null;
      if (b.total.trim()) {
        montoCentavos = parsearMonto(b.total);
        if (montoCentavos == null || montoCentavos <= 0) {
          setError("Revisá el total de " + b.nombre + ".");
          return;
        }
      }

      if (b.tipo === "pago" && montoCentavos == null) {
        setError("El pago de " + b.nombre + " necesita un monto.");
        return;
      }
      if (b.tipo !== "pago" && montoCentavos == null && !items.length) {
        setError(b.nombre + " no tiene ni productos ni total.");
        return;
      }

      porGuardar.push({
        clienteId: b.clienteId ?? undefined,
        nombreCliente: b.clienteId ? undefined : b.nombre.trim(),
        tipo: b.tipo,
        montoCentavos,
        items,
        nota: b.nota,
        fecha: hoyLocal(),
        origen: "audio",
        transcripcion,
      });
    }

    setEstado("guardando");
    const espera = await conLimiteDeTiempo(guardarMovimientos(porGuardar));
    if (espera.venció) {
      setError(AVISO_TARDANZA);
      setEstado("revisando");
      return;
    }
    const resultado = espera.valor;
    if (!resultado.ok) {
      setError(resultado.error);
      setEstado("revisando");
      return;
    }
    const n = resultado.datos.guardados;
    cerrarRevision();
    setAviso("Anotado: " + n + (n === 1 ? " movimiento." : " movimientos."));
    router.refresh();
  }

  const grabando = estado === "grabando";
  const procesando = estado === "procesando";

  return (
    <>
      {/* Los cartelitos van sobre los botones, no adentro de la hoja: se ven
          aunque la hoja ya se haya cerrado. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center pl-4 pr-24 sm:pr-28">
        {error && (
          <p
            role="alert"
            className="pointer-events-auto max-w-md rounded-xl bg-deuda px-4 py-2.5 text-sm text-white shadow-lg"
            onClick={() => setError(null)}
          >
            {error}
          </p>
        )}
        {aviso && !error && (
          <p
            role="status"
            className="pointer-events-auto max-w-md rounded-xl bg-pago px-4 py-2.5 text-sm text-white shadow-lg"
          >
            {aviso}
          </p>
        )}
      </div>

      <div className="fixed bottom-5 right-4 z-40 flex flex-col items-center gap-3 sm:bottom-7 sm:right-7">
        <button
          type="button"
          onClick={() => setManualAbierto(true)}
          aria-label="Cargar a mano"
          title="Cargar a mano"
          className="flex h-12 w-12 items-center justify-center rounded-full border border-linea bg-papel text-2xl leading-none text-tinta shadow-lg transition-transform active:scale-95"
        >
          +
        </button>

        <button
          type="button"
          onClick={grabando ? parar : arrancar}
          disabled={procesando}
          aria-label={grabando ? "Frenar la grabación" : "Grabar un audio"}
          title={grabando ? "Frenar" : "Grabar"}
          className={
            "relative flex h-16 w-16 items-center justify-center rounded-full text-white shadow-xl transition-transform active:scale-95 disabled:opacity-70 " +
            (grabando ? "bg-deuda" : "bg-acento")
          }
        >
          {procesando ? (
            <span className="grabando text-xs font-medium">…</span>
          ) : grabando ? (
            <span className="grabando block h-5 w-5 rounded-sm bg-white" />
          ) : (
            <IconoMicrofono />
          )}
          {grabando && (
            <span className="cifra absolute -top-1 -right-1 rounded-full bg-tinta px-2 py-0.5 text-[0.7rem] leading-none">
              {segundos}s
            </span>
          )}
        </button>
      </div>

      <Hoja
        abierta={estado === "revisando" || estado === "guardando"}
        titulo="Revisar antes de anotar"
        onCerrar={cerrarRevision}
      >
        <p className="text-xs uppercase tracking-[0.16em] text-tinta-suave">
          Se escuchó
        </p>
        <p className="mt-1 text-sm italic text-tinta-suave">{transcripcion}</p>

        <ul className="mt-4 space-y-3">
          {borradores.map((b, i) => {
            const total = totalEfectivo(b);
            const faltanPrecios =
              b.tipo !== "pago" &&
              !total.declarado &&
              itemsCargados(b.items).some((item) => !item.precio.trim());

            return (
              <li
                key={i}
                className="rounded-xl border border-linea bg-white/60 p-3 sm:p-4"
              >
                <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
                  <label className="block">
                    <span className="text-xs text-tinta-suave">Cliente</span>
                    <input
                      value={b.nombre}
                      onChange={(e) =>
                        editar(i, { nombre: e.target.value, clienteId: null })
                      }
                      list="lista-clientes"
                      className="mt-1 w-full rounded-lg border border-linea bg-white px-3 py-2 text-sm"
                    />
                    {!b.clienteId && (
                      <span className="mt-1 block text-xs text-deuda">
                        Cliente nuevo — se crea al anotar
                      </span>
                    )}
                  </label>

                  <label className="block">
                    <span className="text-xs text-tinta-suave">Tipo</span>
                    <select
                      value={b.tipo}
                      onChange={(e) =>
                        editar(i, { tipo: e.target.value as "fiado" | "pago" })
                      }
                      className="mt-1 w-full rounded-lg border border-linea bg-white px-3 py-2 text-sm"
                    >
                      <option value="fiado">Fiado (debe)</option>
                      <option value="pago">Pago (entrega)</option>
                    </select>
                  </label>
                </div>

                {b.tipo !== "pago" && (
                  <div className="mt-3">
                    <EditorItems
                      items={b.items}
                      onCambio={(items) => editar(i, { items })}
                    />
                  </div>
                )}

                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs text-tinta-suave">
                      {b.tipo === "pago" ? "Monto" : "Total"}
                    </span>
                    <input
                      value={b.total}
                      inputMode="decimal"
                      placeholder={
                        total.centavos > 0 && !total.declarado
                          ? String(centavosAPesos(total.centavos))
                          : "opcional"
                      }
                      onChange={(e) => editar(i, { total: e.target.value })}
                      className="cifra mt-1 w-full rounded-lg border border-linea bg-white px-3 py-2 text-sm"
                    />
                  </label>

                  <label className="block">
                    <span className="text-xs text-tinta-suave">Nota</span>
                    <input
                      value={b.nota}
                      placeholder="opcional"
                      onChange={(e) => editar(i, { nota: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-linea bg-white px-3 py-2 text-sm"
                    />
                  </label>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="cifra text-sm font-medium">
                    {b.tipo === "pago" ? "Baja " : "Suma "}
                    {formatearCentavos(total.centavos)}
                  </span>
                  <button
                    type="button"
                    onClick={() => descartar(i)}
                    className="rounded-lg border border-linea px-3 py-1.5 text-xs text-tinta-suave"
                  >
                    Sacar
                  </button>
                </div>

                {faltanPrecios && (
                  <p className="mt-2 rounded-lg bg-deuda-tenue px-3 py-2 text-xs text-deuda">
                    Hay productos sin precio y no hay total: se anotan, pero esas
                    líneas no suman a la deuda.
                  </p>
                )}
              </li>
            );
          })}
        </ul>

        <div className="mt-4 flex gap-3">
          <button
            type="button"
            onClick={confirmar}
            disabled={estado === "guardando" || !borradores.length}
            className="rounded-full bg-acento px-5 py-2.5 text-sm font-medium text-white disabled:opacity-45"
          >
            {estado === "guardando" ? "Anotando…" : "Anotar"}
          </button>
          <button
            type="button"
            onClick={cerrarRevision}
            className="rounded-full border border-linea px-5 py-2.5 text-sm"
          >
            Descartar
          </button>
        </div>
      </Hoja>

      <Hoja
        abierta={manualAbierto}
        titulo={clienteFijo ? "Anotar en " + clienteFijo.nombre : "Cargar a mano"}
        onCerrar={() => setManualAbierto(false)}
      >
        <FormMovimiento
          clientes={clientes}
          clienteFijo={clienteFijo}
          sinTitulo
          alGuardar={() => {
            setManualAbierto(false);
            setAviso("Anotado.");
          }}
        />
      </Hoja>

      <datalist id="lista-clientes">
        {clientes.map((c) => (
          <option key={c.id} value={c.nombre} />
        ))}
      </datalist>
    </>
  );
}
