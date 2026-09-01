import { MESES } from '../helpers';

export default function PeriodSelector({ mes, anio, onChange }) {
  return (
    <div className="period-selector">
      <select value={mes} onChange={(e) => onChange(Number(e.target.value), anio)}>
        {MESES.map((m, i) => (
          <option key={i} value={i + 1}>{m}</option>
        ))}
      </select>
      <select value={anio} onChange={(e) => onChange(mes, Number(e.target.value))}>
        {[2024, 2025, 2026, 2027].map(y => (
          <option key={y} value={y}>{y}</option>
        ))}
      </select>
    </div>
  );
}
