import {
  bigint,
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * El fiado se lleva como libro mayor: no existe un campo "saldo" que se pise.
 * El saldo de un cliente es siempre la suma de sus movimientos, así cualquier
 * número que muestre la app se puede explicar fila por fila.
 */

export const tipoMovimiento = pgEnum("tipo_movimiento", ["fiado", "pago"]);

/**
 * Por dónde entró o salió la plata. Son tres cajas distintas de verdad: la
 * plata del cajón, la de Mercado Pago y la del banco. Sin separarlas, "quedó
 * $300.000" no dice cuánto hay para pagarle al proveedor que viene mañana.
 */
export const medioPago = pgEnum("medio_pago", [
  "efectivo",
  "mercadopago",
  "banco",
]);
export const origenMovimiento = pgEnum("origen_movimiento", ["audio", "manual"]);

/**
 * Cada audio deja su nota, se confirme o no. Si dictaste algo y después
 * descartaste la propuesta, lo que dijiste sigue estando: es el papelito del
 * mostrador, y perderlo es perder la única prueba de qué se anotó.
 */
export const notas = pgTable("notas", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** lo que devolvió Whisper, crudo */
  transcripcion: text("transcripcion").notNull(),
  /** quedó en true cuando de esa nota salió al menos un movimiento */
  aplicada: boolean("aplicada").notNull().default(false),
  creadoEn: timestamp("creado_en", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const clientes = pgTable(
  "clientes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nombre: text("nombre").notNull(),
    /** nombre normalizado (sin acentos, minúsculas) para buscar y deduplicar */
    nombreNormalizado: text("nombre_normalizado").notNull(),
    telefono: text("telefono"),
    nota: text("nota"),
    archivadoEn: timestamp("archivado_en", { withTimezone: true }),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("clientes_nombre_normalizado_key").on(t.nombreNormalizado)],
);

export const movimientos = pgTable(
  "movimientos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    clienteId: uuid("cliente_id")
      .notNull()
      .references(() => clientes.id, { onDelete: "restrict" }),
    tipo: tipoMovimiento("tipo").notNull(),
    /**
     * Siempre positivo y en centavos. Entero, nunca float: 0.1 + 0.2 no da 0.3
     * y con plata ajena eso no se negocia. El signo lo da `tipo`.
     */
    montoCentavos: bigint("monto_centavos", { mode: "number" }).notNull(),
    /**
     * `true` cuando alguien dijo el total ("le fié tres mil"). `false` cuando el
     * total salió de sumar los ítems. La diferencia importa: si el total lo dijo
     * una persona, un ítem sin precio ya está cubierto; si no, esa línea no está
     * cobrada y hay que avisarlo.
     */
    totalDeclarado: boolean("total_declarado").notNull().default(true),
    nota: text("nota"),
    fecha: date("fecha").notNull(),
    /**
     * Por dónde entró el pago. Sólo significa algo cuando `tipo` es "pago": un
     * fiado no mueve plata. Los que entran por audio quedan en efectivo, que es
     * como se paga en el mostrador; si fue por otro lado, se anula y se recarga.
     */
    medio: medioPago("medio").notNull().default("efectivo"),
    origen: origenMovimiento("origen").notNull().default("manual"),
    /** la nota de voz de la que salió este movimiento */
    notaId: uuid("nota_id").references(() => notas.id, { onDelete: "set null" }),
    /**
     * @deprecated La transcripción vive en `notas`. Esta columna queda por los
     * movimientos cargados antes de que existiera esa tabla; no se escribe más.
     */
    transcripcion: text("transcripcion"),
    anuladoEn: timestamp("anulado_en", { withTimezone: true }),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("movimientos_cliente_idx").on(t.clienteId),
    index("movimientos_fecha_idx").on(t.fecha),
    index("movimientos_nota_idx").on(t.notaId),
  ],
);

/**
 * Lo que se llevó, línea por línea. El precio es opcional a propósito: en el
 * mostrador muchas veces se anota "dos gaseosas y pan" y el precio se pone
 * después, o nunca porque ya se dijo el total.
 */
export const items = pgTable(
  "items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    movimientoId: uuid("movimiento_id")
      .notNull()
      .references(() => movimientos.id, { onDelete: "cascade" }),
    /**
     * Puede faltar: en el mostrador a veces se anota sólo el monto, sin decir
     * qué se llevó. Descartar ese renglón sería perder plata en silencio.
     */
    descripcion: text("descripcion"),
    cantidad: integer("cantidad").notNull().default(1),
    precioUnitarioCentavos: bigint("precio_unitario_centavos", {
      mode: "number",
    }),
    /** para conservar el orden en que se dictaron */
    posicion: integer("posicion").notNull().default(0),
  },
  (t) => [index("items_movimiento_idx").on(t.movimientoId)],
);

