"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crearQrDeSucursal } from "@/app/acciones";
import type { FilaSucursal } from "@/lib/sucursales";

/**
 * Un local: su conexión con Mercado Pago y su QR.
 *
 * Son tres estados y se recorren en orden, porque cada uno necesita el
 * anterior: sin conectar → conectada sin QR → con el QR listo para imprimir.
 * Mostrar los tres pasos a la vez haría apretar botones que todavía no pueden
 * funcionar.
 */
export default function TarjetaSucursal({
  sucursal,
}: {
  sucursal: FilaSucursal;
}) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendiente, empezar] = useTransition();

  const [calle, setCalle] = useState("");
  const [numero, setNumero] = useState("");
  const [ciudad, setCiudad] = useState("");
  const [provincia, setProvincia] = useState("");
  const [latitud, setLatitud] = useState("");
  const [longitud, setLongitud] = useState("");

  function crearQr(evento: React.FormEvent) {
    evento.preventDefault();
    setError(null);

    const lat = Number(latitud.replace(",", "."));
    const lon = Number(longitud.replace(",", "."));
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || (!lat && !lon)) {
      setError("Faltan las coordenadas del local.");
      return;
    }
    if (!calle.trim() || !ciudad.trim() || !provincia.trim()) {
      setError("Faltan datos de la dirección.");
      return;
    }

    empezar(async () => {
      const resultado = await crearQrDeSucursal(sucursal.id, {
        calle: calle.trim(),
        numero: numero.trim() || "0",
        ciudad: ciudad.trim(),
        provincia: provincia.trim(),
        latitud: lat,
        longitud: lon,
      });
      if (!resultado.ok) {
        setError(resultado.error);
        return;
      }
      setAbierto(false);
      router.refresh();
    });
  }

  const campo =
    "mt-1 w-full rounded-lg border border-linea bg-white px-3 py-2 text-sm";

  return (
    <div className="rounded-2xl border border-linea bg-tarjeta px-4 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-display text-lg leading-none">{sucursal.nombre}</h3>
        <span
          className={
            "rounded-full px-3 py-1 text-xs " +
            (sucursal.conectada
              ? "bg-pago-tenue text-pago"
              : "bg-papel-hondo text-tinta-suave")
          }
        >
          {sucursal.conectada ? "Mercado Pago conectado" : "Sin conectar"}
        </span>
      </div>

      {!sucursal.conectada ? (
        <>
          <p className="mt-2 text-sm text-tinta-suave">
            Conectá la cuenta de Mercado Pago de este local para poder cobrar
            con QR.
          </p>
          {/*
            Es un <a> y no un botón con fetch a propósito: el OAuth termina en
            una redirección del navegador a Mercado Pago, y eso no se puede
            hacer desde una respuesta de fetch.
          */}
          <a
            href={`/api/mp/conectar?sucursal=${sucursal.id}`}
            className="mt-3 inline-block rounded-full bg-acento px-5 py-2.5 text-sm font-medium text-white"
          >
            Conectar Mercado Pago
          </a>
        </>
      ) : sucursal.qrImagen ? (
        <>
          <p className="mt-2 text-sm text-tinta-suave">
            Imprimí este QR y pegalo en el mostrador. Es siempre el mismo: cada
            venta le pone el monto encima.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={sucursal.qrImagen}
              alt={`QR de ${sucursal.nombre}`}
              className="h-40 w-40 rounded-xl border border-linea bg-white object-contain p-2"
            />
            <a
              href={sucursal.qrImagen}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-linea px-4 py-2 text-sm"
            >
              Abrir para imprimir
            </a>
          </div>
        </>
      ) : (
        <>
          <p className="mt-2 text-sm text-tinta-suave">
            Falta crear la caja en Mercado Pago. Pide la dirección del local
            porque de ahí salen los impuestos de cada venta, así que tiene que
            ser la de verdad.
          </p>

          {!abierto ? (
            <button
              type="button"
              onClick={() => setAbierto(true)}
              className="mt-3 rounded-full bg-acento px-5 py-2.5 text-sm font-medium text-white"
            >
              Crear el QR
            </button>
          ) : (
            <form onSubmit={crearQr} className="mt-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs text-tinta-suave">Calle</span>
                  <input
                    value={calle}
                    onChange={(e) => setCalle(e.target.value)}
                    className={campo}
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-tinta-suave">Número</span>
                  <input
                    value={numero}
                    inputMode="numeric"
                    onChange={(e) => setNumero(e.target.value)}
                    className={"cifra " + campo}
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-tinta-suave">Ciudad</span>
                  <input
                    value={ciudad}
                    onChange={(e) => setCiudad(e.target.value)}
                    className={campo}
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-tinta-suave">Provincia</span>
                  <input
                    value={provincia}
                    onChange={(e) => setProvincia(e.target.value)}
                    className={campo}
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-tinta-suave">Latitud</span>
                  <input
                    value={latitud}
                    inputMode="decimal"
                    placeholder="-34.6037"
                    onChange={(e) => setLatitud(e.target.value)}
                    className={"cifra " + campo}
                  />
                </label>
                <label className="block">
                  <span className="text-xs text-tinta-suave">Longitud</span>
                  <input
                    value={longitud}
                    inputMode="decimal"
                    placeholder="-58.3816"
                    onChange={(e) => setLongitud(e.target.value)}
                    className={"cifra " + campo}
                  />
                </label>
              </div>

              <p className="text-xs text-tinta-suave">
                Las coordenadas salen de Google Maps: botón derecho sobre el
                local y copiar los dos números.
              </p>

              {error && (
                <p className="rounded-lg bg-deuda-tenue px-3 py-2 text-sm text-deuda">
                  {error}
                </p>
              )}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={pendiente}
                  className="rounded-full bg-acento px-5 py-2.5 text-sm font-medium text-white disabled:opacity-45"
                >
                  {pendiente ? "Creando…" : "Crear el QR"}
                </button>
                <button
                  type="button"
                  onClick={() => setAbierto(false)}
                  className="rounded-full border border-linea px-4 py-2 text-sm"
                >
                  Cancelar
                </button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}
