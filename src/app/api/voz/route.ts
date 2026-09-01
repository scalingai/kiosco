import { NextResponse } from "next/server";
import { guardarNota, listarCandidatos } from "@/lib/consultas";
import { FaltaLaClave, interpretar, transcribir } from "@/lib/voz";

export const runtime = "nodejs";
export const maxDuration = 60;

/** 25 MB es el techo de la API de Groq */
const LIMITE_BYTES = 25 * 1024 * 1024;

/**
 * Traduce lo que devolvió Groq a algo accionable. Sin esto, cualquier problema
 * —clave vencida, modelo dado de baja, cuota agotada— sale como el mismo
 * "falló la transcripción", y desde el celular no hay forma de ver el log.
 */
function explicarFalla(error: unknown): string {
  const estado =
    typeof error === "object" && error !== null && "status" in error
      ? Number((error as { status: unknown }).status)
      : 0;

  if (estado === 401 || estado === 403) {
    return "Groq rechazó la clave. Revisá GROQ_API_KEY.";
  }
  if (estado === 404) {
    return "Groq dio de baja el modelo configurado. Hay que actualizar GROQ_MODELO_AUDIO o GROQ_MODELO_TEXTO.";
  }
  if (estado === 429) {
    return "Groq está limitando los pedidos. Esperá un momento y probá de nuevo.";
  }
  if (estado === 413) {
    return "El audio es muy largo para Groq. Probá con uno más corto.";
  }
  if (estado >= 500) {
    return "Groq está caído. Probá en un rato o cargalo a mano.";
  }
  return "Falló la transcripción. Probá de nuevo o cargalo a mano.";
}

/**
 * Transcribe el audio y propone movimientos. NO escribe nada en la base:
 * devuelve una propuesta que la persona confirma en pantalla. Whisper se
 * equivoca con nombres y con números, y acá eso es la deuda de alguien.
 */
export async function POST(request: Request) {
  let audio: File | null = null;
  try {
    const form = await request.formData();
    const campo = form.get("audio");
    if (campo instanceof File) audio = campo;
  } catch {
    return NextResponse.json(
      { error: "No pude leer el audio que llegó" },
      { status: 400 },
    );
  }

  if (!audio || audio.size === 0) {
    return NextResponse.json({ error: "No llegó ningún audio" }, { status: 400 });
  }
  if (audio.size > LIMITE_BYTES) {
    return NextResponse.json(
      { error: "El audio es muy largo. Probá con uno más corto." },
      { status: 413 },
    );
  }

  try {
    const transcripcion = await transcribir(audio);
    if (!transcripcion) {
      return NextResponse.json({ transcripcion: "", propuestas: [] });
    }

    // La nota se guarda ACÁ, antes de interpretar y antes de que nadie
    // confirme. Si el modelo falla o se descarta la propuesta, lo que dijiste
    // igual queda anotado y se recupera desde el historial.
    const nota = await guardarNota(transcripcion);

    const candidatos = await listarCandidatos();
    const propuestas = await interpretar(transcripcion, candidatos);
    return NextResponse.json({ notaId: nota.id, transcripcion, propuestas });
  } catch (error) {
    if (error instanceof FaltaLaClave) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("[voz]", error);
    return NextResponse.json({ error: explicarFalla(error) }, { status: 502 });
  }
}