export type Nota = typeof notas.$inferSelect;
export type Cliente = typeof clientes.$inferSelect;
export type Movimiento = typeof movimientos.$inferSelect;
export type NuevoMovimiento = typeof movimientos.$inferInsert;
export type Item = typeof items.$inferSelect;

/* ────────────────────────────────────────────────────────────────────────────
 * El otro libro: la plata del negocio.
 *
 * El fiado de arriba responde "quién me debe". Esto responde "cómo me fue hoy":
 * lo que vendí, lo que compré, lo que gasté. Son dos libros separados a
 * propósito —un fiado no es plata que entró, es plata que salió a la calle—
 * pero se cruzan en la pantalla del día, porque cuando un cliente paga su
 * cuenta esa plata sí entra a la caja.
 *
 * Mismas reglas que el fiado, sin excepciones: centavos enteros en `bigint`,
 * nada se borra (`anulado_en`), y ningún total se guarda: se suma al leer.
 * ────────────────────────────────────────────────────────────────────────── */

/**
 * En qué se va la plata que no es mercadería. `retiro` es lo que saca el dueño
 * para él: no es un gasto del kiosco, pero si no se anota el día nunca cierra y
 * uno termina buscando un faltante que no existe.
 */
/**
 * En qué se mide lo que trae un bulto. Un pack de gaseosa trae 6 unidades; una
 * bolsa de yerba trae 1000 gramos. Sin esto, "1000" no se puede leer.
 */
export const unidadMedida = pgEnum("unidad_medida", ["un", "gr", "ml"]);

/**
 * Cómo viene envasado.
 *
 * NO es una categoría, y la diferencia importa: un producto es de UN rubro pero
 * viene en VARIOS envases. La Coca es gaseosa siempre, y hay lata, retornable y
 * descartable. Si "lata" fuera categoría, al cargar la Coca en lata habría que
 * elegir entre "gaseosas" y "latas", y se pierde una de las dos.
 */
export const tipoEnvase = pgEnum("tipo_envase", [
  "botella",
  "retornable",
  "lata",
  "tetra",
  "otro",
]);

export const categoriaGasto = pgEnum("categoria_gasto", [
  "alquiler",
  "servicios",
  "sueldos",
  "impuestos",
  "fletes",
  "mantenimiento",
  "retiro",
  "otros",
]);

/**
 * Las sucursales del kiosco.
 *
 * Existe por una sola razón concreta: cada local cobra con SU cuenta de Mercado
 * Pago, y el QR impreso que está pegado en cada mostrador pertenece a esa
 * cuenta. Una venta cobrada en un local no puede acreditarse en la otra.
 *
 * Por ahora alcanza con eso y NO scopea el resto: el stock, las compras y el
 * fiado siguen siendo del kiosco entero. Partirlos por sucursal es un cambio
 * mucho más grande —y que nadie pidió todavía— que se puede hacer después
 * agregando `sucursal_id` donde haga falta.
 */
export const sucursales = pgTable(
  "sucursales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nombre: text("nombre").notNull(),
    nombreNormalizado: text("nombre_normalizado").notNull(),

    /*
     * La conexión con Mercado Pago, por OAuth.
     *
     * Es OAuth y no un token pegado a mano porque son DOS cuentas distintas:
     * una variable de entorno sólo puede guardar una, y la que vence o se
     * revoca hay que volver a pegarla a mano en el servidor. Con OAuth el
     * dueño aprieta "conectar" en cada sucursal y el token se renueva solo.
     *
     * El `access_token` es una credencial viva: quien la tiene puede cobrar y
     * ver los movimientos de esa cuenta. No sale nunca al navegador — se usa
     * sólo del lado del servidor.
     */
    mpAccessToken: text("mp_access_token"),
    mpRefreshToken: text("mp_refresh_token"),
    mpTokenVenceEn: timestamp("mp_token_vence_en", { withTimezone: true }),
    /** el id del vendedor en Mercado Pago; va en la URL al crear la sucursal allá */
    mpUserId: text("mp_user_id"),

    /*
     * La caja de Mercado Pago: la sucursal y el punto de venta creados por API
     * del otro lado, y el QR que sale de ahí.
     *
     * `mpExternalPosId` es el que elegimos nosotros y el que viaja en cada
     * orden. Se guarda porque es la llave con la que Mercado Pago decide a qué
     * QR impreso le llega el monto: perderlo es perder el vínculo con el papel
     * que está pegado en la pared.
     */
    mpStoreId: text("mp_store_id"),
    mpPosId: text("mp_pos_id"),
    mpExternalPosId: text("mp_external_pos_id"),
    /** la imagen del QR para imprimir, tal como la devuelve Mercado Pago */
    mpQrImagen: text("mp_qr_imagen"),

    archivadoEn: timestamp("archivado_en", { withTimezone: true }),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("sucursales_nombre_normalizado_key").on(t.nombreNormalizado),
  ],
);

