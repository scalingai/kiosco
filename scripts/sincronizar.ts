/**
 * Copia el catálogo de la base local a la que diga `DATABASE_URL`.
 *
 * Por qué existe: `db:catalogo` arma el esqueleto curado a mano y `db:importar`
 * le pega encima los códigos de barras y las fotos que saca de los catálogos de
 * los supermercados. El resultado de las dos cosas —más la poda de todo lo que
 * el kiosco no vende— vive en `.data/pg` y es lo que Agus revisó producto por
 * producto.
 *
 * Volver a correr el importador contra producción NO daría lo mismo: sale a
 * buscar de nuevo, los catálogos ajenos cambian, y volvería a meter las marcas
 * y formatos que ya se podaron. Lo que hay que llevar es el estado aprobado,
 * no repetir el proceso que lo produjo.
 *
 * ── Lo que NO hace ────────────────────────────────────────────────────────
 *
 * No borra NADA. Ni productos, ni marcas, ni categorías. Si en destino sobra
 * algo que en local no está, se queda: puede haberlo cargado alguien desde la
 * app y este script no tiene forma de saberlo.
 *
 * Y no pisa lo que ya está escrito. Sobre un producto que existe sólo COMPLETA
 * los campos que en destino están en null. Si alguien le puso el precio de
 * venta desde el celular, ese precio gana: es más nuevo y más real que el
 * catálogo de referencia.
 */
import path from "node:path";
import { sql } from "drizzle-orm";
import { abrirBase } from "./lib/base.ts";

type FilaCategoria = {
  nombre: string;
  nombre_normalizado: string;
  padre: string | null;
};
type FilaMarca = { nombre: string; nombre_normalizado: string };
type FilaProducto = {
  nombre: string;
  nombre_normalizado: string;
  marca: string | null;
  categoria: string | null;
  codigo_barras: string | null;
  imagen_url: string | null;
  envase: string | null;
  contenido: number | null;
  contenido_unidad: string | null;
  precio_venta_centavos: string | number | null;
};

/** Abre el PGlite local en modo lectura: es el origen, nunca se toca. */
async function leerLocal() {
  const { PGlite } = await import("@electric-sql/pglite");
  const cliente = new PGlite(path.join(process.cwd(), ".data", "pg"));

  // Las categorías salen con el NOMBRE del padre en vez del id: los uuid de
  // una base no significan nada en la otra.
  const categorias = await cliente.query<FilaCategoria>(`
    select c.nombre, c.nombre_normalizado, p.nombre_normalizado as padre
    from categorias c
    left join categorias p on p.id = c.padre_id
    order by (c.padre_id is not null), c.nombre
  `);

  const marcas = await cliente.query<FilaMarca>(
    `select nombre, nombre_normalizado from marcas where archivado_en is null`,
  );

  const productos = await cliente.query<FilaProducto>(`
    select pr.nombre, pr.nombre_normalizado,
           m.nombre_normalizado as marca,
           c.nombre_normalizado as categoria,
           pr.codigo_barras, pr.imagen_url, pr.envase,
           pr.contenido, pr.contenido_unidad, pr.precio_venta_centavos
    from productos pr
    left join marcas m on m.id = pr.marca_id
    left join categorias c on c.id = pr.categoria_id
    where pr.archivado_en is null
    order by pr.nombre
  `);

  await cliente.close();
  return {
    categorias: categorias.rows,
    marcas: marcas.rows,
    productos: productos.rows,
  };
}

