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
`unidades_por_bulto` e `importe_centavos`— y el costo sale de dividir, al
mostrarlo. Guardarlo redondeado hace que el renglón deje de sumar lo que se
pagó: $41.000 entre 18 unidades no da un número redondo.

**Una compra se mide SIEMPRE en unidades.** Tres cajones de seis botellas son
dieciocho botellas, y punto. Los `ml` o `gr` son del envase, no de la compra, y
viven en `productos.contenido`. El renglón llegó a tener su propio selector de
unidad y estaba mal: hacía elegir dos veces la misma cosa y permitía que las
dos no coincidieran. `compras_items.unidad` quedó en `un` fijo; la columna
sigue existiendo porque las compras viejas la usaron.

**El importe del renglón se escribe por bulto, y eso es el default.** El
mayorista lista el precio del cajón, no el total de la partida, así que pedir
el total obligaba a multiplicar de cabeza antes de anotar — justo la cuenta que
la app tendría que hacer. Se puede cambiar a total renglón por renglón
(`RenglonBorrador.modo`), pero lo que se GUARDA es siempre el total
(`totalDelRenglon()`): con el precio del bulto guardado, la suma de los
renglones dejaría de dar lo que dice la factura.

**El importe de la factura NO es el costo.** Comprando en blanco el mayorista
factura + IVA, así que lo que sale de verdad cada unidad es el importe por 1,21
(`compras.en_blanco` → `costoConIva()`). En negro, el importe ya es el costo.
Todo lo que sea margen o precio sugerido se calcula sobre el costo CON IVA:
sacarlo contra el importe de la factura infla la ganancia un 21%.

`en_blanco` arranca en `false` a propósito. Las compras cargadas antes de que
existiera no declararon nada, y ponerles IVA por default les habría cambiado el
costo a todas de un día para el otro sin que nadie lo dijera.

**Un descuento baja el costo, no el precio de venta.** Cuando el proveedor
descuenta —una promo, pago contado— esa mercadería te salió menos y el margen
sube. Bajar la góndola es otra decisión, y se toma aparte.

Hay dos descuentos y NO son lo mismo:

- El del **renglón** (`compras_items.descuento_centavos`) sí cambia el costo por
  unidad: `costoDeReferencia()` trabaja sobre el neto. La promo suele ser de un
  producto —"2x1 en palitos"— y ahí es donde se puede atribuir sin inventar.
- El de la **factura** (`compras.descuento_centavos`) sólo baja lo que salió de
  la caja. NO se reparte entre los renglones: prorratearlo sería adivinar a qué
  producto correspondía, y un costo adivinado se ve igual que uno real.

Los dos guardan una **nota** al lado, y no es decorativa: un costo que bajó de
golpe tres meses después parece un error de carga. La nota es lo único que
distingue "hubo promo" de "alguien se equivocó tipeando".

El `importe_centavos` del renglón sigue siendo lo que dice el papel, en bruto.
El neto se calcula al leer (`netoDelRenglon()`), por la misma razón que el costo
por unidad: si se guardara neto, el renglón dejaría de coincidir con la factura
del proveedor, que es contra lo que se controla.

**Margen y multiplicador no son lo mismo**, y se confunden todo el tiempo:
multiplicar el costo por 1,4 no es ganar 40%, es ganar 28,6% de lo que cobrás.
`calcularMargen()` devuelve los dos números y la pantalla muestra los dos. El
1,4 es sólo una sugerencia; si el producto tiene `precio_venta_centavos`
cargado, la app dice el margen REAL en vez de uno inventado.

**Y el 1,4 se ajusta por producto.** La bebida se vende con menos margen que la
golosina y el cigarrillo con casi nada: un solo número para todo el kiosco no
existe. Va en `productos.multiplicador_milesimas` (1400 = 1,4), entero por la
misma razón que la plata. Es **nullable y sin default**: así se distingue "nunca
lo toqué" de "decidí que sea 1,4", y el día que cambie el general, los que nadie
ajustó lo siguen. Con un `default 1400` en la columna ese cambio no llegaría a
ninguno.