export type Sucursal = typeof sucursales.$inferSelect;

/** Cómo se lo lleva: lo pasa a buscar o se lo mandan. */
export const tipoEntrega = pgEnum("tipo_entrega", ["retiro", "envio"]);

/**
 * En qué anda un pedido de la tienda. Es una fila, no un campo que se pisa:
 * `nuevo` es el que todavía nadie miró, y ese es el único que importa que se
 * vea de lejos.
 */
export const estadoPedido = pgEnum("estado_pedido", [
  "nuevo",
  "preparando",
  "listo",
  "entregado",
  "cancelado",
]);

/**
 * Un pedido que entró por la tienda.
 *
 * NO es una venta: la venta se anota cuando la plata entra, y acá todavía no
 * entró nada. Son dos cosas distintas y por eso son dos tablas — un pedido se
 * puede cancelar, se puede no retirar nunca, y hasta que eso se resuelva no
 * tiene por qué ensuciar la caja del día.
 *
 * Lo carga alguien de la calle, sin PIN. Por eso todo lo que entra acá es
 * texto que escribió un desconocido: se guarda, se muestra, y no se usa para
 * nada más.
 */
export const pedidos = pgTable(
  "pedidos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /**
     * El número que se le canta al cliente ("pedido 47"). Un uuid no se puede
     * decir por teléfono, y la fecha más la hora tampoco distingue dos pedidos
     * del mismo minuto.
     */
    numero: integer("numero").notNull().generatedAlwaysAsIdentity({ startWith: 1 }),
    nombre: text("nombre").notNull(),
    telefono: text("telefono").notNull(),
    entrega: tipoEntrega("entrega").notNull().default("retiro"),
    /** sólo cuando es envío */
    direccion: text("direccion"),
    nota: text("nota"),
    /**
     * El total, congelado al momento del pedido. Igual que en una venta: el
     * precio de la góndola cambia, y un pedido de ayer tiene que seguir
     * diciendo lo que se le cotizó ayer.
     */
    totalCentavos: bigint("total_centavos", { mode: "number" }).notNull(),
    estado: estadoPedido("estado").notNull().default("nuevo"),
    /** la venta que salió de este pedido, cuando se cobró */
    ventaId: uuid("venta_id").references(() => ventas.id, {
      onDelete: "set null",
    }),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("pedidos_estado_idx").on(t.estado),
    index("pedidos_creado_idx").on(t.creadoEn),
  ],
);

export const pedidosItems = pgTable(
  "pedidos_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pedidoId: uuid("pedido_id")
      .notNull()
      .references(() => pedidos.id, { onDelete: "cascade" }),
    productoId: uuid("producto_id").references(() => productos.id, {
      onDelete: "set null",
    }),
    /** el nombre tal como estaba al pedirlo; queda aunque el producto se archive */
    descripcion: text("descripcion").notNull(),
    cantidad: integer("cantidad").notNull().default(1),
    precioUnitarioCentavos: bigint("precio_unitario_centavos", {
      mode: "number",
    }).notNull(),
    posicion: integer("posicion").notNull().default(0),
  },
  (t) => [index("pedidos_items_pedido_idx").on(t.pedidoId)],
);

export type Pedido = typeof pedidos.$inferSelect;
export type PedidoItem = typeof pedidosItems.$inferSelect;

export const proveedores = pgTable(
  "proveedores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nombre: text("nombre").notNull(),
    /** mismo truco que en clientes: sin acentos y en minúsculas, para no duplicar */
    nombreNormalizado: text("nombre_normalizado").notNull(),
    telefono: text("telefono"),
    nota: text("nota"),
    archivadoEn: timestamp("archivado_en", { withTimezone: true }),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("proveedores_nombre_normalizado_key").on(t.nombreNormalizado),
  ],
);

/**
 * Lo que entró de mercadería. Dos fechas distintas a propósito:
 *
 * - `fecha` es cuándo llegó el pedido.
 * - `pagadoEn` es cuándo saliste la plata. Si está en null, esa compra todavía
 *   se la debés al proveedor y NO toca la caja de ningún día.
 *
 * Separarlas es lo que hace que el balance del día diga la verdad: la mercadería
 * que te dejaron el martes y pagás el viernes es plata que sale el viernes.
 */
