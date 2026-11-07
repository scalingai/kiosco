import AccionesFlotantes from "@/components/AccionesFlotantes";
import FondoMarca from "@/components/Lava";
import RegistrarSW from "@/components/RegistrarSW";
import { listarProveedores } from "@/lib/caja";
import { listarCandidatos } from "@/lib/consultas";
import { haySesion, pinConfigurado } from "@/lib/sesion";
import { listarParaVender, type ProductoVendible } from "@/lib/stock";
import { listarSucursales } from "@/lib/sucursales";

/**
 * El armazón de la app del kiosquero: la lava de marca, el menú y la hoja de
 * trabajo blanca encima.
 *
 * Vive acá y no en el layout raíz porque la vidriera (`/tienda`) cuelga del
 * mismo raíz y NO puede tener nada de esto: ni el menú, ni —sobre todo— los
 * datos que se cargan abajo.
 */
export default async function PanelLayout({
  children,
}: LayoutProps<"/">) {
  let candidatos: { id: string; nombre: string }[] = [];
  let productos: ProductoVendible[] = [];
  let proveedores: { id: string; nombre: string }[] = [];
  let sucursalConQr: { id: string; nombre: string } | null = null;

  /*
   * NADA de esto se carga sin sesión, y la razón no es obvia: `/entrar` está
   * fuera del matcher del middleware —tiene que estarlo, es el portón— pero se
   * dibuja adentro de ESTE layout. Todo lo que se cargue acá viaja al
   * navegador de cualquiera que abra la pantalla de login.
   *
   * Y lo que viaja no es poco: los nombres de los clientes, los proveedores, y
   * el catálogo con el COSTO de cada producto. El costo es lo más sensible que
   * tiene la app —es a cuánto compra, o sea cuánto gana— y kiosco.naviacloud.com
   * está en internet. El middleware no alcanza para esto porque el layout corre
   * igual; el único lugar donde se puede preguntar es acá.
   */
  if (await haySesion()) {
    try {
      [candidatos, productos, proveedores] = await Promise.all([
        listarCandidatos(),
        // El catálogo va en el layout y no en la página de ventas porque la
        // venta se arranca desde donde sea que estés: el cliente llega al
        // mostrador sin fijarse qué pantalla tenías abierta.
        listarParaVender(),
        listarProveedores(),
      ]);

      // El QR del mostrador: la primera sucursal que ya lo tenga creado. Con
      // dos locales, cada aparato atiende en el suyo, y preguntar la sucursal
      // en cada venta sería preguntar todo el día algo que no cambia.
      const locales = await listarSucursales();
      const conQr = locales.find((l) => l.conectada && l.qrImagen);
      sucursalConQr = conQr ? { id: conQr.id, nombre: conQr.nombre } : null;
    } catch {
      // Si la base no contesta, el portón y la pantalla de sin conexión tienen
      // que seguir dibujándose igual.
      candidatos = [];
      productos = [];
      proveedores = [];
    }
  }

  return (
    <>
      {/*
        El marco de marca: el verde con la lava, anclado a la PANTALLA y no al
        documento. Fijo a propósito — al scrollear, el humo se queda quieto y
        lo que se mueve es la hoja de trabajo, que es lo que da la sensación
        de tarjeta apoyada encima en vez de fondo pegado al contenido.
      */}
      <div className="fixed inset-0 z-0">
        <FondoMarca />
      </div>

      {/*
        El menú es fijo: una columna a la izquierda en pantalla grande y una
        barra con un solo botón arriba en el celular. Los dos van
        transparentes sobre la lava, así que el contenido se corre para
        dejarles el lugar en vez de taparlos.
      */}
      {/* El corrimiento usa el MISMO corte que el menú (`escritorio`, que
          viene de main). Con `lg` acá y `escritorio` allá, una tablet acostada
          mostraba la columna encima del contenido: el menú aparecía a los
          768px y el contenido recién se corría a los 1024. */}
      <div className="relative z-10 escritorio:pl-56">
        {/*
          La hoja de trabajo. Arranca debajo de la barra en el celular y al
          costado del menú en escritorio, con el filete verde alrededor: ese
          respiro es lo único que hace leer el contenido como una tarjeta
          apoyada sobre la marca y no como una página pintada de verde.
        */}
        <div className="mt-14 min-h-[calc(100dvh-3.5rem)] rounded-t-3xl bg-papel shadow-xl escritorio:mb-2 escritorio:mr-2 escritorio:mt-2 escritorio:min-h-[calc(100dvh-1rem)] escritorio:rounded-3xl">
          {/*
            Antes esto estaba capado en 5xl (1024px) y las planillas no
            entraban: con el menú al costado sobraba pantalla y la tabla igual
            scrolleaba. 7xl usa lo que hay sin volver ilegibles las pantallas
            de lectura.
          */}
          <main className="mx-auto w-full max-w-7xl px-4 pb-24 pt-6 sm:px-6 lg:px-8">
            {children}
          </main>
        </div>
      </div>

      <AccionesFlotantes
        clientes={candidatos}
        conSalir={Boolean(pinConfigurado())}
        productos={productos}
        proveedores={proveedores}
        sucursalConQr={sucursalConQr}
      />
      <RegistrarSW />
    </>
  );
}
