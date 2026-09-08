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

**El precio sugerido se redondea a los $100 más cercanos.** Nadie cobra $4.357
ni tiene monedas para ese vuelto. `redondearPrecio()` va al múltiplo de $100
más cercano, para los dos lados: $480 y $510 son los dos $500, y $5.235 es
$5.200.

Al **más cercano** y no para arriba (regla de Agus, 2026-09-08). Forzar para
arriba defiende el margen al centavo pero empuja $510 a $600 —18% más caro por
nada—, y en la góndola el precio lo termina fijando lo que cobra el de la otra
cuadra, no la calculadora. Un paso único de $100 en vez de escalones por
tamaño, por la misma razón: es la regla que se puede decir en una frase.

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
el dígito verificador del EAN (`codigoValido()` en `src/lib/stock.ts`) antes de
guardarse. Un código equivocado no falla ruidosamente: escanea y trae otro
producto, que es peor que no tenerlo. Por lo mismo, cuando `db:importar`
encuentra más de un producto que podría corresponder a un EAN, **no elige
ninguno**: lo reporta y sigue.

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
- **Los ids se validan contra un regex de UUID** antes de ir a la base: sin eso,
  una URL con basura sale como 500 en vez de 404.

## Idioma

Todo en castellano rioplatense: nombres de tablas, columnas, funciones,
variables, comentarios y textos de pantalla. No mezclar con inglés.
