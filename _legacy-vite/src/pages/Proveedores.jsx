import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Trash2, ChevronRight } from 'lucide-react';
import { api } from '../api';
import { formatMoney } from '../helpers';

export default function Proveedores() {
  const [proveedores, setProveedores] = useState([]);
  const [nombre, setNombre] = useState('');
  const navigate = useNavigate();

  const load = () => {
    api.getProveedoresStats().then(setProveedores).catch(() => setProveedores([]));
  };

  useEffect(load, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!nombre.trim()) return;
    await api.createProveedor(nombre);
    setNombre('');
    load();
  };

  const handleDelete = async (id) => {
    const res = await api.deleteProveedor(id);
    if (res.error) {
      alert(res.error);
      return;
    }
    load();
  };

  return (
    <>
      <div className="page-header">
        <h1>Proveedores</h1>
      </div>

      <div className="table-container">
        <div className="table-header">
          <h2>Agregar proveedor</h2>
        </div>
        <div style={{ padding: '16px 20px' }}>
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group" style={{ flex: 1 }}>
                <label>Nombre</label>
                <input
                  type="text"
                  placeholder="Ej: OSLE, LATAM, COCA..."
                  value={nombre}
                  onChange={e => setNombre(e.target.value)}
                />
              </div>
              <button type="submit" className="btn btn-primary">
                <Plus size={16} /> Agregar
              </button>
            </div>
          </form>
        </div>
      </div>

      <div className="table-container">
        <div className="table-header">
          <h2>Listado ({proveedores.length})</h2>
        </div>
        {proveedores.length === 0 ? (
          <div className="empty"><p>No hay proveedores cargados</p></div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Nombre</th>
                <th style={{ textAlign: 'right' }}>Compras</th>
                <th style={{ textAlign: 'right' }}>Total comprado</th>
                <th style={{ textAlign: 'right' }}>Ultima compra</th>
                <th style={{ width: 80 }}></th>
              </tr>
            </thead>
            <tbody>
              {proveedores.map(p => (
                <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/proveedores/${p.id}`)}>
                  <td style={{ fontWeight: 600 }}>{p.nombre}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{p.total_compras}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{formatMoney(p.total_importe)}</td>
                  <td style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: 13 }}>
                    {p.ultima_compra ? new Date(p.ultima_compra + 'T12:00:00').toLocaleDateString('es-AR') : '-'}
                  </td>
                  <td style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                    <button className="btn-ghost" onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}>
                      <Trash2 size={14} />
                    </button>
                    <ChevronRight size={16} style={{ color: 'var(--text-muted)' }} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
