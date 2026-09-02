# kiosco — convenciones

App de fiado del maxikiosco El Osito. Next.js 16 (App Router) + Drizzle +
Postgres, instalable como PWA.
El README explica cómo arrancarla; acá está lo que hay que respetar al tocarla.

Next 16 rompió cosas respecto de lo que la mayoría de los modelos tienen
memorizado (`params` es una Promise, tipos de rutas generados, Turbopack por
defecto). Las reglas de la propia versión instalada están en **`AGENTS.md`** y en
`node_modules/next/dist/docs/`. Leelas antes de escribir código de framework.

## Verificar antes de decir "listo"

No hay CI. La sesión verifica sola y pega la salida:

```bash
npm run typecheck && npm run lint && npm run build
```

"Compila" no es "funciona". Si el cambio toca saldos, la carga por voz o la
anulación, hay que **ejercitarlo de verdad** — con el server levantado y datos de
`npm run db:semilla` — y mostrar el resultado.

## Reglas que no se negocian

**La plata va en centavos enteros (`bigint`).** Nunca `float`, nunca `numeric`
leído como número de JS. Las únicas conversiones viven en `src/lib/plata.ts`.

**El saldo se calcula, no se guarda.** No agregar una columna `saldo` a
`clientes` "para que sea más rápido". Si hay un problema de performance, se
resuelve con un índice o una vista materializada, no desnormalizando la verdad.

**Los movimientos no se borran.** `anulado_en` y listo. Un `DELETE` sobre
`movimientos` hace desaparecer la explicación de una deuda.

**Un ítem sin precio no vale cero.** Vale *todavía no sabemos*. Cuando el total
no lo declaró nadie (`total_declarado = false`) y hay ítems con
`precio_unitario_centavos` en null, la app lo marca con "faltan precios" y no
esconde a ese cliente aunque su saldo sea cero. Nunca lo conviertas en un cero
silencioso "para simplificar la query".

**El service worker no se mete con la navegación.** Cachea `/_next/static` y
`/iconos` y nada más. Ya pasó una vez: interceptaba las navegaciones para
mostrar una pantalla de "sin conexión" propia y terminó mostrándola con el
servidor arriba. No agregues fallbacks de navegación ni caché de páginas: si no
hay red, el error lo pone el navegador, que no se equivoca.

**Un audio nunca escribe directo.** `/api/voz` devuelve una propuesta; la
escritura pasa siempre por `src/app/acciones.ts` después de que alguien confirmó.
Si aparece la tentación de "cargar automático cuando la confianza es alta", no.

**El PIN no viaja al navegador.** Lo que va en la cookie es un HMAC firmado con
el PIN como clave (`src/lib/sesion.ts`). No guardes el PIN en una cookie, ni en
`localStorage`, ni lo mandes en una respuesta. Y las comparaciones van en tiempo
constante, no con `===`.

**El middleware sólo deja pasar sin PIN lo que la PWA necesita** para poder
instalarse: manifest, iconos, `sw.js` y `/sin-conexion`. Nada que muestre datos.

**Toda escritura pasa por `src/app/acciones.ts`.** No agregar route handlers que
inserten. Un solo lugar por donde entra todo.

## Cosas que ya mordieron

- **PGlite no crea directorios anidados.** Hay que `mkdirSync(..., {recursive:true})`
  antes de abrirlo. Está resuelto en `src/db/client.ts` y en `scripts/semilla.ts`.
- **PGlite tiene que estar en `serverExternalPackages`**, si no el bundler le
  rompe el `.wasm`.
- **`turbopack.root` está fijado** porque si no Turbopack sube buscando un
  lockfile y agarra uno suelto del home del usuario.
- **Los modelos de Groq se dan de baja.** `llama-3.3-70b-versatile` ya no existe.
  Si el paso de interpretación tira 404, mirá qué hay disponible con
  `GET https://api.groq.com/openai/v1/models` y actualizá el default de
  `GROQ_MODELO_TEXTO` en `src/lib/voz.ts`.
- **Borrar `.data` con el dev server prendido lo deja roto.** `getDb()` cachea
  la conexión por proceso y sigue apuntando a la base que ya no está. Hay que
  reiniciar el server después de vaciarla.
- **Los ids se validan contra un regex de UUID** antes de ir a la base: sin eso,
  una URL con basura sale como 500 en vez de 404.

## Idioma

Todo en castellano rioplatense: nombres de tablas, columnas, funciones,
variables, comentarios y textos de pantalla. No mezclar con inglés.
