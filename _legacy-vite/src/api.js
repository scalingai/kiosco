const API = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

async function request(path, options = {}) {
  const res = await fetch(`${API}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  return res.json();
}

export const api = {
  // Proveedores
  getProveedores: () => request('/proveedores'),
  getProveedoresStats: () => request('/proveedores/stats'),
  getProveedorHistorial: (id) => request(`/proveedores/${id}/historial`),
  createProveedor: (nombre) => request('/proveedores', { method: 'POST', body: JSON.stringify({ nombre }) }),
  updateProveedor: (id, nombre) => request(`/proveedores/${id}`, { method: 'PUT', body: JSON.stringify({ nombre }) }),
  deleteProveedor: (id) => request(`/proveedores/${id}`, { method: 'DELETE' }),

  // Compras
  getCompras: (mes, anio) => request(`/compras?mes=${mes}&anio=${anio}`),
  createCompra: (data) => request('/compras', { method: 'POST', body: JSON.stringify(data) }),
  deleteCompra: (id) => request(`/compras/${id}`, { method: 'DELETE' }),

  // Ventas
  getVentas: (mes, anio) => request(`/ventas?mes=${mes}&anio=${anio}`),
  createVenta: (data) => request('/ventas', { method: 'POST', body: JSON.stringify(data) }),
  deleteVenta: (id) => request(`/ventas/${id}`, { method: 'DELETE' }),

  // Resumenes
  getResumen: (mes, anio) => request(`/resumen?mes=${mes}&anio=${anio}`),
  getResumenAnual: (anio) => request(`/resumen-anual?anio=${anio}`),
};
