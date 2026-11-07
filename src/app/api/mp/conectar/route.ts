import { NextResponse } from "next/server";
import { armarEstado, COOKIE_ESTADO, urlDeVuelta } from "@/lib/mp-oauth";

/** Mismo regex que el resto del repo: un id con basura sale como 404, no 500. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Manda al dueño a autorizar Mercado Pago para UNA sucursal.
 *
 * Va detrás del PIN (el middleware la protege como a cualquier otra pantalla):
 * quien llega acá ya entró al kiosco. Lo que esta ruta no puede hacer es
 * confiar en la vuelta, y de eso se ocupa el `state` firmado.
 *
 * Se llega con un `<a href>`, así que lo que devuelve se PINTA: un JSON de
 * error sería una pantalla en blanco con una variable de entorno adentro. Por
 * eso los problemas vuelven a /sucursales con un motivo corto.
 */
export async function GET(pedido: Request) {
  const url = new URL(pedido.url);
  const sucursalId = url.searchParams.get("sucursal") ?? "";

  const volver = new URL("/sucursales", url.origin);

  if (!UUID.test(sucursalId)) {
    volver.searchParams.set("mp", "sucursal_invalida");
    return NextResponse.redirect(volver);
  }

  const appId = process.env.MP_APP_ID;
  if (!appId) {
    // El motivo real va al log: es un problema de configuración nuestro, no
    // algo que el dueño pueda resolver, y el nombre de la variable no tiene
    // por qué salir a la pantalla.
    console.error("[mp] falta MP_APP_ID");
    volver.searchParams.set("mp", "sin_configurar");
    return NextResponse.redirect(volver);
  }

  let estado: string;
  try {
    estado = armarEstado(sucursalId);
  } catch (error) {
    console.error("[mp] no se pudo firmar el state:", error);
    volver.searchParams.set("mp", "sin_configurar");
    return NextResponse.redirect(volver);
  }

  const autorizar = new URL("https://auth.mercadopago.com/authorization");
  autorizar.searchParams.set("client_id", appId);
  autorizar.searchParams.set("response_type", "code");
  autorizar.searchParams.set("redirect_uri", urlDeVuelta());
  autorizar.searchParams.set("state", estado);

  const respuesta = NextResponse.redirect(autorizar.toString());
  respuesta.cookies.set(COOKIE_ESTADO, estado, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 10 * 60,
  });
  return respuesta;
}
