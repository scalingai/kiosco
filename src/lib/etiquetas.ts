/** Nombres para góndola: marca, variante y tamaño, en hasta 14 caracteres. */
export function nombreParaEtiqueta(nombre: string): string {
  let corto = nombre.trim().replace(/\s+/g, " ");
  const cambios: [RegExp, string][] = [
    [/papel higi[eé]nico/gi, ""], [/protector femenino/gi, ""],
    [/toallitas|limpiador|tintura/gi, ""], [/aceite/gi, ""],
    [/acondicionador/gi, "Ac"], [/shampoo/gi, "Sh"],
    [/\byerba\b|\bcaldo\b|\balmid[oó]n\b/gi, ""],
    [/jab[oó]n en polvo/gi, "Jab"], [/bicarbonato/gi, "Bic"],
    [/dos anclas/gi, "D.Anclas"], [/siempre libre/gi, "S.Libre"],
    [/buenas noches/gi, "Noche"], [/mega crecimiento/gi, "Crec"],
    [/flor de primavera/gi, "Flor"], [/frescura/gi, ""],
    [/hialur[oó]nico/gi, "Hial"], [/col[aá]geno/gi, "Col"],
    [/invisible/gi, "Inv"], [/lavanda/gi, "Lav"],
    [/decolorante/gi, "Dec"], [/polvo/gi, ""],
    [/verdura/gi, "Verd"], [/gallina/gi, "Gall"],
    [/girasol|com[uú]n|normal|regular|estuche|especial|premium|fina|con alas|4 flex/gi, ""],
    [/unidades/gi, "u"], [/\bun\b/gi, "u"],
    [/(\d)\s*x\s*(\d)/gi, "$1x$2"],
    [/(\d)\s+(ml|cc|kg|g|m|l|u)\b/gi, "$1$2"],
  ];
  for (const [patron, reemplazo] of cambios) corto = corto.replace(patron, reemplazo);
  if (/^(Sh|Ac)\s/i.test(corto)) {
    corto = corto.replace(/Sedal/gi, "Sed").replace(/(\d+)ml\b/gi, "$1").replace(/(Crec|Col|Hial)\s+(\d)/gi, "$1$2");
  }
  const partes = corto.trim().split(/\s+/).filter(Boolean);
  // Reduce palabras largas antes de tocar números: 190ml y N8 identifican la presentación.
  while (partes.join(" ").length > 14) {
    let candidato = -1;
    for (let i = 0; i < partes.length; i++) {
      if (!/\d/.test(partes[i]) && partes[i].length > 3 && (candidato < 0 || partes[i].length > partes[candidato].length)) candidato = i;
    }
    if (candidato < 0) break;
    partes[candidato] = partes[candidato].slice(0, -1);
  }
  corto = partes.join(" ");
  if (corto.length <= 14) return corto;
  // En nombres desconocidos, reserva el final para el tamaño en vez de cortarlo.
  const final = partes.at(-1) ?? "";
  if (/\d/.test(final) && final.length < 10) return `${partes.slice(0, -1).join(" ").slice(0, 13 - final.length).trim()} ${final}`;
  return corto.slice(0, 14).trim();
}
