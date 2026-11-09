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

const ssh = spawn(
  "ssh",
  [
    "-N", // no ejecuta ningún comando: sólo el reenvío
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
  if (codigo === 0) {
    console.log("\nTúnel cerrado.");
    return;
  }
  console.error(
    `\nEl túnel se cerró (código ${codigo}).\n` +
      "Si dice 'Permission denied', falta pegar la clave pública en el VPS.\n" +
      "Si dice 'Connection refused', la base no está escuchando en " +
      `${DESTINO} del servidor.`,
  );
  process.exit(codigo ?? 1);
});

// Ctrl+C cierra el túnel y no deja el ssh colgado de fondo.
for (const señal of ["SIGINT", "SIGTERM"]) {
  process.on(señal, () => {
    ssh.kill();
    process.exit(0);
  });
}

console.log("Listo. Dejá esta ventana abierta y trabajá en otra.");
console.log("Ctrl+C para cerrarlo.\n");
