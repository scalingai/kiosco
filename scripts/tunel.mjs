/**
 * Abre el túnel a la base de producción y lo deja corriendo.
 *
 * ── Por qué un túnel y no abrir el puerto ─────────────────────────────────
 * La alternativa era publicar el Postgres en internet. Con `sslmode=disable`
 * —que es como lo expone EasyPanel— la clave viaja en texto plano, y un puerto
 * de Postgres abierto lo escanean bots todo el día. El túnel va cifrado por
 * SSH y no expone absolutamente nada: la base sigue siendo inalcanzable desde
 * afuera, y acá aparece en `localhost`.
 *
 * La clave que usa está restringida EN EL SERVIDOR a reenviar sólo el puerto
 * de Postgres: no abre shell. Si se filtrara, lo único que se puede hacer con
 * ella es lo que ya estamos haciendo.
 *
 *   npm run tunel
 *
 * Mientras esté abierto, `DATABASE_URL` apunta a `localhost:45432` y tanto la
 * app como los scripts trabajan contra los datos de verdad.
 */
import { spawn } from "node:child_process";

/** El puerto local. El mismo número que el de allá, para no confundirse. */
const PUERTO = 45432;
const DESTINO = "127.0.0.1:45432";
const HOST = "kiosco-vps";

console.log(`Abriendo el túnel a la base de producción…`);
console.log(`  localhost:${PUERTO}  →  ${HOST}:${DESTINO}\n`);

/**
 * El túnel se vuelve a levantar solo si se corta.
 *
 * No es adorno: el 2026-11-09 se cayó con «Connection reset by peer» después
 * de un rato quieto, y el síntoma NO fue un error. La app siguió andando
 * contra la base local de PGlite, mostrando números que parecían de
 * producción. Un túnel que se cae en silencio es peor que uno que no abre.
 *
 * `ServerAliveInterval` manda un latido cada 30 s para que el servidor no dé
 * la conexión por muerta, y `ExitOnForwardFailure` hace que si el puerto no se
 * puede reenviar, el ssh falle en vez de quedar conectado sin túnel.
 */
let cerrandoAdrede = false;
let intentos = 0;

function levantar() {
  const ssh = spawn(
    "ssh",
    [
      "-N", // no ejecuta ningún comando: sólo el reenvío
      "-o", "ServerAliveInterval=30",
      "-o", "ServerAliveCountMax=3",
      "-o", "ExitOnForwardFailure=yes",
      "-L",
      `${PUERTO}:${DESTINO}`,
      HOST,
    ],
    { stdio: ["ignore", "inherit", "inherit"] },
  );

  ssh.on("error", (error) => {
    console.error("No se pudo abrir el túnel:", error.message);
    process.exit(1);
  });

  ssh.on("exit", (codigo) => {
    if (cerrandoAdrede) {
      console.log("\nTúnel cerrado.");
      return;
    }

    intentos++;
    // Diez intentos: si a esa altura no volvió, el problema no es la red.
    if (intentos > 10) {
      console.error(
        `\nEl túnel se cerró (código ${codigo}) y no pudo volver.\n` +
          "Si dice 'Permission denied', falta la clave pública en el VPS.\n" +
          "Si dice 'Connection refused', la base no está escuchando en " +
          `${DESTINO} del servidor.`,
      );
      process.exit(codigo ?? 1);
    }

    const espera = Math.min(30, 2 ** intentos);
    console.error(
      `\n⚠ El túnel se cortó (código ${codigo}). Reintento ${intentos} en ${espera}s.\n` +
        "  OJO: mientras tanto la app NO está viendo producción.",
    );
    setTimeout(levantar, espera * 1000);
  });

  // Ctrl+C cierra el túnel y no deja el ssh colgado de fondo.
  for (const señal of ["SIGINT", "SIGTERM"]) {
    process.once(señal, () => {
      cerrandoAdrede = true;
      ssh.kill();
      process.exit(0);
    });
  }
}

levantar();

console.log("Listo. Dejá esta ventana abierta y trabajá en otra.");
console.log("Ctrl+C para cerrarlo.\n");
