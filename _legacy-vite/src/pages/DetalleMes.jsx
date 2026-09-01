import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Check, X } from 'lucide-react';
import { api } from '../api';
import { MESES, formatMoney } from '../helpers';

function CompraColumn({ titulo, color, compras, anio, mes, categoria, proveedores, onReload }) {
  const [adding, setAdding] = useState(false);
  const [dia, setDia] = useState(String(new Date().getDate()));
  const [prov, setProv] = useState('');
  const [importe, setImporte] = useState('');
  const diaRef = useRef();

  const total = compras.reduce((s, c) => s + Number(c.importe), 0);

  const reset = () => { setDia(String(new Date().getDate())); setProv(''); setImporte(''); };

  const handleAdd = async () => {
    if (!prov || !importe || !dia) return;
    const fecha = `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    await api.createCompra({ fecha, proveedor_nombre: prov, categoria, importe: Number(importe) });
    reset();
    onReload();
    setTimeout(() => diaRef.current?.focus(), 100);
  };

  const provRef = useRef();
  const open = () => { setAdding(true); setTimeout(() => provRef.current?.focus(), 50); };
  const close = () => { setAdding(false); reset(); };

  // Build date options for the month
  const diasEnMes = new Date(anio, mes, 0).getDate();
  const dateOptions = Array.from({ length: diasEnMes }, (_, i) => i + 1);

  return (
    <div className="table-container">
      <div className="table-header">
        <h2>{titulo}</h2>
        <span className="mono" style={{ color, fontWeight: 700, fontSize: 13 }}>{formatMoney(total)}</span>
      </div>
      <table>
        {compras.length > 0 && (
          <tbody>
            {compras.map(c => (
              <tr key={c.id}>
                <td style={{ width: 30 }}>{new Date(c.fecha + 'T12:00:00').getDate()}</td>
                <td>{c.proveedor_nombre}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{formatMoney(c.importe)}</td>
                <td style={{ width: 28 }}>
                  <button className="btn-ghost" onClick={() => api.deleteCompra(c.id).then(onReload)}><Trash2 size={12} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        )}
      </table>
      {adding ? (
        <div className="inline-form">
          <div className="inline-field" style={{ marginBottom: 10 }}>
            <label>Proveedor</label>
            <input ref={provRef} type="text" placeholder="Nombre del proveedor..." value={prov}
              onChange={e => setProv(e.target.value)} list={`prov-${categoria}`} />
            <datalist id={`prov-${categoria}`}>{proveedores.map(p => <option key={p.id} value={p.nombre} />)}</datalist>
          </div>
          <div className="inline-form-row" style={{ marginBottom: 12 }}>
            <div className="inline-field" style={{ flex: 1 }}>
              <label>Fecha</label>
              <select value={dia} onChange={e => setDia(e.target.value)}>
                {dateOptions.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="inline-field" style={{ flex: 1 }}>
              <label>Importe</label>
              <input type="number" placeholder="0" value={importe}
                onChange={e => setImporte(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()} />
            </div>
          </div>
          <div className="inline-form-actions">
            <button className="btn-inline-confirm" onClick={handleAdd}><Check size={14} /> Agregar</button>
            <button className="btn-inline-cancel" onClick={close}><X size={14} /></button>
          </div>
        </div>
      ) : (
        <button className="add-row-btn" onClick={open}>
          <Plus size={14} /> Agregar fila
        </button>
      )}
    </div>
  );
}

function VentaColumn({ titulo, color, ventas, anio, mes, categoria, onReload }) {
  const [adding, setAdding] = useState(false);
  const [dia, setDia] = useState(String(new Date().getDate()));
  const [importe, setImporte] = useState('');
  const diaRef = useRef();

  const total = ventas.reduce((s, v) => s + Number(v.importe), 0);

  const reset = () => { setDia(String(new Date().getDate())); setImporte(''); };

  const handleAdd = async () => {
    if (!importe || !dia) return;
    const fecha = `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
    await api.createVenta({ fecha, categoria, importe: Number(importe) });
    reset();
    onReload();
    setTimeout(() => diaRef.current?.focus(), 100);
  };

  const impRef = useRef();
  const open = () => { setAdding(true); setTimeout(() => impRef.current?.focus(), 50); };
  const close = () => { setAdding(false); reset(); };

  const diasEnMes = new Date(anio, mes, 0).getDate();
  const dateOptions = Array.from({ length: diasEnMes }, (_, i) => i + 1);

  return (
    <div className="table-container">
      <div className="table-header">
        <h2>{titulo}</h2>
        <span className="mono" style={{ color, fontWeight: 700, fontSize: 13 }}>{formatMoney(total)}</span>
      </div>
      <table>
        {ventas.length > 0 && (
          <tbody>
            {ventas.map(v => (
              <tr key={v.id}>
                <td>{new Date(v.fecha + 'T12:00:00').getDate()}</td>
                <td className="mono" style={{ textAlign: 'right' }}>{formatMoney(v.importe)}</td>
                <td style={{ width: 28 }}>
                  <button className="btn-ghost" onClick={() => api.deleteVenta(v.id).then(onReload)}><Trash2 size={12} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        )}
      </table>
      {adding ? (
        <div className="inline-form">
          <div className="inline-form-row" style={{ marginBottom: 12 }}>
            <div className="inline-field" style={{ flex: 1 }}>
              <label>Fecha</label>
              <select value={dia} onChange={e => setDia(e.target.value)}>
                {dateOptions.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div className="inline-field" style={{ flex: 1 }}>
              <label>Importe</label>
              <input ref={impRef} type="number" placeholder="0" value={importe}
                onChange={e => setImporte(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleAdd()} />
            </div>
          </div>
          <div className="inline-form-actions">
            <button className="btn-inline-confirm" onClick={handleAdd}><Check size={14} /> Agregar</button>
            <button className="btn-inline-cancel" onClick={close}><X size={14} /></button>
          </div>
        </div>
      ) : (
        <button className="add-row-btn" onClick={open}>
          <Plus size={14} /> Agregar fila
        </button>
      )}
    </div>
  );
}

export default function DetalleMes() {
  const { anio, mes } = useParams();
  const navigate = useNavigate();
  const m = Number(mes);
  const a = Number(anio);

  const [resumen, setResumen] = useState(null);
  const [compras, setCompras] = useState([]);
  const [ventas, setVentas] = useState([]);
  const [proveedores, setProveedores] = useState([]);

  const load = () => {
    api.getResumen(m, a).then(setResumen).catch(() => {});
    api.getCompras(m, a).then(setCompras).catch(() => setCompras([]));
    api.getVentas(m, a).then(setVentas).catch(() => setVentas([]));
    api.getProveedores().then(setProveedores).catch(() => {});
  };

  useEffect(load, [m, a]);

  const d = resumen || {
    compras: { cigarrillos: 0, varios: 0, total: 0 },
    ventas: { cigarrillos: 0, varios: 0, total: 0 },
    ganancia: { cigarrillos: 0, varios: 0, total: 0 },
    promedioDiario: { cigarrillos: 0, varios: 0, total: 0 },
    diasConVenta: 0,
  };

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button className="btn-ghost" onClick={() => navigate('/')} style={{ padding: 8, borderRadius: 8 }}>
            <ArrowLeft size={20} />
          </button>
          <h1>{MESES[m - 1]} {a}</h1>
        </div>
      </div>

      {/* Resumen */}
      <div className="table-container" style={{ marginBottom: 24 }}>
        <table>
          <thead>
            <tr>
              <th>{MESES[m - 1].toUpperCase()}</th>
              <th style={{ textAlign: 'right' }}>Cigarrillos</th>
              <th style={{ textAlign: 'right' }}>Varios</th>
              <th style={{ textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>COMPRAS</td>
              <td className="mono" style={{ textAlign: 'right' }}>{formatMoney(d.compras.cigarrillos)}</td>
              <td className="mono" style={{ textAlign: 'right' }}>{formatMoney(d.compras.varios)}</td>
              <td className="mono" style={{ textAlign: 'right' }}>{formatMoney(d.compras.total)}</td>
            </tr>
            <tr>
              <td>VENTAS</td>
              <td className="mono" style={{ textAlign: 'right' }}>{formatMoney(d.ventas.cigarrillos)}</td>
              <td className="mono" style={{ textAlign: 'right' }}>{formatMoney(d.ventas.varios)}</td>
              <td className="mono" style={{ textAlign: 'right' }}>{formatMoney(d.ventas.total)}</td>
            </tr>
            <tr>
              <td style={{ color: 'var(--text-muted)' }}>PROMEDIO DIARIO</td>
              <td className="mono" style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{formatMoney(d.promedioDiario.cigarrillos)}</td>
              <td className="mono" style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{formatMoney(d.promedioDiario.varios)}</td>
              <td className="mono" style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{formatMoney(d.promedioDiario.total)}</td>
            </tr>
            <tr className="row-ganancia" style={{ borderTop: '2px solid var(--border)' }}>
              <td><strong>GANANCIA</strong></td>
              <td className="mono" style={{ textAlign: 'right', color: d.ganancia.cigarrillos >= 0 ? 'var(--green)' : 'var(--accent)' }}>
                <strong>{formatMoney(d.ganancia.cigarrillos)}</strong>
              </td>
              <td className="mono" style={{ textAlign: 'right', color: d.ganancia.varios >= 0 ? 'var(--green)' : 'var(--accent)' }}>
                <strong>{formatMoney(d.ganancia.varios)}</strong>
              </td>
              <td className="mono" style={{ textAlign: 'right', color: d.ganancia.total >= 0 ? 'var(--green)' : 'var(--accent)' }}>
                <strong>{formatMoney(d.ganancia.total)}</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 4 columns */}
      <div className="pdf-grid">
        <CompraColumn titulo="Compras Cigarrillos" color="var(--accent)" categoria="cigarrillos"
          compras={compras.filter(c => c.categoria === 'cigarrillos')}
          anio={a} mes={m} proveedores={proveedores} onReload={load} />

        <CompraColumn titulo="Compras Varios" color="var(--accent)" categoria="varios"
          compras={compras.filter(c => c.categoria === 'varios')}
          anio={a} mes={m} proveedores={proveedores} onReload={load} />

        <VentaColumn titulo="Venta Cigarrillos" color="var(--green)" categoria="cigarrillos"
          ventas={ventas.filter(v => v.categoria === 'cigarrillos')}
          anio={a} mes={m} onReload={load} />

        <VentaColumn titulo="Venta Varios" color="var(--green)" categoria="varios"
          ventas={ventas.filter(v => v.categoria === 'varios')}
          anio={a} mes={m} onReload={load} />
      </div>
    </>
  );
}
