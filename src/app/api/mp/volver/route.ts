import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { sucursales } from "@/db/schema";
import { COOKIE_ESTADO, leerEstado, urlDeVuelta } from "@/lib/mp-oauth";

/**
 * La vuelta de Mercado Pago después de autorizar.
 *
 * Esta ruta NO está detrás del PIN —Mercado Pago no tiene sesión en el kiosco—
 * y por eso no confía en nada de lo que llega: el `state` tiene que estar
 * firmado por nosotros Y coincidir con la cookie que dejó `conectar`. Sin esas
 * dos cosas, cualquiera podría colgar su cuenta de Mercado Pago de una
 * sucursal nuestra, o la nuestra de otra app.
 */
export async function GET(pedido: Request) {
  const url = new URL(pedido.url);
  const volver = new URL("/sucursales", url.origin);

  const tarro = await cookies();
  const guardado = tarro.get(COOKIE_ESTADO)?.value;

  const responder = (motivo: string) => {
    volver.searchParams.set("mp", motivo);
    const r = NextResponse.redirect(volver);
    r.cookies.delete(COOKIE_ESTADO);
    return r;
  };

  const code = url.searchParams.get("code");
  const estado = url.searchParams.get("state");

  // Sin code es que el dueño canceló en la pantalla de Mercado Pago. No es un
  // error: se vuelve sin decir nada feo.
  if (!code) return responder("cancelado");
  if (!estado || !guardado || estado !== guardado) return responder("invalido");

  const sucursalId = leerEstado(estado);
  if (!sucursalId) return responder("invalido");

  const appId = process.env.MP_APP_ID;
  const secreto = process.env.MP_CLIENT_SECRET;
  if (!appId || !secreto) {
    console.error("[mp] faltan MP_APP_ID o MP_CLIENT_SECRET");
    return responder("sin_configurar");
  }

  try {
    const respuesta = await fetch("https://api.mercadopago.com/oauth/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: secreto,
        code,
        redirect_uri: urlDeVuelta(),
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (!respuesta.ok) {
      console.error("[mp] el canje falló:", respuesta.status, await respuesta.text().catch(() => ""));
      return responder("fallo");
    }

    const datos = await respuesta.json();
    if (!datos.access_token || !datos.refresh_token) {
      console.error("[mp] vinieron credenciales incompletas");
      return responder("fallo");
    }

    const db = await getDb();
    await db
      .update(sucursales)
      .set({
        mpAccessToken: datos.access_token,
        mpRefreshToken: datos.refresh_token,
        mpTokenVenceEn: new Date(Date.now() + datos.expires_in * 1000),
        mpUserId: datos.user_id != null ? String(datos.user_id) : null,
      })
      .where(eq(sucursales.id, sucursalId));

    return responder("conectada");
  } catch (error) {
    console.error("[mp] error en la vuelta:", error);
    return responder("fallo");
  }
}
