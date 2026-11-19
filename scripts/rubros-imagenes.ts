/**
 * Genera la foto de cada rubro con la API de imágenes de OpenAI y la deja en
 * `public/rubros`.
 *
 * Por qué del rubro y no del producto: inventar la foto de un producto de
 * marca sale mal siempre —el modelo dibuja un logo que no existe y un envase
 * que nadie vende—, y en una góndola eso se nota. La del rubro no miente:
 * dice de qué se trata sin decir cuál es. Las fotos de producto de verdad
 * salen de los catálogos de los supermercados (`scripts/buscar-fotos.ts`), y
 * ésta es la red que agarra lo que ahí no está: los cigarrillos, que por ley
 * no figuran en ningún catálogo, y todo lo que se vende suelto.
 *
 *   node --experimental-strip-types scripts/rubros-imagenes.ts --prod --aplicar
 *   ... --solo "Gomitas,Chocolates"   # regenerar algunos
 */
import fs from "node:fs";
import path from "node:path";
import { abrirBase } from "./lib/base.ts";
import { eq } from "drizzle-orm";
import { categorias } from "../src/db/schema.ts";

const APLICAR = process.argv.includes("--aplicar");
const soloArg = process.argv.indexOf("--solo");
const SOLO =
  soloArg > -1
    ? new Set(process.argv[soloArg + 1].split(",").map((s) => s.trim()))
    : null;

const CLAVE = process.env.OPENAI_API_KEY;
if (!CLAVE) throw new Error("Falta OPENAI_API_KEY en el entorno.");

const CARPETA = path.join(process.cwd(), "public", "rubros");

/**
 * El estilo de la casa, igual en las 60 fotos.
 *
 * Que compartan fondo, luz y encuadre es lo que hace que la pantalla se vea
 * como UNA cosa y no como sesenta fotos juntadas de internet. El "sin texto ni
 * logos" no es un capricho: un logo inventado en la góndola es una mentira
 * chica que arruina la confianza en todo lo demás.
 */
const ESTILO =
  ", top-down flat-lay product photography on a warm cream paper background," +
  " soft diffused studio light, gentle natural shadows, generous negative space," +
  " muted editorial colour palette, crisp focus, square composition," +
  " absolutely no text, no letters, no logos, no brand names, no printed labels";

