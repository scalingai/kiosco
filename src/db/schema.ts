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
    nota: text("nota"),
    fecha: date("fecha").notNull(),
    medio: medioPago("medio").notNull().default("efectivo"),
    anuladoEn: timestamp("anulado_en", { withTimezone: true }),
    creadoEn: timestamp("creado_en", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("ventas_fecha_idx").on(t.fecha)],
);

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
