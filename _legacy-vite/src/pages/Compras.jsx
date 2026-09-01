import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import PeriodSelector from '../components/PeriodSelector';
import { api } from '../api';
import { MESES, formatMoney, today } from '../helpers';

export default function Compras() {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [anio, setAnio] = useState(now.getFullYear());
  const [compras, setCompras] = useState([]);
  const [tab, setTab] = useState('cigarrillos');
  const [proveedores, setProveedores] = useState([]);

  const [form, setForm] = useState({ fecha: today(), proveedor_nombre: '', importe: '' });

  const load = () => {
    api.getCompras(mes, anio).then(setCompras).catch(() => setCompras([]));
    api.getProveedores().then(setProveedores).catch(() => {});
  };

  useEffect(load, [mes, anio]);

  const handlePeriod = (m, a) => { setMes(m); setAnio(a); };

  const filtered = compras.filter(c => c.categoria === tab);
  const total = filtered.reduce((s, c) => s + Number(c.importe), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.proveedor_nombre || !form.importe) return;
    await api.createCompra({
      fecha: form.fecha,
      proveedor_nombre: form.proveedor_nombre,
      categoria: tab,
      importe: Number(form.importe),
    });
    setForm({ fecha: today(), proveedor_nombre: '', importe: '' });
    load();
  };

  const handleDelete = async (id) => {
    await api.deleteCompra(id);
    load();
  };

  return (
    <>
      <div className="page-header">
        <h1>Compras - {MESES[mes - 1]} {anio}</h1>
        <PeriodSelector mes={mes} anio={anio} onChange={handlePeriod} />
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'cigarrillos' ? 'active' : ''}`} onClick={() => setTab('cigarrillos')}>
          Cigarrillos
        </button>
        <button className={`tab ${tab === 'varios' ? 'active' : ''}`} onClick={() => setTab('varios')}>
          Varios
        </button>
      </div>

      <div className="table-container">
        <div className="table-header">
          <h2>Compras {tab === 'cigarrillos' ? 'Cigarrillos' : 'Varios'}</h2>
          <span className="mono" style={{ color: 'var(--accent)', fontWeight: 700 }}>{formatMoney(total)}</span>
        </div>

        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>Fecha</label>
                <input type="date" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Proveedor</label>
                <input
                  type="text"
                  placeholder="Ej: OSLE, LATAM, COCA..."
                  value={form.proveedor_nombre}
                  onChange={e => setForm({ ...form, proveedor_nombre: e.target.value })}
                  list="proveedores-list"
                />
                <datalist id="proveedores-list">
                  {proveedores.map(p => <option key={p.id} value={p.nombre} />)}
                </datalist>
              </div>
              <div className="form-group">
                <label>Importe</label>
                <input
                  type="number"
                  placeholder="0"
                  value={form.importe}
                  onChange={e => setForm({ ...form, importe: e.target.value })}
                />
              </div>
              <button type="submit" className="btn btn-primary">
                <Plus size={16} /> Agregar
              </button>
            </div>
          </form>
        </div>

        {filtered.length === 0 ? (
          <div className="empty"><p>No hay compras cargadas para este periodo</p></div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Proveedor</th>
                <th style={{ textAlign: 'right' }}>Importe</th>
                <th style={{ width: 50 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(c => (
                <tr key={c.id}>
                  <td>{new Date(c.fecha).toLocaleDateString('es-AR')}</td>
                  <td>{c.proveedor_nombre}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{formatMoney(c.importe)}</td>
                  <td>
                    <button className="btn-ghost" onClick={() => handleDelete(c.id)}>
                      <Trash2 size={14} />
                    </button>
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
