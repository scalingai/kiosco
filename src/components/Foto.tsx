"use client";

import { useState } from "react";

/**
 * Una imagen con plan B.
 *
 * Existe porque las fotos del catálogo viven en TRES lugares y ninguno de los
 * tres es confiable solo:
 *
 * 1. `/productos/…` — la foto re-fotografiada adentro del kiosco. Es la buena,
 *    pero es un archivo del repo: entre que se genera y que alguien deploya,
 *    en producción devuelve 404.
 * 2. El link al catálogo del supermercado de donde salió. Sigue vivo hoy y
 *    puede morir mañana; no es nuestro.
 * 3. `/rubros/…` — la foto del rubro. Misma historia que la 1.
 *
 * Sin esto, cualquiera de los tres rompiéndose deja el ícono de imagen rota,
 * que se ve peor que no tener foto. Acá se prueban en orden y, si fallan
 * todas, el componente no dibuja nada y deja que el que lo usa muestre lo que
 * tenga (la inicial del nombre, o nada).
 *
 * `<img>` a secas y no `next/image`: las fuentes son CDNs ajenas y
 * optimizarlas obligaría a declarar cada dominio para nada.
 */
export default function Foto({
  fuentes,
  alt = "",
  className,
  claseFinal,
  width,
  height,
  children,
}: {
  /** en orden de preferencia; los nulos se ignoran */
  fuentes: (string | null | undefined)[];
  alt?: string;
  /** clases cuando se está mostrando una de las primeras fuentes */
  className?: string;
  /** clases cuando se cayó a la última (la del rubro), si se quiere distinta */
  claseFinal?: string;
  width?: number;
  height?: number;
  /** qué dibujar si no anduvo ninguna */
  children?: React.ReactNode;
}) {
  const lista = fuentes.filter((f): f is string => Boolean(f));
  const [cual, setCual] = useState(0);

  if (cual >= lista.length) return <>{children}</>;

  const esUltima = cual === lista.length - 1 && lista.length > 1;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- ver arriba
    <img
      // La key fuerza a React a rehacer el <img> al cambiar de fuente. Sin
      // ella reusa el nodo, el navegador no reintenta y queda la rota.
      key={lista[cual]}
      src={lista[cual]}
      alt={alt}
      loading="lazy"
      width={width}
      height={height}
      onError={() => setCual((n) => n + 1)}
      className={(esUltima && claseFinal) || className}
    />
  );
}
