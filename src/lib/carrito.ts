/**
 * El carrito del mostrador: qué se está llevando el cliente que está adelante.
 *
 * Vive sólo en la pantalla hasta que se cobra. Nada de acá toca la base, así
 * que lo puede importar un componente de cliente — misma regla que
 * `movimiento.ts` y `negocio.ts`.
 *
 * El precio y el costo se COPIAN al renglón cuando el producto entra al
 * carrito, no se leen después. Una venta de marzo tiene que seguir diciendo lo
 * que se cobró en marzo: si la pantalla leyera el precio actual del catálogo,
 * actualizar una lista de precios reescribiría la historia.
 */

export type RenglonCarrito = {
  /** null cuando se vendió algo que no está en el catálogo */
  productoId: string | null;
  descripcion: string;
  cantidad: number;
  precioUnitarioCentavos: number;
  /** lo que costaba esa unidad; null si el producto nunca se compró por la app */
  costoUnitarioCentavos: number | null;
};

/** Lo que suma el carrito. */
export function totalDelCarrito(renglones: RenglonCarrito[]): number {
  return renglones.reduce(
    (total, r) => total + r.precioUnitarioCentavos * r.cantidad,
    0,
  );
}

/** Cuántas unidades hay adentro, para poder decir "4 productos". */
export function unidadesDelCarrito(renglones: RenglonCarrito[]): number {
  return renglones.reduce((total, r) => total + r.cantidad, 0);
}

/**
 * Lo que deja el carrito, si se sabe.
 *
 * `completa` dice si TODOS los renglones tenían costo. Con uno solo sin costo
 * la ganancia que se puede calcular es menor que la real, y mostrarla como si
 * fuera el número final haría tomar decisiones con plata que no está contada.
 */
export function gananciaDelCarrito(renglones: RenglonCarrito[]): {
  centavos: number;
  completa: boolean;
} {
  let centavos = 0;
  let completa = true;

  for (const renglon of renglones) {
    if (renglon.costoUnitarioCentavos == null) {
      completa = false;
      continue;
    }
    centavos +=
      (renglon.precioUnitarioCentavos - renglon.costoUnitarioCentavos) *
      renglon.cantidad;
  }

  return { centavos, completa };
}

/**
 * Mete un producto al carrito. Si ya estaba, le suma uno a la cantidad en vez
 * de agregar otro renglón.
 *
 * Eso es lo que hace que escanear tres veces la misma gaseosa dé "3 Coca" y no
 * tres líneas de Coca: con el lector en la mano se pasa el producto una vez por
 * unidad, y una lista de veinte líneas repetidas no se puede revisar antes de
 * cobrar.
 *
 * Lo que identifica al renglón es el producto del catálogo; los sueltos se
 * comparan por el texto, que es lo único que tienen.
 */
export function agregar(
  renglones: RenglonCarrito[],
  nuevo: RenglonCarrito,
): RenglonCarrito[] {
  const posicion = renglones.findIndex((r) =>
    nuevo.productoId
      ? r.productoId === nuevo.productoId
      : r.productoId === null && r.descripcion === nuevo.descripcion,
  );

  if (posicion === -1) return [...renglones, nuevo];

  return renglones.map((r, i) =>
    i === posicion ? { ...r, cantidad: r.cantidad + nuevo.cantidad } : r,
  );
}

/**
 * Cambia la cantidad de un renglón. En cero lo saca: bajar hasta cero es cómo
 * se borra algo cuando se está apurado, y dejar un renglón en cero sumando nada
 * es una línea que confunde al revisar.
 */
export function cambiarCantidad(
  renglones: RenglonCarrito[],
  indice: number,
  cantidad: number,
): RenglonCarrito[] {
  if (cantidad <= 0) return renglones.filter((_, i) => i !== indice);
  return renglones.map((r, i) => (i === indice ? { ...r, cantidad } : r));
}

export function sacar(
  renglones: RenglonCarrito[],
  indice: number,
): RenglonCarrito[] {
  return renglones.filter((_, i) => i !== indice);
}
