import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';
import { getHourlyReport, getErrorMessage } from '../../services/api';
import { formatCurrency, todayISO } from '../../utils/dateFormatter';
import { useTheme } from '../../contexts/ThemeContext';

const LINE_COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'];

const HourlyTab = ({ showAlert, refreshKey }) => {
  const { darkMode } = useTheme();
  const [date, setDate] = useState(todayISO());
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await getHourlyReport(date);
      setData(response.data || []);
    } catch (err) {
      setData([]);
      showAlert('Hata', getErrorMessage(err, 'Saatlik rapor yüklenemedi'), 'error');
    } finally {
      setLoading(false);
    }
  }, [date, showAlert]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const { activeHours, hourlyTotals, topProducts, lineData, dayTotals } = useMemo(() => {
    const active = data.filter((h) => h.products.length > 0);
    const totals = data.map((h) => ({
      hour: h.hourLabel,
      adet: h.products.reduce((s, p) => s + p.quantity, 0),
      ciro: Math.round(h.products.reduce((s, p) => s + (p.revenue || 0), 0) * 100) / 100,
    }));
    // Günün en çok satan ürünleri (tüm saatler toplanır)
    const byProduct = new Map();
    data.forEach((h) =>
      h.products.forEach((p) => {
        const cur = byProduct.get(p.productId) || { productId: p.productId, name: p.productName, quantity: 0, revenue: 0 };
        cur.quantity += p.quantity;
        cur.revenue += p.revenue || 0;
        byProduct.set(p.productId, cur);
      })
    );
    const top = [...byProduct.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 10);
    const line = active.map((h) => {
      const point = { hour: h.hourLabel };
      top.forEach((tp) => {
        point[`p${tp.productId}`] = h.products.find((p) => p.productId === tp.productId)?.quantity || 0;
      });
      return point;
    });
    const day = { adet: totals.reduce((s, t) => s + t.adet, 0), ciro: totals.reduce((s, t) => s + t.ciro, 0) };
    // Yalnızca satış olan saat aralığını göster (ilk-son saat arası)
    const firstIdx = data.findIndex((h) => h.products.length > 0);
    const lastIdx = data.length - 1 - [...data].reverse().findIndex((h) => h.products.length > 0);
    const range = firstIdx >= 0 ? totals.slice(firstIdx, lastIdx + 1) : [];
    return { activeHours: active, hourlyTotals: range, topProducts: top, lineData: line, dayTotals: day };
  }, [data]);

  const axisColor = darkMode ? '#9CA3AF' : '#6B7280';
  const gridColor = darkMode ? '#374151' : '#E5E7EB';
  const tooltipStyle = { backgroundColor: darkMode ? '#1F2937' : '#FFFFFF', border: `1px solid ${gridColor}`, borderRadius: 12, fontSize: 12 };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={date} max={todayISO()} onChange={(e) => e.target.value && setDate(e.target.value)} className="input w-auto py-1.5" />
        {date !== todayISO() && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDate(todayISO())}>
            Bugün
          </button>
        )}
        <div className="ml-auto flex items-center gap-2 text-xs text-gray-500">
          <span className="badge badge-blue tabular-nums">{dayTotals.adet} adet</span>
          <span className="badge badge-green tabular-nums">{formatCurrency(dayTotals.ciro)}</span>
          <button type="button" onClick={load} className="btn btn-secondary btn-sm" disabled={loading}>
            ↻
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-center py-10 text-gray-500">Yükleniyor…</p>
      ) : activeHours.length === 0 ? (
        <div className="card p-10 text-center text-gray-500">
          <div className="text-4xl mb-2">📈</div>
          Seçilen tarihte sipariş verisi yok.
        </div>
      ) : (
        <>
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <div className="card p-3 sm:p-4">
              <h2 className="font-bold mb-2">Saatlik satış adedi</h2>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={hourlyTotals} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                  <XAxis dataKey="hour" tick={{ fill: axisColor, fontSize: 11 }} tickLine={false} axisLine={{ stroke: gridColor }} />
                  <YAxis tick={{ fill: axisColor, fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={tooltipStyle} formatter={(value, name) => (name === 'Ciro' ? formatCurrency(value) : value)} cursor={{ fill: darkMode ? '#374151' : '#F3F4F6' }} />
                  <Bar dataKey="adet" name="Adet" fill="#3B82F6" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card p-3 sm:p-4">
              <h2 className="font-bold mb-2">Günün en çok satanları</h2>
              <ol className="space-y-1.5">
                {topProducts.map((p, i) => {
                  const pct = topProducts[0]?.quantity ? Math.round((p.quantity / topProducts[0].quantity) * 100) : 0;
                  return (
                    <li key={p.productId} className="text-sm">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">
                          <span className="inline-block w-5 text-gray-400 tabular-nums">{i + 1}.</span>
                          {p.name}
                        </span>
                        <span className="tabular-nums font-semibold whitespace-nowrap">
                          {p.quantity} <span className="text-gray-400 font-normal">· {formatCurrency(p.revenue)}</span>
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 mt-0.5 overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: LINE_COLORS[i % LINE_COLORS.length] }} />
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>

          <div className="card p-3 sm:p-4">
            <h2 className="font-bold mb-2">Ürün bazında saatlik trend (ilk 10 ürün)</h2>
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={lineData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={gridColor} vertical={false} />
                <XAxis dataKey="hour" tick={{ fill: axisColor, fontSize: 11 }} tickLine={false} axisLine={{ stroke: gridColor }} />
                <YAxis tick={{ fill: axisColor, fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {topProducts.map((p, i) => (
                  <Line key={p.productId} type="monotone" dataKey={`p${p.productId}`} name={p.name} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={2} dot={{ r: 2.5 }} activeDot={{ r: 4 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="card p-3 sm:p-4">
            <h2 className="font-bold mb-2">Saat bazında detay</h2>
            <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(clamp(160px, 18vw, 240px), 1fr))' }}>
              {activeHours.map((h) => (
                <div key={h.hour} className="rounded-xl border border-gray-200 dark:border-gray-700 p-2.5">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-bold text-blue-600 dark:text-blue-400 tabular-nums">{h.hourLabel}</span>
                    <span className="text-xs text-gray-500 tabular-nums">{h.products.reduce((s, p) => s + p.quantity, 0)} adet</span>
                  </div>
                  <ul className="space-y-0.5 text-xs">
                    {h.products.slice(0, 5).map((p) => (
                      <li key={p.productId} className="flex justify-between gap-2">
                        <span className="truncate">{p.productName}</span>
                        <span className="font-semibold tabular-nums">{p.quantity}</span>
                      </li>
                    ))}
                    {h.products.length > 5 && <li className="text-gray-400">+{h.products.length - 5} ürün daha</li>}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default HourlyTab;