/** Qué dibujar para cada rubro. La clave es el nombre exacto en la base. */
const QUE: Record<string, string> = {
  /* Raíces */
  "Almacén": "a tidy arrangement of plain pantry staples: a paper bag of rice, dry pasta, a glass oil bottle, a jar of sugar",
  "Bebidas": "an arrangement of unbranded clear glass and plastic bottles and plain aluminium cans with cold condensation",
  "Golosinas": "a colourful spread of assorted unwrapped candies, gummies and small chocolates",
  "Librería": "a neat arrangement of plain notebooks, pencils, a ruler, scissors and a glue stick",
  "Limpieza": "plain household cleaning items: an unlabelled spray bottle, a sponge, a folded cloth, a paper roll",
  "Perfumería": "plain personal-care items: a bar of soap, a white tube, a plain pump bottle, a folded towel",
  "Snacks": "an arrangement of loose potato crisps, pretzel sticks, crackers and puffed corn snacks",
  "Tabaquería": "a kiosk tobacco counter from above: plain unlabelled flip-top packs, a pouch of loose leaf, a booklet of rolling papers and a simple lighter",
  "Varios": "a small neat arrangement of everyday counter items: plain batteries, a lighter, a notepad",

  /* Almacén */
  "Aceites": "two tall unbranded glass bottles of golden sunflower oil",
  "Arroz": "a mound of white long-grain rice beside a plain paper bag",
  "Azúcar y endulzantes": "a bowl of white sugar with a wooden scoop and small sweetener tablets",
  "Condimentos": "small glass jars and loose piles of salt, black pepper and dried oregano",
  "Conservas": "plain unlabelled tin cans, one open showing tuna, beside a glass jar of tomato sauce",
  "Fideos": "assorted dry pasta shapes — spaghetti, penne, elbows — arranged in neat groups",
  "Harinas": "a mound of white flour with a wooden scoop and a plain paper bag",
  "Helados": "assorted ice-cream bars and popsicles on sticks with light frost",
  "Infusiones": "loose coffee beans, ground coffee and plain tea bags arranged in groups",
  "Lácteos": "a plain glass bottle of milk, a small bowl of grated cheese and a plain yogurt cup",
  "Panificados": "sliced bread, a small sweet bread loaf and a slice of marble pound cake",
  "Yerba": "a heap of yerba mate leaves with a wooden gourd and a metal straw",
  "Aderezos": "plain squeeze bottles and small bowls of mayonnaise, ketchup and mustard",
  "Jugos en polvo": "small plain sachets of powdered juice beside a glass of orange drink",

  /* Bebidas */
  "Aguas": "plain clear plastic water bottles of different sizes with condensation",
  "Aguas saborizadas": "clear bottles of lightly coloured flavoured water beside fresh fruit slices",
  "Alcohol": "plain amber beer bottles and aluminium cans with cold condensation",
  "Energizantes": "tall plain aluminium energy drink cans with cold condensation, dark moody tone",
  "Gaseosas": "plain glass and plastic soda bottles and cans with fizzy bubbles and condensation",
  "Jugos": "a plain carton and a glass of orange juice with fresh fruit beside",

  /* Golosinas */
  "Alfajores": "round dulce de leche sandwich cookies coated in chocolate, one bitten showing the filling",
  "Caramelos": "a colourful scatter of unwrapped hard and chewy candies",
  "Chicles": "small coated chewing gum pellets and plain gum sticks in neat groups",
  "Chocolates": "a flat-lay of plain chocolate bars, squares and bonbons",
  "Chupetines": "round lollipops on plain white sticks arranged in a fan",
  "Gomitas": "a flat-lay of assorted sugar-coated gummy candies: bears, worms, rings and fruit shapes",
  "Pastillas": "small round mints and pastilles scattered beside a plain paper tube",
  "Golosinas varias": "a peanut nougat bar, chocolate-coated peanuts, a turron bar and candied sweets",

  /* Librería */
  "Cuadernos": "a stack of plain soft-cover notebooks in muted colours",
  "Escritura": "plain ballpoint pens, graphite pencils and highlighters laid out in a row",
  "Útiles": "scissors, a glue stick, a roll of clear tape and a small cutter",
  "Papelería": "a stack of blank A4 sheets, coloured card and a roll of plain gift paper with a ribbon bow",

  /* Limpieza */
  "Jabón para la ropa": "a plain scoop of laundry powder beside a folded white towel",
  "Limpieza del hogar": "an unlabelled spray bottle, a plain bottle of bleach and a cleaning cloth",
  "Papel higiénico": "neatly stacked rolls of white toilet paper",
  "Rollos de cocina": "a roll of white kitchen paper towel, partly unrolled",
  "Suavizante": "a plain bottle of pale blue fabric softener beside folded soft towels",
  "Servilletas": "a neat stack of plain white paper napkins, one folded open",
  "Esponjas": "kitchen sponges and a scouring pad arranged in a neat group",

  /* Perfumería */
  "Cuidado personal": "a plain shampoo bottle, a small sachet, a comb and a folded towel",
  "Desodorantes": "plain unlabelled aerosol cans and a roll-on bottle in a row",
  "Higiene bucal": "a plain toothpaste tube, a toothbrush and a bottle of mouthwash",
  "Jabón de cuerpo": "plain bars of soap in soft pastel tones, one unwrapped on a dish",
  "Maquinitas de afeitar": "plain disposable razors in a neat row beside a small bowl of shaving foam",
  "Perfumes": "plain clear glass perfume bottles of different shapes, no labels",
  "Preservativos": "small plain square foil sachets arranged in a neat grid",
  "Botiquín": "cotton wool, a small bottle of alcohol, gauze and plain sanitary pads in a neat group",
  "Accesorios de pelo": "plain hair ties, clips and elastic bands in muted colours",

  /* Snacks */
  "Barras de cereal": "cereal bars with oats, honey and chocolate drizzle, one broken to show the inside",
  "Galletitas": "an assortment of plain biscuits and crackers: round, square, sandwich and sugar-dusted",
  "Papas fritas": "a generous scatter of golden potato crisps",
  "Snacks salados": "puffed cheese curls, pretzel sticks, tortilla chips and salted peanuts in neat groups",

  /* Tabaquería */
  "Cigarrillos": "the open wooden cigarette drawer of a Buenos Aires kiosk seen from above, rows of plain unlabelled flip-top packs standing upright in their slots, warm counter light",
  "Encendedores": "a dozen simple plastic cigarette lighters in bright solid colours standing upright in a neat grid",
  "Filtros": "a small open pack spilling dozens of slim white cigarette filter tips onto a wooden counter",
  "Papelillos": "a small open booklet of thin translucent rolling papers with a few loose leaves fanned out on a wooden counter",
  "Tabaco": "loose dried leaf shreds in a small open pouch on a wooden counter",

  /* Varios */
  "Pilas": "plain unlabelled cylindrical batteries of different sizes standing in a group",
};

