"use client";

import { useEffect, useRef } from "react";

/**
 * La lava: el fondo de marca del panel, portado de AppGenda
 * (`src/components/auth/PlasmaGradient.tsx` + `dashboard/fondo-marca.tsx`).
 *
 * No es un `linear-gradient`: es un campo de luminancia calculado por píxel y
 * cuantizado con una matriz Bayer 8×8. Ese dithering es lo que se ve como
 * granulado, y es justo lo que un degradé de CSS no puede imitar.
 *
 * Tres decisiones que lo hacen barato en un celular, que es donde se usa esta
 * app:
 *  - Se dibuja a MEDIA resolución y se escala con `image-rendering: pixelated`.
 *    Son 21 iteraciones por píxel: a resolución completa no es gratis.
 *  - El `IntersectionObserver` corta el rAF cuando el canvas no está en pantalla.
 *  - Con `prefers-reduced-motion` dibuja UN cuadro y para. No desaparece: el
 *    fondo sigue ahí, quieto.
 *
 * Si no hay WebGL2 no pinta nada y queda el verde plano de abajo. Es
 * degradación a propósito: la lava es decorativa, y el menú se tiene que poder
 * usar igual.
 */

const VERT = `#version 300 es
in vec2 a;
void main(){ gl_Position = vec4(a, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uBajo;    // color de las zonas oscuras
uniform vec3 uAlto;    // color de las zonas claras
uniform float uAlpha;  // opacidad, premultiplicada
uniform float uBrillo; // cuánta luminancia conserva
uniform float uCurva;  // gamma: separa luces de medios
uniform vec2 uOff;     // dónde cae el canvas dentro del campo
uniform vec2 uCampo;   // tamaño del campo: la pantalla entera
out vec4 o;

const float TIME_SPEED = 1.0, SEED_Z = -0.4, MOD_T = 0.8, MOD_WARP = 1.5, MOD_Z = 1.0, MOD_F = 2.0;
const int ITER = 21;
const float ROT = -0.1, MIX1 = 1.8, MIX2 = 0.5, FALL_Y = 5.0, FALL_X = 7.0, CONTRAST = 0.71, GAMMA = 1.49;

float modulate(vec3 p, float t){
  p.y += MOD_WARP * sin(p.x + t);
  p.z += MOD_Z * t;
  return length(0.2 * sin(p.x / MOD_F + p.y) + cos(p.zzx / (MOD_F * 2.0))) - MOD_T;
}
vec2 rot(vec2 v, float a){ float s = sin(a), c = cos(a); return mat2(c, -s, s, c) * v; }

float plasma(vec2 frag){
  vec2 uv = ((frag + uOff) / uCampo) * 2.0 - 1.0;
  uv.x *= uCampo.x / uCampo.y;
  vec3 col = 0.5 - vec3(uv, SEED_Z);
  vec3 orig = col;
  float t = uTime * TIME_SPEED;
  for (int i = 0; i < ITER; i++) {
    vec3 c = col;
    c.xy = rot(c.xy, t * ROT);
    orig += modulate(orig, t) * c;
  }
  vec3 c = abs(modulate(orig * MIX1, t) * vec3(0.3 + sin(orig.x) / 3.0, 0.1, 0.1)
             + modulate(orig * MIX2, t) * vec3(0.1, 0.12, 0.15)) * (FALL_Y - orig.y / 2.0) * 0.5;
  c = clamp(c, 0.0, 1.0);
  c += abs(modulate(orig + col, t) * vec3(0.30, 0.15, 0.10)
         + modulate(orig * MIX2, t) * vec3(0.10, 0.05, 0.00)) * (FALL_X - orig.x / 3.0) * 0.5;
  c = clamp(c * CONTRAST, 0.0, 1.0);
  c = clamp(pow(c, vec3(GAMMA)), 0.0, 1.0);
  return dot(c, vec3(0.2125, 0.7154, 0.0721));
}

// Umbral Bayer 8x8, 0..63, por intercalado de bits.
float bayer(vec2 p){
  ivec2 q = ivec2(mod(p, 8.0));
  int x = q.x ^ q.y, y = q.y;
  int v = ((x & 1) << 5) | ((y & 1) << 4) | ((x & 2) << 2) | ((y & 2) << 1) | ((x & 4) >> 1) | ((y & 4) >> 2);
  return float(v);
}
// Once grises fijos, no una rampa pareja: es lo que da el granulado parejo.
float grisCercano(float r){
  float g[11] = float[](0.0, 27.0, 48.0, 71.0, 94.0, 119.0, 145.0, 171.0, 198.0, 226.0, 255.0);
  float best = 0.0, d = 1e6;
  for (int i = 0; i < 11; i++) { float e = abs(r - g[i]); if (e < d) { d = e; best = g[i]; } }
  return best;
}

void main(){
  float lum = plasma(gl_FragCoord.xy);
  float ref = lum * 255.0 + bayer(gl_FragCoord.xy);
  float gris = grisCercano(clamp(ref, 0.0, 255.0)) / 255.0;
  // La luminancia NO se pinta como gris: se usa de interpolador entre dos
  // colores de la paleta, así el humo sale ya dentro del verde de la marca.
  // La curva es lo que le da VOLUMEN en vez de un lavado parejo.
  float g = pow(gris, uCurva);
  vec3 col = mix(uBajo, uAlto, g) * uBrillo;
  // Premultiplicado: donde el humo es fino se ve el verde de abajo.
  o = vec4(col * uAlpha, uAlpha);
}`;

