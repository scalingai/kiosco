import "server-only";

import Groq from "groq-sdk";
import { z } from "zod";
import { buscarCoincidencia, type Candidato } from "@/lib/nombres";
import { pesosACentavos } from "@/lib/plata";

const MODELO_AUDIO = process.env.GROQ_MODELO_AUDIO ?? "whisper-large-v3-turbo";
const MODELO_TEXTO = process.env.GROQ_MODELO_TEXTO ?? "openai/gpt-oss-120b";

export class FaltaLaClave extends Error {
  constructor() {
    super(
      process.env.NODE_ENV === "production"
        ? "Falta GROQ_API_KEY en las variables de entorno del servicio."
        : "Falta GROQ_API_KEY. Poné la clave en .env.local (la sacás de console.groq.com/keys).",
    );
    this.name = "FaltaLaClave";
  }
}

function cliente() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new FaltaLaClave();
  return new Groq({ apiKey });
}

export async function transcribir(audio: File): Promise<string> {
  const respuesta = await cliente().audio.transcriptions.create({
    file: audio,
    model: MODELO_AUDIO,
    language: "es",
    temperature: 0,
    // El vocabulario del mostrador: sin esto Whisper escribe "Luca" como nombre.
    prompt:
      "Anotaciones de fiado de un kiosco argentino. Nombres de clientes, montos en pesos, productos como gaseosa, cigarrillos, alfajor, pan, yerba, cerveza.",
  });
  return respuesta.text.trim();
}

const esquemaRespuesta = z.object({
  movimientos: z
    .array(
      z.object({
        cliente: z.string().min(1),
        tipo: z.enum(["fiado", "pago"]),
        total: z.number().positive().nullish(),
        nota: z.string().nullish(),
        items: z
          .array(
            z.object({
              descripcion: z.string().min(1),
              cantidad: z.number().int().positive().nullish(),
              precio: z.number().positive().nullish(),
            }),
          )
          .nullish(),
      }),
    )
    .default([]),
});

const INSTRUCCIONES = `Sos el asistente de un kiosco argentino que lleva el fiado (cuenta corriente de los clientes).
Recibís la transcripción de un audio y devolvés SOLO un JSON con los movimientos que se mencionan.

Formato exacto:
{"movimientos":[{
  "cliente":"NOMBRE",
  "tipo":"fiado"|"pago",
  "total":NUMERO_O_NULL,
  "nota":TEXTO_O_NULL,
  "items":[{"descripcion":"TEXTO","cantidad":NUMERO,"precio":NUMERO_O_NULL}]
}]}

Qué es cada cosa:
- "tipo": "fiado" es cuando el cliente se lleva mercadería y queda debiendo. "pago" es cuando entrega plata y baja su deuda (pagó, me dio, abonó, saldó, cancela, me trajo).
- "items": lo que se llevó, un objeto por producto. "descripcion" en singular y en minúscula ("gaseosa", "paquete de yerba"). "cantidad" es cuántos; si no se dice, 1.
- "precio": el precio POR UNIDAD, sólo si se dijo el precio de ESE producto. Si no se dijo, null.
- "total": el monto total del movimiento, sólo si alguien lo dijo como total ("son tres mil", "le fié cinco lucas"). Si sólo se dijeron precios por producto, "total" va null y se calcula solo.
- "nota": aclaración suelta que no es un producto ("se lo llevó la hija"). Si no hay, null.

Reglas:
- Los montos van en PESOS, como número, sin puntos ni símbolos. 3500.50 se escribe 3500.5
- Lunfardo de plata: "una luca" = 1000, "cinco lucas" = 5000, "una gamba" = 100, "un palo" = 1000000, "dos mangos" son 2 pesos.
- Un audio puede tener varios movimientos y varios clientes.
- Un fiado puede no tener ningún precio: se anota igual, con items y todo en null. Eso está bien.
- Un pago normalmente no tiene items, sólo "total".
- Si no hay ningún movimiento claro, devolvé {"movimientos":[]}
- NUNCA inventes un cliente, un producto, una cantidad ni un precio que no se haya dicho.

Ejemplos:
"Marta se llevó dos gaseosas y pan, tres mil quinientos"
{"movimientos":[{"cliente":"Marta","tipo":"fiado","total":3500,"nota":null,"items":[{"descripcion":"gaseosa","cantidad":2,"precio":null},{"descripcion":"pan","cantidad":1,"precio":null}]}]}

"El flaco llevó tres alfajores a ochocientos cada uno"
{"movimientos":[{"cliente":"El flaco","tipo":"fiado","total":null,"nota":null,"items":[{"descripcion":"alfajor","cantidad":3,"precio":800}]}]}

"Rosa se llevó leche y yerba, después le pongo el precio"
{"movimientos":[{"cliente":"Rosa","tipo":"fiado","total":null,"nota":null,"items":[{"descripcion":"leche","cantidad":1,"precio":null},{"descripcion":"yerba","cantidad":1,"precio":null}]}]}

"Juan me pagó diez mil"
{"movimientos":[{"cliente":"Juan","tipo":"pago","total":10000,"nota":null,"items":[]}]}`;

export type ItemPropuesto = {
  descripcion: string;
  cantidad: number;
  precioUnitarioCentavos: number | null;
};

export type MovimientoPropuesto = {
  nombreDicho: string;
  clienteId: string | null;
  nombreResuelto: string;
  esClienteNuevo: boolean;
  tipo: "fiado" | "pago";
  /** null cuando nadie dijo un total y hay que sumar los ítems */
  totalCentavos: number | null;
  items: ItemPropuesto[];
  nota: string | null;
};

export async function interpretar(
  texto: string,
  candidatos: Candidato[],
): Promise<MovimientoPropuesto[]> {
  const respuesta = await cliente().chat.completions.create({
    model: MODELO_TEXTO,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: INSTRUCCIONES },
      {
        role: "user",
        content: [
          candidatos.length
            ? `Clientes que ya existen (usá el nombre tal cual si el audio se refiere a alguno): ${candidatos.map((c) => c.nombre).join(", ")}`
            : "Todavía no hay clientes cargados.",
          "",
          `Transcripción: "${texto}"`,
        ].join("\n"),
      },
    ],
  });

  const crudo = respuesta.choices[0]?.message?.content;
  if (!crudo) return [];

  let json: unknown;
  try {
    json = JSON.parse(crudo);
  } catch {
    throw new Error("El modelo no devolvió un JSON válido");
  }

  const parseado = esquemaRespuesta.safeParse(json);
  if (!parseado.success) {
    throw new Error("El modelo devolvió un JSON con una forma inesperada");
  }

  return parseado.data.movimientos.map((m) => {
    const coincidencia = buscarCoincidencia(m.cliente, candidatos);
    return {
      nombreDicho: m.cliente,
      clienteId: coincidencia?.cliente.id ?? null,
      nombreResuelto: coincidencia?.cliente.nombre ?? m.cliente,
      esClienteNuevo: !coincidencia,
      tipo: m.tipo,
      totalCentavos: m.total != null ? pesosACentavos(m.total) : null,
      items: (m.items ?? []).map((item) => ({
        descripcion: item.descripcion.trim(),
        cantidad: item.cantidad ?? 1,
        precioUnitarioCentavos:
          item.precio != null ? pesosACentavos(item.precio) : null,
      })),
      nota: m.nota?.trim() || null,
    };
  });
}
