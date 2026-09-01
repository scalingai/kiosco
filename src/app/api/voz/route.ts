import { NextResponse } from "next/server";
import { listarCandidatos } from "@/lib/consultas";
import { FaltaLaClave, interpretar, transcribir } from "@/lib/voz";

export const runtime = "nodejs";
export const maxDuration = 60;

/** 25 MB es el techo de la API de Groq */
const LIMITE_BYTES = 25 * 1024 * 1024;

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
    const candidatos = await listarCandidatos();
    const propuestas = await interpretar(transcripcion, candidatos);
    return NextResponse.json({ transcripcion, propuestas });
  } catch (error) {
    if (error instanceof FaltaLaClave) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }
    console.error("[voz]", error);
    return NextResponse.json(
      { error: "Falló la transcripción. Probá de nuevo o cargalo a mano." },
      { status: 502 },
    );
  }
}