**El precio sugerido se redondea a los $100, y desde $10 arriba sube.** Nadie
cobra $4.357 ni tiene monedas para ese vuelto. `redondearPrecio()` baja al
múltiplo de $100 cuando sobran menos de $10, y sube al siguiente cuando sobran
$10 o más: $509 queda en $500 y $510 pasa a $600. Nunca devuelve cero — algo
que vale $30 se sugiere a $100.

Esta regla **reemplaza** a la del "más cercano" que estuvo escrita acá hasta el
2026-11-09. Confirmada por Agus ese día, mirando lo que hacía el código desde
el 2026-09-12: el redondeo defiende el margen, y la rebaja la decide una
persona mirando la góndola, no la calculadora. Un paso único de $100 en vez de
escalones por tamaño: es la regla que se puede decir en una frase.

⚠️ El sugerido es eso, **una sugerencia**. Si el de la otra cuadra lo tiene más
barato, el precio se pone a mano y la app calcula el margen que de verdad
quedó.

**En los rubros de bebidas, `db:catalogo` es la única verdad.** Los que están en
`RUBROS_PROPIOS` (gaseosas, aguas, saborizadas, jugos, energizantes, alcohol,
helados, lácteos) se cargan a mano ahí, y al final el script **borra de esos
rubros lo que no generó**. Sin eso, cada corrida del importador metía marcas y
formatos que el kiosco no tiene y había que podar rubro por rubro. Los rubros
que NO están en esa lista se llenan con lo que traiga el importador, porque
todavía no hay nada curado.

Lo que nunca se borra, aunque sobre: un producto con compras encima o con
precio de venta cargado. Eso significa que alguien lo usa de verdad.

**El código de barras no se adivina.** `productos.codigo_barras` se valida con
el dígito verificador del EAN (`codigoValido()` en `src/lib/codigos.ts`) antes de
guardarse. Un código equivocado no falla ruidosamente: escanea y trae otro
producto, que es peor que no tenerlo. Por lo mismo, cuando `db:importar`
encuentra más de un producto que podría corresponder a un EAN, **no elige
ninguno**: lo reporta y sigue. Y `buscar-ean.ts` descarta la tienda entera si
devuelve más de un producto para el mismo código.

**Una ristra larga de dígitos es un escaneo, nunca un precio.** El campo del
mostrador tiene dos lecturas —buscar producto o cobrar monto suelto— y
`pareceCodigoDeBarras()` decide cuál. Si entró un código y no es de ningún
producto, el camino **termina ahí**: no se pasa a la búsqueda por nombre ni al
monto suelto. Ver abajo por qué.

**Antes de dar de alta un producto desde un código, buscar el duplicado.**
`buscarParecidos()` mira si eso ya está en el catálogo con otro nombre y sin
código (mismo nombre normalizado, o misma marca y mismo `contenido`). Dar de
alta uno nuevo cuando ya existía parte el historial de costos en dos filas y
**no se nota**: las dos funcionan, y el costo de referencia sale de la que se
compró. Por eso en pantalla la opción de arriba es siempre pegarle el código al
que ya está, y crear uno nuevo es la acción secundaria.

Marca y tamaño aciertan el grupo pero **no la variante**: "Monster 473" son los
cinco Monster de 473. Eso se ORDENA con la tabla `VARIANTES` (original↔común,
sin azúcar↔zero) y lo elige una persona con un toque. No se resuelve solo, y no
hace falta un modelo: es comparar strings con respuesta exacta, `normalizarNombre()`
es la misma función que usa el índice único de la base, y una fusión equivocada
pega dos historiales que después nadie desarma.

**Rubro y envase son dos ejes distintos, no uno.** El rubro es qué cosa es
(`categorias`, en dos niveles con `padre_id`: Bebidas › Gaseosas) y el envase es
cómo viene (`productos.envase`: botella, retornable, lata, tetra). Un producto
es de UN rubro pero viene en VARIOS envases: si "lata" fuera una categoría, al
cargar la Coca en lata habría que elegir entre "gaseosas" y "latas" y se pierde
una de las dos. No los mezcles en una sola lista.

**La marca agrupa; el cálculo va de bulto a unidad.** Un producto puede tener
`marca_id` (opcional: el pan no tiene) y `contenido` + `contenido_unidad`, que
son descriptivos —distinguen la gaseosa de 500 ml de la de 2,25 L en la lista—.
El cálculo que importa es otro: de lo que dice la factura a lo que sale UNA
unidad, `costoDeReferencia()` sobre `cantidad × unidades_por_bulto`.

