import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Edit3, Check } from 'lucide-react';
import { api } from '../api';
import { MESES, formatMoney } from '../helpers';

export default function ProveedorDetalle() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [editando, setEditando] = useState(false);
  const [nuevoNombre, setNuevoNombre] = useState('');

  const load = () => {
    api.getProveedorHistorial(id).then(setData).catch(() => {});
  };

  useEffect(load, [id]);

  if (!data) return null;

  const { proveedor, compras, porMes } = data;

  const totalGeneral = compras.reduce((s, c) => s + c.importe, 0);

  // Agrupar porMes en periodos con cigarrillos + varios
  const periodos = {};
  porMes.forEach(r => {
    if (!periodos[r.periodo]) periodos[r.periodo] = { cigarrillos: 0, varios: 0, cantidad: 0 };
    periodos[r.periodo][r.categoria] = r.total;
    periodos[r.periodo].cantidad += r.cantidad;
  });

  const handleRename = async () => {
    if (!nuevoNombre.trim()) return;
    await api.updateProveedor(id, nuevoNombre);
    setEditando(false);
    load();
  };

  return (
    <>
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <button className="btn-ghost" onClick={() => navigate('/proveedores')} style={{ padding: 8, borderRadius: 8 }}>
            <ArrowLeft size={20} />
          </button>
          {editando ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="text"
                value={nuevoNombre}
                onChange={e => setNuevoNombre(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleRename()}
                style={{
                  background: 'var(--surface2)', border: '1px solid var(--border)',
                  borderRadius: 6, padding: '8px 12px', color: 'var(--text)', fontSize: 20, fontWeight: 700
                }}
                autoFocus
              />
              <button className="btn btn-primary btn-sm" onClick={handleRename}><Check size={16} /></button>
            </div>
          ) : (
            <h1 style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {proveedor.nombre}
              <button className="btn-ghost" onClick={() => { setNuevoNombre(proveedor.nombre); setEditando(true); }}>
                <Edit3 size={16} />
              </button>
            </h1>
          )}
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="label">Total comprado</div>
          <div className="value mono">{formatMoney(totalGeneral)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Cantidad de compras</div>
          <div className="value mono">{compras.length}</div>
        </div>
        <div className="stat-card">
          <div className="label">Promedio por compra</div>
          <div className="value mono">{compras.length > 0 ? formatMoney(Math.round(totalGeneral / compras.length)) : '$0'}</div>
        </div>
        <div className="stat-card">
          <div className="label">Ultima compra</div>
          <div className="value" style={{ fontSize: 18 }}>
            {compras.length > 0 ? new Date(compras[0].fecha + 'T12:00:00').toLocaleDateString('es-AR') : '-'}
          </div>
        </div>
      </div>

      {/* Resumen por mes */}
      <div className="table-container">
        <div className="table-header">
          <h2>Resumen por mes</h2>
        </div>
        {Object.keys(periodos).length === 0 ? (
          <div className="empty"><p>Sin compras registradas</p></div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Periodo</th>
                <th style={{ textAlign: 'right' }}>Cigarrillos</th>
                <th style={{ textAlign: 'right' }}>Varios</th>
                <th style={{ textAlign: 'right' }}>Total</th>
                <th style={{ textAlign: 'right' }}>Compras</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(periodos).map(([periodo, vals]) => {
                const [y, m] = periodo.split('-');
                const total = vals.cigarrillos + vals.varios;
                return (
                  <tr key={periodo}>
                    <td style={{ fontWeight: 600 }}>{MESES[Number(m) - 1]} {y}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>
                      {vals.cigarrillos > 0 ? formatMoney(vals.cigarrillos) : '-'}
                    </td>
                    <td className="mono" style={{ textAlign: 'right' }}>
                      {vals.varios > 0 ? formatMoney(vals.varios) : '-'}
                    </td>
                    <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{formatMoney(total)}</td>
                    <td className="mono" style={{ textAlign: 'right', color: 'var(--text-muted)' }}>{vals.cantidad}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Historial completo */}
      <div className="table-container">
        <div className="table-header">
          <h2>Historial de compras</h2>
          <span className="mono" style={{ color: 'var(--text-muted)' }}>{compras.length} registros</span>
        </div>
        {compras.length === 0 ? (
          <div className="empty"><p>Sin compras registradas</p></div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Categoria</th>
                <th style={{ textAlign: 'right' }}>Importe</th>
              </tr>
            </thead>
            <tbody>
              {compras.map(c => (
                <tr key={c.id}>
                  <td>{new Date(c.fecha + 'T12:00:00').toLocaleDateString('es-AR')}</td>
                  <td>
                    <span className={`badge ${c.categoria === 'cigarrillos' ? 'badge-cig' : 'badge-var'}`}>
                      {c.categoria}
                    </span>
                  </td>
                  <td className="mono" style={{ textAlign: 'right' }}>{formatMoney(c.importe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