export const compras = pgTable(
  "compras",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proveedorId: uuid("proveedor_id")
      .notNull()
      .references(() => proveedores.id, { onDelete: "restrict" }),
    /** Siempre positivo y en centavos, igual que en movimientos. */
    montoCentavos: bigint("monto_centavos", { mode: "number" }).notNull(),
    /**
     * `true` cuando el total lo dice la factura. `false` cuando salió de sumar
     * los renglones. Misma distinción que en el fiado: con `false` y renglones
     * sin precio, ese total todavía no es el total.
     */
    totalDeclarado: boolean("total_declarado").notNull().default(true),
    fecha: date("fecha").notNull(),
    /**
     * Lo que el proveedor descontó de toda la factura, y por qué.
     *
     * `monto_centavos` ya viene NETO —es lo que salió de la caja— así que esto
     * no cambia ninguna cuenta: está para poder contestar "¿por qué este mes
     * la Coca salió más barata?" tres meses después. Sin la nota, un costo que
     * bajó de golpe parece un error de carga.
     */
    descuentoCentavos: bigint("descuento_centavos", { mode: "number" }),
    descuentoNota: text("descuento_nota"),
    /** null = impaga, se le debe al proveedor */
    pagadoEn: date("pagado_en"),
    /** con qué se le pagó. Va junto con `pagadoEn`: sin pago no hay medio. */
    medio: medioPago("medio"),
    /**
     * Si la compra vino con factura. Cambia el costo real: cuando se compra en
     * blanco el mayorista factura + IVA, así que lo que sale de verdad cada
     * unidad es el importe por 1,21. En negro, el importe es el costo.
     *
     * Arranca en `false` a propósito: las compras cargadas antes de que esto
     * existiera no declararon nada, y ponerles IVA por default les cambiaría el
     * costo a todas de un día para el otro sin que nadie lo haya dicho.
     */
    enBlanco: boolean("en_blanco").notNull().default(false),
    /** número de factura o remito, para poder buscar el papel */
    comprobante: text("comprobante"),
    nota: text("nota"),
    anuladoEn: timestamp("anulado_en", { withTimezone: true }),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("compras_proveedor_idx").on(t.proveedorId),
    index("compras_fecha_idx").on(t.fecha),
    index("compras_pagado_idx").on(t.pagadoEn),
  ],
);

/**
 * El detalle de una compra, renglón por renglón.
 *
 * Acá el fiado y la compra se parecen pero NO son lo mismo, y por eso el
 * renglón se guarda distinto. Al cliente le vendés una unidad y sabés el precio
 * de esa unidad. Al proveedor le comprás un pack: la factura dice "3 packs de
 * gaseosa, $36.000", y el precio por unidad no está escrito en ningún lado.
 *
 * Entonces lo que se guarda es lo que dice el papel —cuántos bultos, cuántas
 * unidades trae cada uno, y cuánta plata— y el costo por unidad se CALCULA al
 * mostrarlo. Guardarlo redondeado sería peor que no tenerlo: $36.000 entre 3
 * packs de 6 da $2.000, pero entre 7 unidades no da un número redondo, y ese
 * resto multiplicado por la cantidad deja de sumar lo que de verdad pagaste.
 *
 * `unidadesPorBulto` es además lo que va a necesitar el stock cuando exista:
 * un pack que entra son N unidades para vender.
 */
/**
 * Con qué se pagó una compra. Una fila por medio.
 *
 * Existe porque al proveedor se le paga como se puede: la mitad en efectivo y
 * el resto por transferencia es lo normal, no la excepción. Con un solo
 * `compras.medio` había que elegir uno y mentir, y la caja del día terminaba
 * diciendo que salió de un lado plata que salió de otro.
 *
 * La suma de estas filas TIENE que dar el total de la compra: si no, la caja
 * deja de cerrar. Eso lo valida `registrarCompra`.
 *
 * `compras.medio` sigue existiendo para las compras cargadas antes de esto.
 * Al leer, si una compra no tiene filas acá se usa aquel medio único.
 */
export const comprasPagos = pgTable(
  "compras_pagos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    compraId: uuid("compra_id")
      .notNull()
      .references(() => compras.id, { onDelete: "cascade" }),
    medio: medioPago("medio").notNull(),
    /** siempre positivo y en centavos */
    importeCentavos: bigint("importe_centavos", { mode: "number" }).notNull(),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("compras_pagos_compra_idx").on(t.compraId),
    // Un medio por compra: dos filas de "efectivo" son la misma plata contada
    // dos veces, y sumarlas da un total que no existió.
    uniqueIndex("compras_pagos_compra_medio_key").on(t.compraId, t.medio),
  ],
);

export type CompraPago = typeof comprasPagos.$inferSelect;

