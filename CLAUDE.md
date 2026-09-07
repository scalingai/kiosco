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

**El costo por unidad se calcula, no se carga.** Al proveedor se le compra por
bulto. El renglón de una compra guarda lo que dice la factura —cuántos bultos,
`unidades_por_bulto`, en qué `unidad` se mide (`un`/`gr`/`ml`) e
`importe_centavos`— y el costo sale de dividir, al mostrarlo. Guardarlo
redondeado hace que el renglón deje de sumar lo que se pagó: $41.000 entre 18
unidades no da un número redondo.

Para `gr` y `ml`, `costoDeReferencia()` devuelve el precio **por kilo y por
litro**, no por gramo: el precio de un gramo son centavos que nadie puede leer,
y en el mayorista los precios se comparan por kilo.

**El importe de la factura NO es el costo.** Comprando en blanco el mayorista
factura + IVA, así que lo que sale de verdad cada unidad es el importe por 1,21
(`compras.en_blanco` → `costoConIva()`). En negro, el importe ya es el costo.
Todo lo que sea margen o precio sugerido se calcula sobre el costo CON IVA:
sacarlo contra el importe de la factura infla la ganancia un 21%.

`en_blanco` arranca en `false` a propósito. Las compras cargadas antes de que
existiera no declararon nada, y ponerles IVA por default les habría cambiado el
costo a todas de un día para el otro sin que nadie lo dijera.

**Margen y multiplicador no son lo mismo**, y se confunden todo el tiempo:
multiplicar el costo por 1,4 no es ganar 40%, es ganar 28,6% de lo que cobrás.
`calcularMargen()` devuelve los dos números y la pantalla muestra los dos. El
1,4 es sólo una sugerencia; si el producto tiene `precio_venta_centavos`
cargado, la app dice el margen REAL en vez de uno inventado.

**La marca agrupa, el contenido compara.** Un producto puede tener `marca_id`
(opcional: el pan no tiene) y `contenido` + `contenido_unidad` — cuánto trae UNA
unidad de venta, 2250 ml la Coca grande. El contenido es lo que hace comparables
dos tamaños de la misma marca: por botella, $3.000 y $2.000 son dos precios
sueltos; por litro son $1.333 y $4.000, y ahí se ve cuál conviene. Ese número lo
da `costoPorContenido()` y sólo se calcula cuando el renglón vino por unidad —
si ya venía en gramos, el precio por kilo lo da `costoDeReferencia()` y tener
dos fuentes para el mismo número es peor que no tenerlo.

Marca y contenido NO salen de la factura (ahí dice "8 packs", no "cada botella
trae 2,25 L"): se cargan a mano en `/stock`. El costo y el proveedor, al revés,
NO se editan a mano — los escribe la última compra.

**Los nombres se comparan normalizados.** Clientes, proveedores y productos
pasan todos por `normalizarNombre()` antes de buscar o crear, y cada tabla tiene
su índice único sobre la columna normalizada. Por eso "coca cola" encuentra a
"Coca-Cola" en vez de crear un duplicado. Si agregás otra entidad con nombre,
seguí el mismo patrón: `buscarOCrear…` + `uniqueIndex` sobre
`nombre_normalizado`. Hoy lo cumplen `clientes`, `proveedores`, `productos` y
`marcas`.

**Stock no cuenta unidades.** `productos` es un catálogo de reposición, no un
inventario: qué se vende, a quién se le compra, a cuánto salió la última vez y
si falta. No agregues una columna de unidades en existencia — sin cargar cada
venta se desincroniza en días, y un número que miente es peor que no tenerlo. El
último costo tampoco se guarda: se lee del último renglón de compra enganchado a
ese producto. El catálogo se llena solo desde `registrarCompra`, que engancha
cada renglón con nombre a su producto.

**Hay tres cajas, no una.** Efectivo, Mercado Pago y banco son plata distinta:
"quedó $300.000" no contesta si mañana se le puede pagar en efectivo al
proveedor. Toda entrada y toda salida lleva `medio`, y el día se muestra
repartido en los tres. El medio de una compra va **atado a `pagado_en`**: una
compra a cuenta no se pagó con nada todavía, y guardarle un medio sería
inventar por dónde salió.

Los pagos de fiado cargados por audio quedan en efectivo, que es como se paga en
el mostrador. Si fue por otro medio, se anula y se recarga a mano.

**Una compra impaga no toca la caja.** `compras.fecha` es cuándo llegó la
mercadería; `compras.pagado_en` es cuándo salió la plata, y en null significa
que se le debe al proveedor. La salida del día se cuenta por `pagado_en`, nunca
por `fecha`: el pedido que te dejan el martes y pagás el viernes salió el
viernes.

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
