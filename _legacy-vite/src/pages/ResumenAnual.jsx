import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { MESES, formatMoney } from '../helpers';

function semanasEnMes(anio, mes) {
  const dias = new Date(anio, mes, 0).getDate();
  return dias / 7;
}

export default function ResumenAnual() {
  const [anio, setAnio] = useState(new Date().getFullYear());
  const [data, setData] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    api.getResumenAnual(anio).then(setData).catch(() => setData(null));
  }, [anio]);

  const meses = data?.meses || Array.from({ length: 12 }, (_, i) => ({
    mes: i + 1,
    compras: { cigarrillos: 0, varios: 0, total: 0 },
    ventas: { cigarrillos: 0, varios: 0, total: 0 },
    ganancia: { cigarrillos: 0, varios: 0, total: 0 },
  }));

  const resumen = data?.resumen || { cigarrillos: 0, varios: 0, total: 0 };

  const totCompras = meses.reduce((s, m) => s + m.compras.total, 0);
  const totVentas = meses.reduce((s, m) => s + m.ventas.total, 0);

  const promSemanal = (total, mes) => {
    const sem = semanasEnMes(anio, mes);
    return total > 0 ? formatMoney(Math.round(total / sem)) : '-';
  };

  return (
    <>
      <div className="page-header">
        <h1>Resumen {anio}</h1>
        <div className="period-selector">
          <select value={anio} onChange={e => setAnio(Number(e.target.value))}>
            {[2024, 2025, 2026, 2027].map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="table-container">
        <table className="resumen-table">
          <thead>
            <tr>
              <th style={{ width: 120 }}>{anio}</th>
              <th style={{ width: 100 }}></th>
              <th style={{ textAlign: 'right' }}>Compras</th>
              <th style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: 10 }}>Prom/sem</th>
              <th style={{ textAlign: 'right' }}>Ventas</th>
              <th style={{ textAlign: 'right', color: 'var(--text-muted)', fontSize: 10 }}>Prom/sem</th>
              <th style={{ textAlign: 'right' }}>Ganancia</th>
            </tr>
          </thead>
          {meses.map((m) => {
            const sem = semanasEnMes(anio, m.mes);
            return (
              <tbody key={m.mes} className="mes-group">
                <tr>
                  <td
                    rowSpan={3}
                    className="mes-cell"
                    onClick={() => navigate(`/mes/${anio}/${m.mes}`)}
                    style={{ fontWeight: 700, verticalAlign: 'middle', cursor: 'pointer' }}
                  >
                    <span className="mes-link">{MESES[m.mes - 1].toUpperCase()}</span>
                  </td>
                  <td><span className="badge badge-cig">Cigarrillos</span></td>
                  <td className="mono" style={{ textAlign: 'right' }}>{formatMoney(m.compras.cigarrillos)}</td>
                  <td className="mono prom-col" style={{ textAlign: 'right' }}>
                    {promSemanal(m.compras.cigarrillos, m.mes)}
                  </td>
                  <td className="mono" style={{ textAlign: 'right' }}>{formatMoney(m.ventas.cigarrillos)}</td>
                  <td className="mono prom-col" style={{ textAlign: 'right' }}>
                    {promSemanal(m.ventas.cigarrillos, m.mes)}
                  </td>
                  <td className="mono" style={{ textAlign: 'right', color: m.ganancia.cigarrillos >= 0 ? 'var(--green)' : 'var(--accent)', fontWeight: 600 }}>
                    {formatMoney(m.ganancia.cigarrillos)}
                  </td>
                </tr>
                <tr>
                  <td><span className="badge badge-var">Varios</span></td>
                  <td className="mono" style={{ textAlign: 'right' }}>{formatMoney(m.compras.varios)}</td>
                  <td className="mono prom-col" style={{ textAlign: 'right' }}>
                    {promSemanal(m.compras.varios, m.mes)}
                  </td>
                  <td className="mono" style={{ textAlign: 'right' }}>{formatMoney(m.ventas.varios)}</td>
                  <td className="mono prom-col" style={{ textAlign: 'right' }}>
                    {promSemanal(m.ventas.varios, m.mes)}
                  </td>
                  <td className="mono" style={{ textAlign: 'right', color: m.ganancia.varios >= 0 ? 'var(--green)' : 'var(--accent)', fontWeight: 600 }}>
                    {formatMoney(m.ganancia.varios)}
                  </td>
                </tr>
                <tr style={{ borderBottom: '2px solid var(--border)' }}>
                  <td style={{ fontWeight: 700, fontSize: 12, textTransform: 'uppercase', color: 'var(--text-muted)' }}>Total</td>
                  <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{formatMoney(m.compras.total)}</td>
                  <td className="mono prom-col" style={{ textAlign: 'right', fontWeight: 600 }}>
                    {promSemanal(m.compras.total, m.mes)}
                  </td>
                  <td className="mono" style={{ textAlign: 'right', fontWeight: 700 }}>{formatMoney(m.ventas.total)}</td>
                  <td className="mono prom-col" style={{ textAlign: 'right', fontWeight: 600 }}>
                    {promSemanal(m.ventas.total, m.mes)}
                  </td>
                  <td className="mono" style={{ textAlign: 'right', fontWeight: 700, color: m.ganancia.total >= 0 ? 'var(--green)' : 'var(--accent)' }}>
                    {formatMoney(m.ganancia.total)}
                  </td>
                </tr>
              </tbody>
            );
          })}
          <tbody>
            <tr className="row-total">
              <td colSpan={2}><strong>RESUMEN {anio}</strong></td>
              <td className="mono" style={{ textAlign: 'right' }}>{formatMoney(totCompras)}</td>
              <td></td>
              <td className="mono" style={{ textAlign: 'right' }}>{formatMoney(totVentas)}</td>
              <td></td>
              <td className="mono" style={{ textAlign: 'right', color: resumen.total >= 0 ? 'var(--green)' : 'var(--accent)' }}>
                {formatMoney(resumen.total)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
