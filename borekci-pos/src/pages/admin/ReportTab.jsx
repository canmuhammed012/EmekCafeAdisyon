import React, { useState, useEffect, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { getDailyReport, getPayments, getErrorMessage } from '../../services/api';
import { formatDateTR, formatTimeTR, formatCurrency, todayISO } from '../../utils/dateFormatter';
import StaffReport from './StaffReport';

const EMPTY_REPORT = { totalTables: 0, totalPayments: 0, totalRevenue: 0, cashRevenue: 0, cardRevenue: 0 };

const shiftDate = (iso, days) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

const ReportTab = ({ showAlert, refreshKey }) => {
  const [date, setDate] = useState(todayISO());
  const [report, setReport] = useState(null);
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, p] = await Promise.all([getDailyReport(date), getPayments(date)]);
      setReport(r.data || EMPTY_REPORT);
      setPayments(p.data || []);
    } catch (err) {
      setReport(EMPTY_REPORT);
      setPayments([]);
      showAlert('Hata', getErrorMessage(err, 'Rapor yüklenemedi'), 'error');
    } finally {
      setLoading(false);
    }
  }, [date, showAlert]);

  useEffect(() => {
    load();
  }, [load, refreshKey]);

  const exportToExcel = () => {
    if (!report) return;
    const rows = [
      ['Emek Cafe - Gün Sonu Raporu'],
      ['Tarih:', formatDateTR(`${date}T12:00:00Z`)],
      [],
      ['Toplam Masa:', report.totalTables || 0],
      ['Toplam Ödeme:', report.totalPayments || 0],
      ['Toplam Ciro:', Number(report.totalRevenue || 0)],
      ['Nakit:', Number(report.cashRevenue || 0)],
      ['Kart:', Number(report.cardRevenue || 0)],
      [],
      ['DETAYLI ÖDEMELER'],
      ['Tarih', 'Saat', 'Masa', 'Tutar (₺)', 'Ödeme Türü'],
      ...(payments.length
        ? payments.map((p) => [formatDateTR(p.createdAt), formatTimeTR(p.createdAt), p.tableName || '-', Number(p.amount || 0), p.paymentType || '-'])
        : [['Ödeme bulunamadı', '', '', '', '']]),
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 18 }, { wch: 14 }, { wch: 14 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Gün Sonu');
    XLSX.writeFile(wb, `Emek_Cafe_Rapor_${date}.xlsx`);
  };

  const r = report || EMPTY_REPORT;
  const cashShare = r.totalRevenue ? Math.round((r.cashRevenue / r.totalRevenue) * 100) : 0;
  const avgTicket = r.totalPayments ? r.totalRevenue / r.totalPayments : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDate(shiftDate(date, -1))} title="Önceki gün">
            ‹
          </button>
          <input type="date" value={date} max={todayISO()} onChange={(e) => e.target.value && setDate(e.target.value)} className="input w-auto py-1.5" />
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDate(shiftDate(date, 1))} disabled={date >= todayISO()} title="Sonraki gün">
            ›
          </button>
          {date !== todayISO() && (
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDate(todayISO())}>
              Bugün
            </button>
          )}
        </div>
        <div className="ml-auto flex gap-2">
          <button type="button" onClick={load} className="btn btn-secondary" disabled={loading}>
            ↻ <span className="hidden sm:inline">Yenile</span>
          </button>
          <button type="button" onClick={exportToExcel} className="btn btn-success" disabled={!report}>
            📊 <span className="hidden sm:inline">Excel İndir</span>
            <span className="sm:hidden">Excel</span>
          </button>
        </div>
      </div>

      <div className="grid gap-2 sm:gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
        <div className="stat-card bg-violet-50 dark:bg-violet-900/30">
          <p className="stat-label">Toplam Ciro</p>
          <p className="stat-value text-violet-700 dark:text-violet-300">{formatCurrency(r.totalRevenue)}</p>
        </div>
        <div className="stat-card bg-emerald-50 dark:bg-emerald-900/30">
          <p className="stat-label">Nakit</p>
          <p className="stat-value text-emerald-700 dark:text-emerald-300">{formatCurrency(r.cashRevenue)}</p>
          <p className="text-[11px] text-gray-500">%{cashShare}</p>
        </div>
        <div className="stat-card bg-blue-50 dark:bg-blue-900/30">
          <p className="stat-label">Kart</p>
          <p className="stat-value text-blue-700 dark:text-blue-300">{formatCurrency(r.cardRevenue)}</p>
          <p className="text-[11px] text-gray-500">%{r.totalRevenue ? 100 - cashShare : 0}</p>
        </div>
        <div className="stat-card bg-amber-50 dark:bg-amber-900/30">
          <p className="stat-label">Ödeme sayısı</p>
          <p className="stat-value text-amber-700 dark:text-amber-300">{r.totalPayments || 0}</p>
          <p className="text-[11px] text-gray-500">{r.totalTables || 0} farklı masa</p>
        </div>
        <div className="stat-card bg-gray-50 dark:bg-gray-700/40">
          <p className="stat-label">Ortalama hesap</p>
          <p className="stat-value">{formatCurrency(avgTicket)}</p>
        </div>
      </div>

      <StaffReport date={date} refreshKey={refreshKey} showAlert={showAlert} />

      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
          <h2 className="font-bold">Ödemeler</h2>
          <span className="text-xs text-gray-500 tabular-nums">{payments.length} kayıt</span>
        </div>
        {loading ? (
          <p className="text-center py-8 text-gray-500">Yükleniyor…</p>
        ) : payments.length === 0 ? (
          <p className="text-center py-8 text-gray-500">Bu tarihte ödeme yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-900/40 text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="text-left py-2 px-3 font-semibold">Saat</th>
                  <th className="text-left py-2 px-3 font-semibold">Masa</th>
                  <th className="text-right py-2 px-3 font-semibold">Tutar</th>
                  <th className="text-center py-2 px-3 font-semibold">Ödeme</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-t border-gray-100 dark:border-gray-700/70 hover:bg-gray-50 dark:hover:bg-gray-700/30">
                    <td className="py-2 px-3 tabular-nums whitespace-nowrap">{formatTimeTR(p.createdAt)}</td>
                    <td className="py-2 px-3 font-medium truncate max-w-[12rem]">{p.tableName}</td>
                    <td className="py-2 px-3 text-right font-bold tabular-nums whitespace-nowrap">{formatCurrency(p.amount)}</td>
                    <td className="py-2 px-3 text-center">
                      <span className={`badge ${p.paymentType === 'Nakit' ? 'badge-green' : 'badge-blue'}`}>{p.paymentType === 'Nakit' ? '💵' : '💳'} {p.paymentType}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default ReportTab;
