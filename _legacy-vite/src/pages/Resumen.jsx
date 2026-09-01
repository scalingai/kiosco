import { useState, useEffect } from 'react';
import PeriodSelector from '../components/PeriodSelector';
import { api } from '../api';
import { MESES, formatMoney } from '../helpers';

export default function Resumen() {
  const now = new Date();
  const [mes, setMes] = useState(now.getMonth() + 1);
  const [anio, setAnio] = useState(now.getFullYear());
  const [data, setData] = useState(null);

  useEffect(() => {
    api.getResumen(mes, anio).then(setData).catch(() => setData(null));
  }, [mes, anio]);

  const handlePeriod = (m, a) => { setMes(m); setAnio(a); };

  // Datos mock si no hay backend
  const d = data || {
    compras: { cigarrillos: 0, varios: 0, total: 0 },
    ventas: { cigarrillos: 0, varios: 0, total: 0 },
    ganancia: { cigarrillos: 0, varios: 0, total: 0 },
    promedioDiario: { cigarrillos: 0, varios: 0, total: 0 },
    diasConVenta: 0,
  };

  return (
    <>
      <div className="page-header">
        <h1>{MESES[mes - 1]} {anio}</h1>
        <PeriodSelector mes={mes} anio={anio} onChange={handlePeriod} />
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="label">Total Compras</div>
          <div className="value red mono">{formatMoney(d.compras.total)}</div>
          <div className="sub">Cig: {formatMoney(d.compras.cigarrillos)} | Var: {formatMoney(d.compras.varios)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Total Ventas</div>
          <div className="value mono">{formatMoney(d.ventas.total)}</div>
          <div className="sub">Cig: {formatMoney(d.ventas.cigarrillos)} | Var: {formatMoney(d.ventas.varios)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Ganancia</div>
          <div className={`value mono ${d.ganancia.total >= 0 ? 'green' : 'red'}`}>
            {formatMoney(d.ganancia.total)}
          </div>
          <div className="sub">Cig: {formatMoney(d.ganancia.cigarrillos)} | Var: {formatMoney(d.ganancia.varios)}</div>
        </div>
        <div className="stat-card">
          <div className="label">Promedio Diario</div>
          <div className="value mono">{formatMoney(d.promedioDiario.total)}</div>
          <div className="sub">{d.diasConVenta} dias con venta</div>
        </div>
      </div>

      <div className="table-container">
        <div className="table-header">
          <h2>Desglose</h2>
        </div>
        <table>
          <thead>
            <tr>
              <th></th>
              <th style={{ textAlign: 'right' }}>Cigarrillos</th>
              <th style={{ textAlign: 'right' }}>Varios</th>
              <th style={{ textAlign: 'right' }}>Total</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Compras</strong></td>
              <td className="mono" style={{ textAlign: 'right' }}>{formatMoney(d.compras.cigarrillos)}</td>
              <td className="mono" style={{ textAlign: 'right' }}>{formatMoney(d.compras.varios)}</td>
              <td className="mono" style={{ textAlign: 'right' }}>{formatMoney(d.compras.total)}</td>
            </tr>
            <tr>
              <td><strong>Ventas</strong></td>
              <td className="mono" style={{ textAlign: 'right' }}>{formatMoney(d.ventas.cigarrillos)}</td>
              <td className="mono" style={{ textAlign: 'right' }}>{formatMoney(d.ventas.varios)}</td>
              <td className="mono" style={{ textAlign: 'right' }}>{formatMoney(d.ventas.total)}</td>
            </tr>
            <tr className="row-ganancia">
              <td><strong>Ganancia</strong></td>
              <td className="mono" style={{ textAlign: 'right', color: d.ganancia.cigarrillos >= 0 ? 'var(--green)' : 'var(--accent)' }}>
                {formatMoney(d.ganancia.cigarrillos)}
              </td>
              <td className="mono" style={{ textAlign: 'right', color: d.ganancia.varios >= 0 ? 'var(--green)' : 'var(--accent)' }}>
                {formatMoney(d.ganancia.varios)}
              </td>
              <td className="mono" style={{ textAlign: 'right', color: d.ganancia.total >= 0 ? 'var(--green)' : 'var(--accent)' }}>
                {formatMoney(d.ganancia.total)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
