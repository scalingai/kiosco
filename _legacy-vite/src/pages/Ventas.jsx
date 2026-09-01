import { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import PeriodSelector from '../components/PeriodSelector';
import { api } from '../api';
import { MESES, formatMoney, today } from '../helpers';

export default function Ventas() {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [anio, setAnio] = useState(now.getFullYear());
  const [ventas, setVentas] = useState([]);
  const [tab, setTab] = useState('cigarrillos');

  const [form, setForm] = useState({ fecha: today(), importe: '' });

  const load = () => {
    api.getVentas(mes, anio).then(setVentas).catch(() => setVentas([]));
  };

  useEffect(load, [mes, anio]);

  const handlePeriod = (m, a) => { setMes(m); setAnio(a); };

  const filtered = ventas.filter(v => v.categoria === tab);
  const total = filtered.reduce((s, v) => s + Number(v.importe), 0);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.importe) return;
    await api.createVenta({
      fecha: form.fecha,
      categoria: tab,
      importe: Number(form.importe),
    });
    setForm({ fecha: today(), importe: '' });
    load();
  };

  const handleDelete = async (id) => {
    await api.deleteVenta(id);
    load();
  };

  return (
    <>
      <div className="page-header">
        <h1>Ventas - {MESES[mes - 1]} {anio}</h1>
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
          <h2>Ventas {tab === 'cigarrillos' ? 'Cigarrillos' : 'Varios'}</h2>
          <span className="mono" style={{ color: 'var(--green)', fontWeight: 700 }}>{formatMoney(total)}</span>
        </div>

        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
          <form onSubmit={handleSubmit}>
            <div className="form-row">
              <div className="form-group">
                <label>Fecha</label>
                <input type="date" value={form.fecha} onChange={e => setForm({ ...form, fecha: e.target.value })} />
              </div>
              <div className="form-group" style={{ flex: 1 }}>
                <label>Importe del dia</label>
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
          <div className="empty"><p>No hay ventas cargadas para este periodo</p></div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th style={{ textAlign: 'right' }}>Importe</th>
                <th style={{ width: 50 }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(v => (
                <tr key={v.id}>
                  <td>{new Date(v.fecha).toLocaleDateString('es-AR')}</td>
                  <td className="mono" style={{ textAlign: 'right' }}>{formatMoney(v.importe)}</td>
                  <td>
                    <button className="btn-ghost" onClick={() => handleDelete(v.id)}>
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
