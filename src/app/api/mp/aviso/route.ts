import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { confirmarCobroQr } from "@/app/acciones";

/**
 * El aviso de Mercado Pago cuando alguien pagó el QR.
 *
 * ── Por qué esta ruta existe y rompe una regla del repo ────────────────────
 * El `CLAUDE.md` dice que toda escritura pasa por `acciones.ts` y que no se
 * agregan route handlers que inserten. Un webhook no puede cumplirlo como está
 * escrito: lo llama Mercado Pago, no una pantalla, así que no hay server action
 * que valga.
 *
 * Se respeta el espíritu, que es que haya UNA puerta de escritura: esto valida
 * quién llama y después llama a `confirmarCobroQr()`, la misma función que
 * usaría cualquier otra parte. Lo que se agrega es un timbre nuevo, no una
 * puerta nueva.
 *
 * ── Por qué hay DOS controles y no uno ─────────────────────────────────────
 * Primero se valida la firma del header `x-signature`. Pero la firma por sí
 * sola no alcanza para marcar una venta como cobrada: si el formato del
 * manifiesto cambiara del lado de Mercado Pago, o si lo implementamos distinto,
 * el error sería dar por pagada una venta que nadie pagó.
 *
 * Por eso el que decide es el SEGUNDO control: se le pregunta a Mercado Pago,
 * con nuestro token, cómo quedó esa orden. El aviso sólo dice "andá a mirar";
 * lo que se cree es lo que contesta la API.
 */

export const dynamic = "force-dynamic";

/**
 * El manifiesto que Mercado Pago firma:
 *   id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 * Las partes que no vienen se omiten, no se mandan vacías.
 */
function firmaValida(
  xSignature: string | null,
  xRequestId: string | null,
  dataId: string | null,
  secreto: string,
): boolean {
  if (!xSignature) return false;

  let ts = "";
  let v1 = "";
  for (const parte of xSignature.split(",")) {
    const [clave, valor] = parte.split("=").map((x) => x?.trim());
    if (clave === "ts") ts = valor ?? "";
    if (clave === "v1") v1 = valor ?? "";
  }
  if (!ts || !v1) return false;

  let manifiesto = "";
  if (dataId) manifiesto += `id:${dataId};`;
  if (xRequestId) manifiesto += `request-id:${xRequestId};`;
  manifiesto += `ts:${ts};`;

  const esperada = crypto
    .createHmac("sha256", secreto)
    .update(manifiesto)
    .digest("hex");

  // En tiempo constante, igual que el PIN: con `===` se puede medir cuánto se
  // acertó y fabricar la firma a ciegas.
  if (v1.length !== esperada.length) return false;
  return crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(esperada));
}

export async function POST(pedido: Request) {
  const url = new URL(pedido.url);
  const dataId = url.searchParams.get("data.id");

  const secreto = process.env.MP_WEBHOOK_SECRET?.trim();
  if (!secreto) {
    // Sin secreto no se puede saber quién llama, y marcar ventas como cobradas
    // a pedido de cualquiera es peor que no recibir el aviso. Se contesta 200
    // igual para que Mercado Pago no reintente para siempre un problema que es
    // nuestro.
    console.error("[mp] falta MP_WEBHOOK_SECRET: el aviso se descarta");
    return NextResponse.json({ ok: true });
  }

  if (
    !firmaValida(
      pedido.headers.get("x-signature"),
      pedido.headers.get("x-request-id"),
      dataId,
      secreto,
    )
  ) {
    console.warn("[mp] aviso con firma inválida");
    return NextResponse.json({ error: "firma inválida" }, { status: 401 });
  }

  let cuerpo: { action?: string; data?: { id?: string } } = {};
  try {
    cuerpo = await pedido.json();
  } catch {
    /* un aviso sin cuerpo legible igual trae el id en la URL */
  }

  const ordenId = cuerpo.data?.id ?? dataId;
  if (!ordenId) return NextResponse.json({ ok: true });

  /*
   * Sólo interesan los avisos de pago. Los de cancelación y vencimiento llegan
   * también, y la venta pendiente se resuelve sola o a mano desde la caja: no
   * hace falta hacer nada con ellos, y hacer algo sería arriesgarse a anular
   * una venta por un aviso tardío.
   */
  if (cuerpo.action && cuerpo.action !== "order.processed") {
    return NextResponse.json({ ok: true });
  }

  try {
    await confirmarCobroQr(ordenId);
  } catch (error) {
    // Un 500 hace que Mercado Pago reintente, que es lo que se quiere si el
    // problema fue nuestro (la base no contestó).
    console.error("[mp] no se pudo confirmar", ordenId, error);
    return NextResponse.json({ error: "no se pudo procesar" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