export const comprasItems = pgTable(
  "compras_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    compraId: uuid("compra_id")
      .notNull()
      .references(() => compras.id, { onDelete: "cascade" }),
    descripcion: text("descripcion"),
    /**
     * Con qué producto del catálogo engancha este renglón. Es lo que hace que
     * la lista de reposición se llene sola: si falta, el renglón igual vale
     * como plata, sólo que no alimenta el catálogo.
     */
    productoId: uuid("producto_id").references(() => productos.id, {
      onDelete: "set null",
    }),
    /** cuántos bultos entraron (packs, cajas, bolsas… o unidades sueltas) */
    cantidad: integer("cantidad").notNull().default(1),
    /** cuánto trae cada bulto, medido en `unidad`; 1 si se compra suelto */
    unidadesPorBulto: integer("unidades_por_bulto").notNull().default(1),
    /** en qué se mide lo de arriba: unidades, gramos o mililitros */
    unidad: unidadMedida("unidad").notNull().default("un"),
    /**
     * Lo que se pagó por TODO el renglón, en centavos. Puede faltar: a veces
     * llega el remito sin precios y la factura viene después.
     */
    importeCentavos: bigint("importe_centavos", { mode: "number" }),
    /**
     * El descuento de ESTE renglón, y por qué. La promo suele ser de un
     * producto —"dos por uno en Manaos"— y no de la factura entera.
     *
     * `importe_centavos` sigue siendo lo que dice el renglón en bruto. El costo
     * por unidad sale de restarle esto: es lo que de verdad pagaste por esa
     * mercadería, y por lo tanto sobre lo que se calcula el margen.
     */
    descuentoCentavos: bigint("descuento_centavos", { mode: "number" }),
    descuentoNota: text("descuento_nota"),
    posicion: integer("posicion").notNull().default(0),
  },
  (t) => [index("compras_items_compra_idx").on(t.compraId)],
);

export const gastos = pgTable(
  "gastos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoria: categoriaGasto("categoria").notNull().default("otros"),
    montoCentavos: bigint("monto_centavos", { mode: "number" }).notNull(),
    descripcion: text("descripcion"),
    fecha: date("fecha").notNull(),
    medio: medioPago("medio").notNull().default("efectivo"),
    anuladoEn: timestamp("anulado_en", { withTimezone: true }),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("gastos_fecha_idx").on(t.fecha)],
);

/**
 * Lo que se vendió. Hoy es un renglón por carga —el total del turno o del día—
 * y no uno por ticket. Que sea un libro mayor y no una fila por fecha es lo que
 * permite anotar mañana y tarde por separado, corregir anulando en vez de
 * pisar, y el día que se carguen las ventas una por una, que entren en esta
 * misma tabla sin migrar nada: el total del día sigue siendo la suma.
 */
export const ventas = pgTable(
  "ventas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    montoCentavos: bigint("monto_centavos", { mode: "number" }).notNull(),
    /**
     * `true` cuando alguien tecleó el total ("vendí $40.000 en la mañana").
     * `false` cuando salió de sumar el carrito. Misma distinción que en fiado y
     * en compras: con `false`, el total es una consecuencia de los renglones y
     * cambiarlo a mano sería pisar la cuenta que los explica.
     */
    totalDeclarado: boolean("total_declarado").notNull().default(true),
    /**
     * A nombre de quién fue la venta. Opcional y casi siempre null: en el
     * mostrador nadie pide el nombre para vender un chicle.
     *
     * Sirve cuando sí importa —el que encarga, el que se lleva el pedido
     * grande, el que después reclama— y es lo que deja ver qué compra cada
     * cliente sin obligar a cargarlo todas las veces. NO lo convierte en
     * fiado: eso sigue siendo un movimiento aparte, con su deuda.
     */
    clienteId: uuid("cliente_id").references(() => clientes.id, {
      onDelete: "set null",
    }),
    /** en qué local se vendió; null en las ventas anteriores a las sucursales */
    sucursalId: uuid("sucursal_id").references(() => sucursales.id, {
      onDelete: "set null",
    }),
    /**
     * Cuándo quedó esperando que el cliente pague el QR. `null` es lo normal:
     * la venta ya está cobrada.
     *
     * Null significa "cobrada" —y no al revés— para que las miles de ventas que
     * ya existen sigan siendo correctas sin tocarlas: una columna nueva nace en
     * null, y en null quieren decir justo lo que son.
     *
     * Mientras tenga fecha, esta venta NO toca la caja del día. Misma regla que
     * una compra impaga: la plata todavía no se movió, y contarla sería decir
     * que hay en el cajón algo que no está.
     */
    pendienteEn: timestamp("pendiente_en", { withTimezone: true }),
    /** la orden de Mercado Pago que está esperando; null si no se cobró por QR */
    mpOrderId: text("mp_order_id"),
    nota: text("nota"),
    fecha: date("fecha").notNull(),
    medio: medioPago("medio").notNull().default("efectivo"),
    anuladoEn: timestamp("anulado_en", { withTimezone: true }),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("ventas_fecha_idx").on(t.fecha),
    index("ventas_cliente_idx").on(t.clienteId),
    // La caja del día filtra por esto en cada lectura: sin índice, cada
    // pantalla recorre la tabla entera de ventas.
    index("ventas_pendiente_idx").on(t.pendienteEn),
    uniqueIndex("ventas_mp_order_key").on(t.mpOrderId),
  ],
);

