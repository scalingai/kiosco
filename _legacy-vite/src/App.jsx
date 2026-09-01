import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ResumenAnual from './pages/ResumenAnual';
import DetalleMes from './pages/DetalleMes';
import Proveedores from './pages/Proveedores';
import ProveedorDetalle from './pages/ProveedorDetalle';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<ResumenAnual />} />
          <Route path="anual" element={<ResumenAnual />} />
          <Route path="mes/:anio/:mes" element={<DetalleMes />} />
          <Route path="proveedores" element={<Proveedores />} />
          <Route path="proveedores/:id" element={<ProveedorDetalle />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
