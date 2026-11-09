/**
 * Levanta el dev server sacando antes las variables de entorno VACÍAS.
 *
 * ── El error que no se parece a su causa ──────────────────────────────────
 * El entorno de esta máquina trae `DATABASE_URL` **definida pero vacía**. Y
 * Next NO pisa lo que ya está en `process.env`: los archivos `.env*` sólo
 * rellenan variables ausentes. Así que la cadena vacía le gana al `.env.local`
 * —el archivo que es lo único que separa trabajar contra producción de
 * trabajar contra la base local— y gana en silencio.
 *
 * El síntoma no apunta a ningún lado: `src/db/client.ts` ve un valor falsy,
 * cae a PGlite, y la app anda perfecto. Las dos bases tienen el mismo schema,
 * así que todo FUNCIONA, sólo que con los datos equivocados. El 2026-11-09 eso
 * hizo que diéramos por buenos unos números del panel creyendo que eran de
 * producción cuando salían de la base local.
 *
 * Borrar la clave del `process.env` heredado es lo que le devuelve la decisión
 * al `.env.local`. No alcanza con escribir bien el archivo: el archivo ya
 * estaba bien.
 *
 * El mismo arreglo vive en el repo de agendai por la misma razón.
 */
import { spawn } from "node:child_process";

/** Las que deciden a qué base se conecta la app. */
const QUE_IMPORTAN = ["DATABASE_URL", "DIRECT_URL"];

const sacadas = [];
for (const clave of QUE_IMPORTAN) {
  const valor = process.env[clave];
  if (valor !== undefined && valor.trim() === "") {
    delete process.env[clave];
    sacadas.push(clave);
  }
}

if (sacadas.length) {
  console.log(
    `[dev] ${sacadas.join(", ")} venía(n) vacía(s) en el entorno y tapaba(n) ` +
      "el .env.local. Las saqué para que el archivo decida.",
  );
}

const next = spawn("npx", ["next", "dev"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

next.on("exit", (codigo) => process.exit(codigo ?? 0));

for (const señal of ["SIGINT", "SIGTERM"]) {
  process.once(señal, () => {
    next.kill();
    process.exit(0);
  });
}