/**
 * El carrito: qué se llevó el cliente en ESA venta.
 *
 * Es opcional. El kiosco sigue pudiendo anotar "vendí $40.000 hoy" sin detalle
 * —así se cargó siempre y es lo que se hace al cerrar el día—, pero cuando se
 * cobra producto por producto esto guarda el detalle, y con eso aparecen dos
 * cosas que el total suelto no puede dar: qué se vende de verdad, y cuánto se
 * ganó (el costo de cada unidad ya vive en las compras).
 *
 * `producto_id` puede ser null: se vende cosas que no están en el catálogo y
 * frenar la venta por eso sería dejar de cobrar.
 */
export const ventasItems = pgTable(
  "ventas_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ventaId: uuid("venta_id")
      .notNull()
      .references(() => ventas.id, { onDelete: "cascade" }),
    productoId: uuid("producto_id").references(() => productos.id, {
      onDelete: "set null",
    }),
    /** lo que se escribió; queda aunque después se archive el producto */
    descripcion: text("descripcion"),
    cantidad: integer("cantidad").notNull().default(1),
    /**
     * A cuánto se vendió UNA unidad, en ese momento.
     *
     * Se copia del producto al cobrar y NO se lee después: el precio de la
     * góndola cambia, y una venta de marzo tiene que seguir diciendo lo que se
     * cobró en marzo. Leerlo del catálogo reescribiría la historia cada vez
     * que alguien actualiza un precio.
     */
    precioUnitarioCentavos: bigint("precio_unitario_centavos", {
      mode: "number",
    }).notNull(),
    /**
     * Lo que costaba esa unidad cuando se vendió, con IVA. Es lo que convierte
     * la venta en ganancia sin tener que reconstruirla desde las compras.
     * Puede faltar: si el producto nunca se compró por la app, no hay costo.
     */
    costoUnitarioCentavos: bigint("costo_unitario_centavos", {
      mode: "number",
    }),
    posicion: integer("posicion").notNull().default(0),
  },
  (t) => [
    index("ventas_items_venta_idx").on(t.ventaId),
    index("ventas_items_producto_idx").on(t.productoId),
  ],
);

/**
 * Con qué pagó el cliente. Una fila por medio, igual que en las compras.
 *
 * El que paga la mitad con efectivo y la mitad con transferencia existe de los
 * dos lados del mostrador. Sin esto, la caja del día dice que entró por una
 * caja plata que entró por otra. `ventas.medio` queda para las ventas viejas y
 * para el caso de un solo medio.
 */
export const ventasPagos = pgTable(
  "ventas_pagos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ventaId: uuid("venta_id")
      .notNull()
      .references(() => ventas.id, { onDelete: "cascade" }),
    medio: medioPago("medio").notNull(),
    importeCentavos: bigint("importe_centavos", { mode: "number" }).notNull(),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("ventas_pagos_venta_idx").on(t.ventaId),
    uniqueIndex("ventas_pagos_venta_medio_key").on(t.ventaId, t.medio),
  ],
);

export type VentaItem = typeof ventasItems.$inferSelect;
export type VentaPago = typeof ventasPagos.$inferSelect;

export type Proveedor = typeof proveedores.$inferSelect;
export type Compra = typeof compras.$inferSelect;
export type CompraItem = typeof comprasItems.$inferSelect;
export type Gasto = typeof gastos.$inferSelect;
export type Venta = typeof ventas.$inferSelect;
export type CategoriaGasto = (typeof categoriaGasto.enumValues)[number];
export type MedioPago = (typeof medioPago.enumValues)[number];

/**
 * El rubro. Se acomoda en dos niveles con `padre_id`: "Bebidas" arriba y
 * "Gaseosas" adentro. Una sola tabla en vez de dos porque son la misma cosa a
 * distinta altura, y así agregar un nivel más el día de mañana no es una
 * migración nueva.
 */
export const categorias = pgTable(
  "categorias",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nombre: text("nombre").notNull(),
    nombreNormalizado: text("nombre_normalizado").notNull(),
    /** null = es una categoría de primer nivel */
    padreId: uuid("padre_id"),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("categorias_nombre_normalizado_key").on(t.nombreNormalizado),
    index("categorias_padre_idx").on(t.padreId),
  ],
);