async function main() {
  const aplicar = process.argv.includes("--aplicar");

  if (!process.env.DATABASE_URL) {
    console.error(
      "Este script copia HACIA otra base, así que necesita DATABASE_URL.\n" +
        "Sin eso el origen y el destino serían el mismo .data/pg.",
    );
    process.exit(1);
  }

  const local = await leerLocal();
  console.log(
    `Local: ${local.productos.length} productos · ` +
      `${local.marcas.length} marcas · ${local.categorias.length} categorías\n`,
  );

  // El freno vive adentro: contra producción, sin --aplicar ni siquiera conecta.
  const base = await abrirBase(aplicar);
  const { db } = base;

  if (!aplicar) {
    console.log("Esto es un simulacro. Para hacerlo: agregá --aplicar\n");
  }

  try {
    const antes = await db.execute<{ n: number }>(
      sql`select count(*)::int as n from productos`,
    );
    console.log(`Destino tiene ${antes.rows[0].n} productos ahora.\n`);

    if (!aplicar) {
      const conCodigo = local.productos.filter((p) => p.codigo_barras).length;
      console.log(
        `Copiaría ${local.productos.length} productos ` +
          `(${conCodigo} con código de barras y foto).`,
      );
      return;
    }

    // ── Categorías: primero las de primer nivel, después las hijas ─────────
    // El orden del select ya las trae así, y por eso el padre siempre existe
    // cuando se inserta la hija.
    const idCategoria = new Map<string, string>();
    for (const fila of local.categorias) {
      const padreId = fila.padre ? (idCategoria.get(fila.padre) ?? null) : null;
      const r = await db.execute<{ id: string }>(sql`
        insert into categorias (nombre, nombre_normalizado, padre_id)
        values (${fila.nombre}, ${fila.nombre_normalizado}, ${padreId})
        on conflict (nombre_normalizado) do update set nombre = excluded.nombre
        returning id
      `);
      idCategoria.set(fila.nombre_normalizado, r.rows[0].id);
    }
    console.log(`Categorías: ${idCategoria.size}`);

    // ── Marcas ────────────────────────────────────────────────────────────
    const idMarca = new Map<string, string>();
    for (const fila of local.marcas) {
      const r = await db.execute<{ id: string }>(sql`
        insert into marcas (nombre, nombre_normalizado)
        values (${fila.nombre}, ${fila.nombre_normalizado})
        on conflict (nombre_normalizado) do update set nombre = excluded.nombre
        returning id
      `);
      idMarca.set(fila.nombre_normalizado, r.rows[0].id);
    }
    console.log(`Marcas: ${idMarca.size}`);

    // ── Productos ─────────────────────────────────────────────────────────
    let nuevos = 0;
    let completados = 0;
    let intactos = 0;
    const chocados: string[] = [];

    for (const p of local.productos) {
      const marcaId = p.marca ? (idMarca.get(p.marca) ?? null) : null;
      const categoriaId = p.categoria
        ? (idCategoria.get(p.categoria) ?? null)
        : null;

      /*
       * El código de barras tiene índice único aparte del nombre. Si en destino
       * ya existe OTRO producto con ese código, insertarlo revienta la corrida
       * entera; peor todavía, dos filas con el mismo código significan que una
       * de las dos está mal y hay que mirarla a mano. Se saltea el código y se
       * reporta.
       */
      let codigo = p.codigo_barras;
      if (codigo) {
        const ajeno = await db.execute<{ nombre: string }>(sql`
          select nombre from productos
          where codigo_barras = ${codigo}
            and nombre_normalizado <> ${p.nombre_normalizado}
          limit 1
        `);
        if (ajeno.rows.length) {
          chocados.push(`${p.nombre} ↔ ${ajeno.rows[0].nombre} (${codigo})`);
          codigo = null;
        }
      }

      // `coalesce(productos.x, excluded.x)` es la regla entera: lo que ya está
      // escrito en destino gana, y esto sólo rellena los huecos.
      const r = await db.execute<{ accion: string }>(sql`
        insert into productos (
          nombre, nombre_normalizado, marca_id, categoria_id,
          codigo_barras, imagen_url, envase, contenido,
          contenido_unidad, precio_venta_centavos
        ) values (
          ${p.nombre}, ${p.nombre_normalizado}, ${marcaId}, ${categoriaId},
          ${codigo}, ${p.imagen_url}, ${p.envase}::tipo_envase, ${p.contenido},
          ${p.contenido_unidad}::unidad_medida, ${p.precio_venta_centavos}
        )
        on conflict (nombre_normalizado) do update set
          marca_id     = coalesce(productos.marca_id, excluded.marca_id),
          categoria_id = coalesce(productos.categoria_id, excluded.categoria_id),
          codigo_barras = coalesce(productos.codigo_barras, excluded.codigo_barras),
          imagen_url   = coalesce(productos.imagen_url, excluded.imagen_url),
          envase       = coalesce(productos.envase, excluded.envase),
          contenido    = coalesce(productos.contenido, excluded.contenido),
          contenido_unidad =
            coalesce(productos.contenido_unidad, excluded.contenido_unidad),
          precio_venta_centavos =
            coalesce(productos.precio_venta_centavos, excluded.precio_venta_centavos)
        returning case when xmax = 0 then 'nuevo' else 'existia' end as accion
      `);

      if (r.rows[0].accion === "nuevo") nuevos += 1;
      else if (p.codigo_barras || p.imagen_url) completados += 1;
      else intactos += 1;
    }

    console.log(
      `\nProductos: ${nuevos} nuevos · ${completados} completados · ` +
        `${intactos} sin cambios`,
    );

    if (chocados.length) {
      console.log(
        `\n${chocados.length} códigos chocaron con otro producto y NO se copiaron:`,
      );
      for (const choque of chocados) console.log(`  ${choque}`);
    }

    const despues = await db.execute<{
      total: number;
      codigo: number;
      foto: number;
    }>(sql`
      select count(*)::int as total,
             count(codigo_barras)::int as codigo,
             count(imagen_url)::int as foto
      from productos
    `);
    const f = despues.rows[0];
    console.log(
      `\nDestino queda con ${f.total} productos · ` +
        `${f.codigo} con código · ${f.foto} con foto`,
    );
  } finally {
    await base.cerrar();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