/**
 * El verde del ícono de AppGenda (tono «favigenda»): de `#0f5430` en las
 * sombras a `#64d485` en las luces. Es el mismo par que usa el panel.
 */
const BAJO = [0.06, 0.33, 0.19] as const;
const ALTO = [0.392, 0.832, 0.522] as const;

/** El tono general. Más abajo se ve lavado; más arriba se come el texto. */
const BRILLO = 0.84;

/** El verde plano de base, el que se ve el instante antes del primer cuadro. */
export const VERDE_MARCA = "#14663c";

function Plasma() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl2", {
      antialias: false,
      alpha: true,
      premultipliedAlpha: true,
      powerPreference: "low-power",
    });
    if (!gl) return;

    // El doble montaje de React en dev devuelve el MISMO contexto; si una
    // pasada anterior lo soltó, hay que recuperarlo antes de compilar.
    const perder = gl.getExtension("WEBGL_lose_context");
    if (gl.isContextLost()) perder?.restoreContext();

    // Un shader que no compila deja la pantalla igual que si no hubiera WebGL,
    // así que sin este log el modo de falla es invisible.
    const compilar = (tipo: number, fuente: string) => {
      const sh = gl.createShader(tipo)!;
      gl.shaderSource(sh, fuente);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        console.error("[Lava] el shader no compila:", gl.getShaderInfoLog(sh));
      }
      return sh;
    };

    const prog = gl.createProgram()!;
    gl.attachShader(prog, compilar(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compilar(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.error("[Lava] el link falló:", gl.getProgramInfoLog(prog));
      return;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const loc = gl.getAttribLocation(prog, "a");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, "uRes");
    const uOff = gl.getUniformLocation(prog, "uOff");
    const uCampo = gl.getUniformLocation(prog, "uCampo");
    const uTime = gl.getUniformLocation(prog, "uTime");
    gl.uniform3f(gl.getUniformLocation(prog, "uBajo"), BAJO[0], BAJO[1], BAJO[2]);
    gl.uniform3f(gl.getUniformLocation(prog, "uAlto"), ALTO[0], ALTO[1], ALTO[2]);
    gl.uniform1f(gl.getUniformLocation(prog, "uAlpha"), 1);
    gl.uniform1f(gl.getUniformLocation(prog, "uBrillo"), BRILLO);
    gl.uniform1f(gl.getUniformLocation(prog, "uCurva"), 0.9);

    // Media resolución, que el dither disimula y el celular agradece.
    const ESCALA = 0.5;

    /*
     * Sincroniza el buffer con el tamaño en pantalla. Se llama en CADA cuadro y
     * no sólo desde un `ResizeObserver` porque el RO no reporta elementos con
     * `display:none`, y el sidebar arranca oculto en el celular. Comparar dos
     * enteros por cuadro es gratis; sólo toca la GPU cuando cambió el tamaño.
     *
     * El campo es la PANTALLA, no el canvas: así el sidebar y la barra de
     * arriba —que son dos canvas distintos— muestran el mismo humo y empalman
     * sin corte donde se tocan.
     */
    const sincronizar = () => {
      const r = canvas.getBoundingClientRect();
      const w = Math.max(1, Math.round(r.width * ESCALA));
      const h = Math.max(1, Math.round(r.height * ESCALA));
      // En GL la y crece hacia arriba: el corrimiento se mide desde abajo.
      gl.uniform2f(
        uOff,
        r.left * ESCALA,
        (window.innerHeight - r.bottom) * ESCALA,
      );
      gl.uniform2f(
        uCampo,
        window.innerWidth * ESCALA,
        window.innerHeight * ESCALA,
      );
      if (canvas.width === w && canvas.height === h) return;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
    };
    sincronizar();

    const reducido = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let visible = true;
    let raf = 0;
    const t0 = performance.now();

    const cuadro = (ahora: number) => {
      raf = 0;
      sincronizar();
      gl.uniform1f(uTime, (ahora - t0) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (visible && !reducido) raf = requestAnimationFrame(cuadro);
    };
    raf = requestAnimationFrame(cuadro);

    // Con `prefers-reduced-motion` el rAF dibuja un solo cuadro y para, así que
    // un cambio de tamaño posterior (rotar el teléfono, abrir el teclado) lo
    // dejaría estirado. El RO redibuja en ese caso puntual.
    const ro = new ResizeObserver(() => {
      if (!reducido) return;
      sincronizar();
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    });
    ro.observe(canvas);

    // Sólo gastar GPU mientras el canvas está en pantalla.
    const io = new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      if (visible && !raf && !reducido) raf = requestAnimationFrame(cuadro);
    });
    io.observe(canvas);

    return () => {
      ro.disconnect();
      io.disconnect();
      if (raf) cancelAnimationFrame(raf);
      gl.deleteProgram(prog);
      gl.deleteBuffer(buf);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full [image-rendering:pixelated]"
    />
  );
}

