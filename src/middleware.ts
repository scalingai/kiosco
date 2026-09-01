import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_SESION, pinConfigurado, tokenValido } from "@/lib/sesion";

export async function middleware(request: NextRequest) {
  const pin = pinConfigurado();

  if (!pin) {
    // En desarrollo se trabaja sin PIN. En producción, no: quedarse sin portón
    // porque alguien se olvidó de poner la variable es justo lo que no puede
    // pasar en una app que muestra la deuda de gente real.
    if (process.env.NODE_ENV === "production") {
      return new NextResponse(
        "Falta configurar PIN_ACCESO en las variables de entorno.",
        { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
      );
    }
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_SESION)?.value;
  if (await tokenValido(token, pin)) return NextResponse.next();

  // La API contesta JSON, no un redirect a HTML: si la sesión vence en medio de
  // una grabación, el cliente tiene que poder mostrar un error que se entienda.
  if (request.nextUrl.pathname.startsWith("/api/")) {
    return NextResponse.json(
      { error: "Se cerró la sesión. Volvé a entrar con el PIN." },
      { status: 401 },
    );
  }

  const destino = request.nextUrl.clone();
  destino.pathname = "/entrar";
  destino.search = "";
  if (request.nextUrl.pathname !== "/") {
    destino.searchParams.set("volver", request.nextUrl.pathname);
  }
  return NextResponse.redirect(destino);
}

export const config = {
  matcher: [
    /**
     * Todo pasa por el portón menos:
     * - /entrar, que es el portón
     * - los assets y el manifest, que tienen que ser públicos para que Android
     *   e iOS puedan ofrecer instalar la app antes de que nadie ponga el PIN
     * - /sin-conexion, que la sirve el service worker sin red
     */
    "/((?!entrar|sin-conexion|sw\\.js|manifest\\.webmanifest|icon\\.png|apple-icon\\.png|oso\\.png|iconos/|_next/).*)",
  ],
};
