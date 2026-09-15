import React, { useEffect, useState } from 'react';
import { getStaffReport, getErrorMessage } from '../../services/api';
import { formatCurrency } from '../../utils/dateFormatter';

/** Kim ne kadar sipariş aldı, kim kaç hesap kapattı (seçili gün) */
const StaffReport = ({ date, refreshKey, showAlert }) => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getStaffReport(date)
      .then((r) => alive && setRows(r.data || []))
      .catch((err) => alive && showAlert('Hata', getErrorMessage(err, 'Personel raporu yüklenemedi'), 'error'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [date, refreshKey, showAlert]);

  const maxRevenue = Math.max(1, ...rows.map((r) => r.totalRevenue));

  return (
    <div className="card overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div>
          <h2 className="font-bold">👥 Personel performansı</h2>
          <p className="text-xs text-gray-500">Kim ne kadar sipariş aldı, kim kaç hesap kapattı</p>
        </div>
        <span className="text-xs text-gray-500 tabular-nums">{rows.length} kişi</span>
      </div>
      {loading ? (
        <p className="text-center py-8 text-gray-500">Yükleniyor…</p>
      ) : rows.length === 0 ? (
        <p className="text-center py-8 text-gray-500">Bu tarihte kayıt yok.</p>
      ) : (
        <ul className="divide-y divide-gray-100 dark:divide-gray-700/70">
          {rows.map((r, i) => (
            <li key={`${r.userId}-${r.name}`} className="p-3 sm:p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`badge ${i === 0 ? 'badge-amber' : 'badge-gray'} tabular-nums`}>#{i + 1}</span>
                <span className="font-bold text-base flex-1 min-w-[8rem] truncate">{r.name}</span>
                <span className="font-bold tabular-nums text-blue-600 dark:text-blue-400">{formatCurrency(r.totalRevenue)}</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100 dark:bg-gray-700 mt-2 overflow-hidden">
                <div className="h-full rounded-full bg-blue-500" style={{ width: `${Math.round((r.totalRevenue / maxRevenue) * 100)}%` }} />
              </div>
              <div className="mt-2 grid gap-2 grid-cols-2 sm:grid-cols-4 text-sm">
                <div className="rounded-lg bg-gray-50 dark:bg-gray-900/40 px-2.5 py-1.5">
                  <div className="text-[11px] text-gray-500">Aldığı sipariş</div>
                  <div className="font-semibold tabular-nums">{r.totalQuantity} adet</div>
                </div>
                <div className="rounded-lg bg-gray-50 dark:bg-gray-900/40 px-2.5 py-1.5">
                  <div className="text-[11px] text-gray-500">Ödenen / açık</div>
                  <div className="font-semibold tabular-nums">
                    {formatCurrency(r.soldRevenue)} <span className="text-gray-400 font-normal">/ {formatCurrency(r.openRevenue)}</span>
                  </div>
                </div>
                <div className="rounded-lg bg-gray-50 dark:bg-gray-900/40 px-2.5 py-1.5">
                  <div className="text-[11px] text-gray-500">Kapattığı hesap</div>
                  <div className="font-semibold tabular-nums">
                    {r.payments} · {formatCurrency(r.paymentAmount)}
                  </div>
                </div>
                <div className="rounded-lg bg-gray-50 dark:bg-gray-900/40 px-2.5 py-1.5">
                  <div className="text-[11px] text-gray-500">Nakit / Kart</div>
                  <div className="font-semibold tabular-nums">
                    {formatCurrency(r.cash)} <span className="text-gray-400 font-normal">/ {formatCurrency(r.card)}</span>
                  </div>
                </div>
              </div>
              {r.topProducts.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {r.topProducts.map((p) => (
                    <span key={p.name} className="badge badge-blue">
                      {p.quantity}× {p.name}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default StaffReport;