/**
 * La marca: Coca-Cola, Lays, Arcor. Agrupa productos que son la misma cosa en
 * distintos tamaños. Es OPCIONAL a propósito —el pan no tiene marca— y por eso
 * `productos.marca_id` es nullable.
 */
export const marcas = pgTable(
  "marcas",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nombre: text("nombre").notNull(),
    nombreNormalizado: text("nombre_normalizado").notNull(),
    archivadoEn: timestamp("archivado_en", { withTimezone: true }),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("marcas_nombre_normalizado_key").on(t.nombreNormalizado)],
);

/**
 * El catálogo de lo que se vende. NO es un inventario: no lleva cuántas
 * unidades hay, porque para eso habría que cargar cada venta una por una y una
 * cuenta que nadie actualiza miente peor que no tenerla.
 *
 * Lo que sí lleva es lo que se usa para reponer: a quién se le compra, a cuánto
 * salió la última vez, y si falta. Y se llena solo: cada renglón de compra que
 * tenga nombre engancha con su producto, así la lista aparece sin que nadie se
 * siente a cargarla.
 */
export const productos = pgTable(
  "productos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    nombre: text("nombre").notNull(),
    nombreNormalizado: text("nombre_normalizado").notNull(),
    /** a quién se le suele comprar; lo escribe la última compra */
    proveedorId: uuid("proveedor_id").references(() => proveedores.id, {
      onDelete: "set null",
    }),
    /** opcional: el pan no tiene marca, la Coca sí */
    marcaId: uuid("marca_id").references(() => marcas.id, {
      onDelete: "set null",
    }),
    /** apunta a la subcategoría; el padre de esa da la categoría */
    categoriaId: uuid("categoria_id").references(() => categorias.id, {
      onDelete: "set null",
    }),
    /** cómo viene envasado; es otro eje distinto del rubro */
    envase: tipoEnvase("envase"),
    /**
     * El EAN del envase. Se carga escaneando: casi todos los lectores USB
     * escriben los dígitos como si fueran un teclado, así que enfocar el campo
     * y pasar el producto lo completa de una y sin errores.
     *
     * NO se completa de internet. Un código equivocado no falla: escanea y
     * trae otro producto, que es peor que no tenerlo.
     */
    codigoBarras: text("codigo_barras"),
    /**
     * La foto del envase. Es un link a la CDN del supermercado de donde salió
     * el producto, no una copia: reconocer algo de un vistazo vale, guardar
     * cientos de fotos ajenas en el repo no.
     *
     * Si el link se rompe, la fila se dibuja sin imagen y nada más. La app no
     * depende de esto para funcionar.
     */
    imagenUrl: text("imagen_url"),
    /**
     * Cuánto trae UNA unidad de venta: la botella de Coca son 2250 ml, el
     * paquete de papas 120 gr.
     *
     * Es lo que hace comparables dos tamaños de la misma marca. Sin esto, la
     * Coca de 2,25 L a $3.000 y la de 500 ml a $1.200 son dos precios sueltos;
     * con esto son $1.333 y $2.400 el litro, y ahí se ve cuál conviene.
     */
    contenido: integer("contenido"),
    /** en qué se mide el contenido de arriba */
    contenidoUnidad: unidadMedida("contenido_unidad"),
    /**
     * A cuánto se vende una unidad. Es lo único que convierte el costo en un
     * margen de verdad: sin esto la app sólo puede sugerir un precio, no decir
     * cuánto estás ganando.
     */
    precioVentaCentavos: bigint("precio_venta_centavos", { mode: "number" }),
    /**
     * Por cuánto multiplicar el costo para sugerir el precio de ESTE producto,
     * en milésimas: 1400 es 1,4.
     *
     * En null usa el 1,4 general. Queda nullable a propósito y no con
     * `default 1400`: así se distingue "nunca lo toqué" de "decidí que sea
     * 1,4", y el día que el general cambie, los que nadie ajustó lo siguen.
     * Con un default en la columna, ese cambio no llegaría a ninguno.
     *
     * La bebida se vende con menos margen que la golosina, y el cigarrillo con
     * casi nada: un solo número para todo el kiosco no existe.
     */
    multiplicadorMilesimas: integer("multiplicador_milesimas"),
    /**
     * Cuánto más sale pagándolo con algo que no sea efectivo, en milésimas:
     * 1100 es un 10% arriba. En null no tiene recargo, que es lo normal.
     *
     * Existe porque hay cosas —el cigarrillo es el caso— que se venden con un
     * margen tan finito que la comisión de la tarjeta se come la ganancia
     * entera. El kiosco lo resuelve con dos precios, y la app tenía uno solo:
     * cobrando el de efectivo con tarjeta se pierde plata en cada venta, y
     * cobrando el de tarjeta en efectivo se cobra de más.
     *
     * Va en el producto y no como un número global porque es de unos pocos:
     * aplicárselo a todo sería cobrarle un recargo a la gaseosa que no lo
     * tiene.
     */
    recargoMilesimas: integer("recargo_milesimas"),
    /** marcado a mano cuando se ve el hueco en la góndola */
    falta: boolean("falta").notNull().default(false),
    archivadoEn: timestamp("archivado_en", { withTimezone: true }),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("productos_nombre_normalizado_key").on(t.nombreNormalizado),
    // Postgres deja repetir NULL en un índice único, así que los que todavía
    // no tienen código conviven sin pelearse.
    uniqueIndex("productos_codigo_barras_key").on(t.codigoBarras),
    index("productos_falta_idx").on(t.falta),
  ],
);