**No hay precio por litro ni por kilo derivado del contenido.** Existió y se
sacó (2026-09-07, pedido de Agus): en un kiosco no se decide nada con eso, y un
número que nadie mira es código que hay que mantener igual. Si vuelve a pedirse,
el dato para calcularlo sigue estando en `productos.contenido`.

**Un audio nunca escribe directo.** `/api/voz` devuelve una propuesta; la
escritura pasa siempre por `src/app/acciones.ts` después de que alguien confirmó.
Si aparece la tentación de "cargar automático cuando la confianza es alta", no.

**El PIN no viaja al navegador.** Lo que va en la cookie es un HMAC firmado con
el PIN como clave (`src/lib/sesion.ts`). No guardes el PIN en una cookie, ni en
`localStorage`, ni lo mandes en una respuesta. Y las comparaciones van en tiempo
constante, no con `===`.

**El middleware sólo deja pasar sin PIN lo que la PWA necesita** para poder
instalarse: manifest, iconos, `sw.js` y `/sin-conexion`. Nada que muestre datos.

**Los nombres que se normalizan se eligen con `SelectorNombre`.** Proveedor,
marca, producto y cliente comparten ese campo, y no es cosmético: filtra con
`normalizarNombre()`, la MISMA función que la base usa en su índice único, y
muestra el alta como una fila aparte ("Crear X, no estaba en la lista"). Que la
pantalla y el servidor compartan esa función es lo que hace que lo que ves sea
lo que va a pasar. No vuelvas a `<datalist>`: lo dibuja el sistema operativo
—en Windows es un cuadro negro—, compara el texto crudo (así "coca cola" no
encontraba "Coca-Cola") y no distingue elegir de crear, que es como se termina
con el mismo proveedor cargado tres veces.

**El pedido al proveedor NO es una compra.** Vive en `reposiciones` /
`reposiciones_items` (`/reponer`), aparte de `compras`, y la razón es el costo:
`costoDeReferencia()` sale de la última compra, así que meter ahí un pedido con
precios estimados haría que todo el catálogo calcule márgenes contra plata que
nadie pagó todavía — sin avisar. El `importe_bulto_centavos` del renglón es
nullable y sin default: mientras el proveedor no cantó el precio, eso es
*todavía no sabemos*, y el total dice que está incompleto en vez de mentir.

«Traer lo de siempre» arranca el pedido con lo que ya se le compró a ese
proveedor. Copia las cantidades pero **no el importe**: el precio de la vez
pasada no es el de hoy. Se muestra al lado («antes $7.000 el bulto») y un ▲
marca cuando subió.

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
- **Después de `db:generate` hay que REINICIAR el dev server.** Las migraciones
  se aplican al conectar (`migrate()` en `src/db/client.ts`) y `getDb()` cachea
  la conexión por proceso: un server que ya estaba levantado nunca corre la
  migración nueva. El código pasa `typecheck`, `lint` y `build` —el SQL se arma
  en runtime— y la página revienta con `Failed query: column ... does not
  exist`. Ya pasó con `multiplicador_milesimas`.
- **Los scripts de base se corren con el dev server APAGADO.** `getDb()` cachea
  la conexión por proceso, y PGlite es un solo escritor por directorio: si
  `db:semilla` o `db:catalogo` escriben mientras el server tiene `.data/pg`
  abierto, el script dice que hizo todo y la app sigue mostrando lo de antes.
  No falla, miente. Lo mismo al borrar `.data`: hay que reiniciar el server
  después.
- **Se trabaja contra la base de PRODUCCIÓN, no contra una local de juguete**
  (decisión de Agus, 2026-11-09). Es un kiosco con un solo usuario: los datos
  que importan —el catálogo real, los precios, los pedidos— están en prod, y
  armar algo contra datos inventados no sirve para decidir nada.

  El camino es un túnel SSH: `npm run tunel` deja la base en `localhost:45432`
  y `.env.local` apunta ahí. **No se abre el puerto a internet**: EasyPanel lo
  publica con `sslmode=disable`, o sea la clave en texto plano, y un puerto de
  Postgres abierto lo escanean bots todo el día. La clave del túnel está
  restringida en el servidor a reenviar ese puerto y nada más: no abre shell.

  Lo que esto implica y hay que tener presente SIEMPRE: con el túnel abierto,
  `npm run dev` escribe en la base de verdad. Una venta de prueba es una venta.
