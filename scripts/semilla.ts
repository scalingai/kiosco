/**
 * Carga unos pocos clientes, movimientos y días de caja en la base local para
 * poder mirar la app con algo adentro. Sólo toca PGlite (.data/pg): nunca corre contra
 * DATABASE_URL, así no hay manera de que ensucie una base de verdad.
 *
 *   npm run db:semilla
 *
 * Para vaciarla de nuevo: borrá la carpeta .data
 */
import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import {
  clientes,
  compras,
  comprasItems,
  gastos,
  items,
  movimientos,
  marcas,
  productos,
  proveedores,
  ventas,
} from "../src/db/schema.ts";
import { normalizarNombre } from "../src/lib/nombres.ts";

type ItemSemilla = { descripcion: string; cantidad: number; precio?: number };

type MovimientoSemilla = {
  tipo: "fiado" | "pago";
  /** total dicho por una persona; si falta, sale de sumar los ítems */
  total?: number;
  items?: ItemSemilla[];
  nota?: string;
  dias: number;
};

const GENTE: {
  nombre: string;
  telefono: string | null;
  movimientos: MovimientoSemilla[];
}[] = [
  {
    nombre: "Marta Gómez",
    telefono: "11 5555 1234",
    // Total dicho de una, sin precio por producto: el caso más común.
    movimientos: [
      {
        tipo: "fiado",
        total: 4800,
        items: [
          { descripcion: "gaseosa", cantidad: 2 },
          { descripcion: "pan", cantidad: 1 },
        ],
        dias: 12,
      },
      {
        tipo: "fiado",
        total: 2300,
        items: [{ descripcion: "atado de cigarrillos", cantidad: 1 }],
        dias: 6,
      },
      { tipo: "pago", total: 5000, dias: 2 },
    ],
  },
  {
    nombre: "Julián Ferreyra",
    telefono: null,
    // Precio por producto y sin total: el total sale de la suma.
    movimientos: [
      {
        tipo: "fiado",
        items: [
          { descripcion: "cerveza", cantidad: 4, precio: 2500 },
          { descripcion: "papas fritas", cantidad: 1, precio: 2500 },
        ],
        dias: 40,
      },
      {
        tipo: "fiado",
        items: [{ descripcion: "alfajor", cantidad: 4, precio: 775 }],
        dias: 33,
      },
    ],
  },
  {
    nombre: "Doña Rosa",
    telefono: null,
    movimientos: [
      {
        tipo: "fiado",
        total: 1900,
        items: [{ descripcion: "leche", cantidad: 1 }],
        dias: 4,
      },
      { tipo: "pago", total: 1900, dias: 1 },
    ],
  },
  {
    nombre: "El Flaco",
    telefono: null,
    // Sin precios y sin total: queda anotado pero no suma. Es el caso a mirar.
    movimientos: [
      {
        tipo: "fiado",
        items: [
          { descripcion: "yerba", cantidad: 1 },
          { descripcion: "fideos", cantidad: 2 },
        ],
        nota: "después le pongo el precio",
        dias: 1,
      },
      {
        tipo: "fiado",
        total: 7400,
        items: [{ descripcion: "carga del día", cantidad: 1 }],
        dias: 3,
      },
    ],
  },
];


/* ── El libro del negocio ─────────────────────────────────────────────────── */

/** Un renglón de factura: bultos, qué trae cada uno y lo que se pagó por todo. */
type RenglonSemilla = {
  descripcion: string;
  cantidad: number;
  unidadesPorBulto?: number;
  unidad?: "un" | "gr" | "ml";
  importe?: number;
};

type CompraSemilla = {
  proveedor: string;
  total?: number;
  items?: RenglonSemilla[];
  comprobante?: string;
  /** hace cuántos días llegó */
  dias: number;
  /** hace cuántos días se pagó; si falta, quedó a cuenta */
  pagadaHace?: number;
  medio?: "efectivo" | "mercadopago" | "banco";
  /** con factura: al importe se le suma el IVA para el costo real */
  enBlanco?: boolean;
};