/**
 * La superficie verde de la marca: la lava, un vidrio que la hunde para que el
 * texto blanco se lea, y un brillo arriba.
 *
 * `velo` "degradado" oscurece hacia abajo (alto de pantalla: el sidebar);
 * "parejo" es plano, para piezas chicas que tienen que empatar entre sí.
 */
export default function FondoMarca({
  velo = "degradado",
}: {
  velo?: "degradado" | "parejo";
}) {
  return (
    // `rounded-[inherit]` + la máscara: en Safari/iOS un `overflow-hidden`
    // redondeado NO recorta un canvas WebGL, y la lava asoma en cuadrado por
    // las esquinas. Con la máscara el recorte sí se respeta.
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] [-webkit-mask-image:-webkit-radial-gradient(white,black)] [mask-image:radial-gradient(white,black)]"
      style={{ backgroundColor: VERDE_MARCA }}
    >
      <Plasma />
      <div
        className="absolute inset-0"
        style={{
          background:
            velo === "degradado"
              ? "linear-gradient(180deg, rgba(4,40,22,.04), rgba(4,40,22,.26) 60%, rgba(4,40,22,.45))"
              : "rgba(4,40,22,.22)",
        }}
      />
      <div
        className="absolute inset-0 mix-blend-screen"
        style={{
          background:
            "linear-gradient(180deg, rgba(255,255,255,.08), transparent 28%), linear-gradient(90deg, transparent 10%, rgba(255,255,255,.05) 50%, transparent 90%)",
        }}
      />
    </div>
  );
}