/** `Azúcar y endulzantes` → `azucar-y-endulzantes` */
function slug(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function generar(prompt: string): Promise<Buffer | string> {
  const r = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${CLAVE}`,
    },
    body: JSON.stringify({
      model: "gpt-image-2.6-flare",
      prompt,
      size: "1024x1024",
      output_format: "webp",
      output_compression: 78,
      quality: "medium",
      n: 1,
    }),
    signal: AbortSignal.timeout(180_000),
  });
  const j = (await r.json()) as {
    error?: { message?: string };
    data?: { b64_json?: string }[];
  };
  if (j.error) return j.error.message ?? "error sin mensaje";
  const b64 = j.data?.[0]?.b64_json;
  if (!b64) return "la API no devolvió imagen";
  return Buffer.from(b64, "base64");
}

const { db, cerrar } = await abrirBase(APLICAR);

fs.mkdirSync(CARPETA, { recursive: true });

const todas = await db.select().from(categorias);
let hechas = 0;
const fallaron: string[] = [];

for (const c of todas) {
  if (SOLO && !SOLO.has(c.nombre)) continue;
  const que = QUE[c.nombre];
  if (!que) {
    console.log(`? ${c.nombre}: no tengo qué dibujar, lo salteo`);
    continue;
  }

  const archivo = path.join(CARPETA, `${slug(c.nombre)}.webp`);
  const publica = `/rubros/${slug(c.nombre)}.webp`;

  // Si ya está en disco no se vuelve a pagar: regenerar es con --solo.
  if (fs.existsSync(archivo) && !SOLO) {
    if (APLICAR && c.imagenUrl !== publica) {
      await db
        .update(categorias)
        .set({ imagenUrl: publica })
        .where(eq(categorias.id, c.id));
    }
    console.log(`· ${c.nombre}: ya estaba`);
    continue;
  }

  const salida = await generar(que + ESTILO);
  if (typeof salida === "string") {
    console.log(`✗ ${c.nombre}: ${salida}`);
    fallaron.push(c.nombre);
    continue;
  }

  fs.writeFileSync(archivo, salida);
  if (APLICAR) {
    await db
      .update(categorias)
      .set({ imagenUrl: publica })
      .where(eq(categorias.id, c.id));
  }
  hechas++;
  console.log(`✓ ${c.nombre} → ${publica} (${Math.round(salida.length / 1024)} kB)`);
}

console.log(`\nGeneradas: ${hechas} · fallaron: ${fallaron.length}`);
if (fallaron.length) console.log(fallaron.join("\n"));

await cerrar();