const PROVEEDORES = ["Coca-Cola", "Distribuidora El Norte", "Panadería Sur"];

const COMPRAS: CompraSemilla[] = [
  // Compra por pack, que es como se compra de verdad: la factura dice bultos y
  // plata, y el costo por unidad sale de dividir.
  {
    proveedor: "Coca-Cola",
    comprobante: "A-0012345",
    enBlanco: true,
    items: [
      { descripcion: "gaseosa grande", cantidad: 8, unidadesPorBulto: 6, importe: 144000 },
      { descripcion: "agua saborizada", cantidad: 3, unidadesPorBulto: 6, importe: 41000 },
      // El mismo producto en otro envase: por botella parece mas barato, y
      // por litro es el doble. Es justo lo que la pantalla tiene que mostrar.
      { descripcion: "gaseosa chica", cantidad: 4, unidadesPorBulto: 12, importe: 96000 },
      // Comprado por peso: el precio que sirve es el del kilo, no el del gramo.
      { descripcion: "yerba", cantidad: 4, unidadesPorBulto: 1000, unidad: "gr", importe: 38000 },
    ],
    // 144.000 + 41.000 + 96.000 + 38.000
    total: 319000,
    dias: 1,
    pagadaHace: 1,
    medio: "banco",
  },
  { proveedor: "Panadería Sur", total: 22400, dias: 0, pagadaHace: 0 },
  // Llegó hoy y quedó a cuenta: figura en el día pero no toca la caja.
  {
    proveedor: "Distribuidora El Norte",
    total: 240000,
    comprobante: "R-8891",
    enBlanco: true,
    dias: 0,
  },
  // Llegó hace días y se paga hoy: la salida cae hoy, no el día que llegó.
  {
    proveedor: "Distribuidora El Norte",
    total: 96000,
    dias: 6,
    pagadaHace: 0,
    medio: "mercadopago",
  },
  // Renglones sin precio y sin total declarado: el total todavía no es el total.
  {
    proveedor: "Panadería Sur",
    items: [
      { descripcion: "docena de facturas", cantidad: 3, unidadesPorBulto: 12 },
      { descripcion: "pan", cantidad: 10 },
    ],
    dias: 2,
  },
];

const GASTOS: {
  categoria: "alquiler" | "servicios" | "fletes" | "retiro" | "otros";
  monto: number;
  descripcion?: string;
  medio?: "efectivo" | "mercadopago" | "banco";
  dias: number;
}[] = [
  {
    categoria: "servicios",
    monto: 48000,
    descripcion: "factura de luz",
    medio: "banco",
    dias: 0,
  },
  { categoria: "fletes", monto: 9000, descripcion: "flete del mayorista", dias: 0 },
  { categoria: "retiro", monto: 60000, dias: 1 },
  { categoria: "alquiler", monto: 320000, dias: 5 },
];

/** Un renglón por turno: así se ve que el día suma varias cargas. */
const VENTAS: {
  monto: number;
  nota?: string;
  medio?: "efectivo" | "mercadopago" | "banco";
  dias: number;
}[] = [
  { monto: 310000, nota: "mañana", dias: 0 },
  { monto: 268500, nota: "tarde", medio: "mercadopago", dias: 0 },
  { monto: 540000, dias: 1 },
  { monto: 495000, dias: 2 },
  { monto: 610000, dias: 3 },
];


/**
 * La marca y el contenido de cada unidad. No salen de la factura —ahi dice
 * "8 packs", no "cada botella trae 2,25 L"—, asi que en la app se cargan a
 * mano y aca se siembran para poder ver la comparacion por litro.
 */