- **Los scripts de base van a donde apunte `DATABASE_URL`.** `scripts/lib/base.ts`
  usa la misma regla que la app: si la variable está definida (leyendo `.env.local`
  y `.env` a mano, porque un script lanzado con `node` no pasa por Next), conecta
  a ese Postgres; si no, a PGlite. **Siempre imprime a qué base va antes de tocar
  nada** — la primera línea de la salida es `Base: …`, y si no la leíste no sabés
  qué estás por modificar.
- **Escribir en producción pide `--prod` aparte.** `db:catalogo` borra todo lo que
  no generó dentro de `RUBROS_PROPIOS` y `db:limpiar --aplicar` borra productos:
  contra producción eso no se deshace y no hay backup del que tirar. Por eso el
  freno corta **antes de conectar** —ni siquiera corre las migraciones— y por eso
  son dos banderas y no una: "quiero escribir" y "sé que es producción" son dos
  decisiones distintas. Sin `--aplicar` contra producción el script sólo lee y ni
  migra.
- **El catálogo se lleva a producción con `db:sincronizar`, no con el
  importador.** `db:importar` sale a buscar a catálogos ajenos que cambian y
  vuelve a meter lo que ya se podó: contra prod no da lo mismo. Lo que hay que
  llevar es el estado aprobado, no repetir el proceso que lo produjo. El script
  no borra nada y sólo completa campos en `null`, así que un precio cargado
  desde el celular le gana al catálogo de referencia.
- **El escaneo cobraba el código como precio.** Hasta el 2026-11-09, un código
  que no estaba cargado caía al monto suelto y metía un renglón "Varios" de
  miles de millones de pesos, sin error. Pasaba seguido porque de los productos
  con precio de venta la mayoría todavía no tiene código. Dos redes ahora:
  `pareceCodigoDeBarras()` corta el camino antes, y `TOPE_SUELTO` en
  `Mostrador.tsx` rechaza un renglón de más de $1.000.000.
- **Una función de `stock.ts` en un componente de cliente rompe el build.**
  `stock.ts` importa `src/db/client.ts`, así que traer de ahí una FUNCIÓN (no un
  tipo) arrastra el driver de Postgres al bundle del navegador y el build muere
  con `module not found`. Un `import type` se borra en compilación y no pasa
  nada; un import normal, sí. Por eso los helpers de código de barras viven en
  `src/lib/codigos.ts`, que no depende de nada.
- **Una `DATABASE_URL` VACÍA en el entorno le gana al `.env.local`.** Esta
  máquina trae `DATABASE_URL` y `DIRECT_URL` definidas pero vacías, y Next NO
  pisa lo que ya está en `process.env`: los `.env*` sólo rellenan lo ausente.
  Resultado: la cadena vacía gana, `src/db/client.ts` la ve falsy y cae a
  PGlite. **No hay ningún error** — las dos bases tienen el mismo schema, así
  que la app anda perfecto con los datos equivocados. El 2026-11-09 nos hizo
  leer números de la base local creyendo que eran de producción. Por eso
  `npm run dev` pasa por [scripts/dev.mjs](scripts/dev.mjs), que borra esas
  variables si están vacías, y por eso la app imprime `[base] conectado a …`
  al arrancar. **Si no leíste esa línea, no sabés contra qué estás trabajando.**
- **El túnel se corta solo y no avisa.** Pasó con `Connection reset by peer`
  después de un rato quieto. `npm run tunel` ahora manda latido cada 30 s y se
  vuelve a levantar solo, avisando en pantalla mientras está caído. Igual, la
  verdad la dice el log `[base]` de la app, no el túnel.
- **Los ids se validan contra un regex de UUID** antes de ir a la base: sin eso,
  una URL con basura sale como 500 en vez de 404.

## Idioma

Todo en castellano rioplatense: nombres de tablas, columnas, funciones,
variables, comentarios y textos de pantalla. No mezclar con inglés.