export type Categoria = typeof categorias.$inferSelect;
export type Marca = typeof marcas.$inferSelect;
export type Producto = typeof productos.$inferSelect;

/**
 * ── Reposiciones: el pedido que se le canta al proveedor ──────────────────
 *
 * Lo que se anota ANTES de que la mercadería llegue: cuántos bultos de qué, y
 * a cuánto cada uno si el proveedor ya cantó el precio.
 *
 * Tabla aparte de `compras` a propósito, y la razón es el costo. El costo de
 * referencia de un producto sale de su última compra (`costoDeReferencia()`),
 * así que meter acá un pedido con precios ESTIMADOS —o sin precio— haría que
 * el catálogo entero empiece a calcular márgenes contra números que nadie
 * pagó todavía. Y no avisaría: los precios sugeridos saldrían mal y la pantalla
 * se vería igual.
 *
 * Cuando la mercadería llega, la reposición se cierra y se carga la compra con
 * los importes del papel. `cerradaEn` guarda cuándo pasó eso para que no
 * aparezca dos veces en la lista de pendientes.
 */
export const reposiciones = pgTable(
  "reposiciones",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proveedorId: uuid("proveedor_id")
      .notNull()
      .references(() => proveedores.id, { onDelete: "restrict" }),
    /**
     * Si se va a comprar en blanco. Se decide ACÁ y no al cargar la compra
     * porque cambia el precio sugerido que se mira mientras se arma el pedido:
     * en blanco el costo real es el importe por 1,21.
     */
    enBlanco: boolean("en_blanco").notNull().default(false),
    nota: text("nota"),
    /** cuándo se convirtió en compra; null = todavía es un pedido abierto */
    cerradaEn: timestamp("cerrada_en", { withTimezone: true }),
    /** igual que todo acá: no se borra, se archiva */
    archivadaEn: timestamp("archivada_en", { withTimezone: true }),
    creadaEn: timestamp("creada_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("reposiciones_proveedor_idx").on(t.proveedorId)],
);

export const reposicionesItems = pgTable(
  "reposiciones_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reposicionId: uuid("reposicion_id")
      .notNull()
      .references(() => reposiciones.id, { onDelete: "cascade" }),
    /**
     * Acá el producto es OBLIGATORIO, al revés que en `compras_items`. Un
     * renglón de compra sin producto igual vale como plata que salió de la
     * caja; un renglón de pedido sin producto no se le puede pedir a nadie.
     */
    productoId: uuid("producto_id")
      .notNull()
      .references(() => productos.id, { onDelete: "cascade" }),
    /** cuántos bultos se piden */
    cantidad: integer("cantidad").notNull().default(1),
    /** cuánto trae cada bulto. Siempre unidades: ver CLAUDE.md */
    unidadesPorBulto: integer("unidades_por_bulto").notNull().default(1),
    /**
     * Lo que sale UN BULTO, en centavos. Nullable y sin default a propósito:
     * mientras el proveedor no cantó el precio, esto es *todavía no sabemos*,
     * que no es lo mismo que cero. La pantalla lo muestra como "falta el
     * precio" y no lo suma al total.
     */
    importeBultoCentavos: bigint("importe_bulto_centavos", { mode: "number" }),
    posicion: integer("posicion").notNull().default(0),
  },
  (t) => [
    index("reposiciones_items_reposicion_idx").on(t.reposicionId),
    // Un producto una sola vez por pedido: dos renglones del mismo producto
    // son un error de carga, no un pedido de dos tandas.
    uniqueIndex("reposiciones_items_unico").on(t.reposicionId, t.productoId),
  ],
);

export type Reposicion = typeof reposiciones.$inferSelect;
export type ReposicionItem = typeof reposicionesItems.$inferSelect;