const FICHAS: {
  producto: string;
  marca?: string;
  contenido?: number;
  contenidoUnidad?: "gr" | "ml";
  /** a cuánto se vende; sin esto la app sólo puede sugerir un precio */
  precioVenta?: number;
}[] = [
  {
    producto: "gaseosa grande",
    marca: "Coca-Cola",
    contenido: 2250,
    contenidoUnidad: "ml",
    precioVenta: 4500,
  },
  {
    producto: "gaseosa chica",
    marca: "Coca-Cola",
    contenido: 500,
    contenidoUnidad: "ml",
    precioVenta: 3500,
  },
  {
    producto: "agua saborizada",
    marca: "Coca-Cola",
    contenido: 1500,
    contenidoUnidad: "ml",
  },
  { producto: "yerba", marca: "Playadito", precioVenta: 14000 },
];

function fechaHace(dias: number): string {
  const d = new Date();
  d.setDate(d.getDate() - dias);
  return d.toLocaleDateString("sv-SE");
}

function centavos(pesos: number): number {
  return Math.round(pesos * 100);
}

async function main() {
  const directorio = path.join(process.cwd(), ".data", "pg");
  fs.mkdirSync(directorio, { recursive: true });
  const cliente = new PGlite(directorio);
  const db = drizzle(cliente);
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });

  for (const persona of GENTE) {
    const [fila] = await db
      .insert(clientes)
      .values({
        nombre: persona.nombre,
        nombreNormalizado: normalizarNombre(persona.nombre),
        telefono: persona.telefono,
      })
      .onConflictDoNothing({ target: clientes.nombreNormalizado })
      .returning();

    if (!fila) {
      console.log("ya estaba: " + persona.nombre);
      continue;
    }

    for (const m of persona.movimientos) {
      const lista = m.items ?? [];
      const totalDeclarado = m.total != null;
      const monto = totalDeclarado
        ? centavos(m.total!)
        : lista.reduce(
            (t, i) =>
              t + (i.precio != null ? centavos(i.precio) * i.cantidad : 0),
            0,
          );

      const [guardado] = await db
        .insert(movimientos)
        .values({
          clienteId: fila.id,
          tipo: m.tipo,
          montoCentavos: monto,
          totalDeclarado,
          nota: m.nota ?? null,
          fecha: fechaHace(m.dias),
          origen: "manual",
        })
        .returning();

      if (lista.length) {
        await db.insert(items).values(
          lista.map((item, posicion) => ({
            movimientoId: guardado.id,
            descripcion: item.descripcion,
            cantidad: item.cantidad,
            precioUnitarioCentavos:
              item.precio != null ? centavos(item.precio) : null,
            posicion,
          })),
        );
      }
    }
    console.log("cargado: " + persona.nombre);
  }

  const idPorProveedor = new Map<string, string>();
  for (const nombre of PROVEEDORES) {
    const [fila] = await db
      .insert(proveedores)
      .values({ nombre, nombreNormalizado: normalizarNombre(nombre) })
      .onConflictDoNothing({ target: proveedores.nombreNormalizado })
      .returning();
    if (fila) idPorProveedor.set(nombre, fila.id);
  }

  // Si los proveedores ya estaban, tampoco cargamos su historia de nuevo: esto
  // se corre varias veces mientras se prueba.
  if (idPorProveedor.size === PROVEEDORES.length) {
    const idPorProducto = new Map<string, string>();

    for (const c of COMPRAS) {
      const lista = c.items ?? [];
      const totalDeclarado = c.total != null;
      const [guardada] = await db
        .insert(compras)
        .values({
          proveedorId: idPorProveedor.get(c.proveedor)!,
          montoCentavos: totalDeclarado
            ? centavos(c.total!)
            : lista.reduce(
                (t, r) => t + (r.importe != null ? centavos(r.importe) : 0),
                0,
              ),
          totalDeclarado,
          fecha: fechaHace(c.dias),
          pagadoEn: c.pagadaHace != null ? fechaHace(c.pagadaHace) : null,
          medio: c.pagadaHace != null ? (c.medio ?? "efectivo") : null,
          comprobante: c.comprobante ?? null,
          enBlanco: c.enBlanco ?? false,
        })
        .returning();

      // Cada renglón engancha con su producto, igual que hace la app cuando
      // cargás una compra de verdad: así el catálogo de stock aparece solo.
      let posicion = 0;
      for (const renglon of lista) {
        const normalizado = normalizarNombre(renglon.descripcion);
        let productoId = idPorProducto.get(normalizado);
        if (!productoId) {
          const [creado] = await db
            .insert(productos)
            .values({
              nombre: renglon.descripcion,
              nombreNormalizado: normalizado,
              proveedorId: idPorProveedor.get(c.proveedor)!,
            })
            .onConflictDoNothing({ target: productos.nombreNormalizado })
            .returning();
          if (creado) {
            productoId = creado.id;
            idPorProducto.set(normalizado, creado.id);
          }
        }

        await db.insert(comprasItems).values({
          compraId: guardada.id,
          productoId: productoId ?? null,
          descripcion: renglon.descripcion,
          cantidad: renglon.cantidad,
          unidadesPorBulto: renglon.unidadesPorBulto ?? 1,
          unidad: renglon.unidad ?? "un",
          importeCentavos:
            renglon.importe != null ? centavos(renglon.importe) : null,
          posicion,
        });
        posicion += 1;
      }
    }

    await db.insert(gastos).values(
      GASTOS.map((g) => ({
        categoria: g.categoria,
        montoCentavos: centavos(g.monto),
        descripcion: g.descripcion ?? null,
        medio: g.medio ?? "efectivo",
        fecha: fechaHace(g.dias),
      })),
    );

    await db.insert(ventas).values(
      VENTAS.map((v) => ({
        montoCentavos: centavos(v.monto),
        nota: v.nota ?? null,
        medio: v.medio ?? "efectivo",
        fecha: fechaHace(v.dias),
      })),
    );

    for (const ficha of FICHAS) {
      const normalizado = normalizarNombre(ficha.producto);
      let marcaId: string | null = null;

      if (ficha.marca) {
        const [creada] = await db
          .insert(marcas)
          .values({
            nombre: ficha.marca,
            nombreNormalizado: normalizarNombre(ficha.marca),
          })
          .onConflictDoNothing({ target: marcas.nombreNormalizado })
          .returning();
        if (creada) {
          marcaId = creada.id;
        } else {
          const [existente] = await db
            .select()
            .from(marcas)
            .where(eq(marcas.nombreNormalizado, normalizarNombre(ficha.marca)));
          marcaId = existente?.id ?? null;
        }
      }

      await db
        .update(productos)
        .set({
          marcaId,
          contenido: ficha.contenido ?? null,
          contenidoUnidad: ficha.contenidoUnidad ?? null,
          precioVentaCentavos:
            ficha.precioVenta != null ? centavos(ficha.precioVenta) : null,
        })
        .where(eq(productos.nombreNormalizado, normalizado));
    }

    // Dos cosas marcadas como faltantes: es la pantalla que se mira antes de
    // salir a comprar, y vacía no se entiende para qué sirve.
    for (const nombre of ["yerba", "gaseosa grande"]) {
      const [creado] = await db
        .insert(productos)
        .values({
          nombre,
          nombreNormalizado: normalizarNombre(nombre),
          falta: true,
        })
        .onConflictDoNothing({ target: productos.nombreNormalizado })
        .returning();
      if (!creado) {
        await db
          .update(productos)
          .set({ falta: true })
          .where(eq(productos.nombreNormalizado, normalizarNombre(nombre)));
      }
    }

    console.log("cargado: proveedores, compras, gastos, ventas, marcas y stock");
  } else {
    console.log("ya estaban: proveedores");
  }

  await cliente.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
