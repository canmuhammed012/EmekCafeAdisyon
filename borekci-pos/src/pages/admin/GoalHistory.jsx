import React, { useEffect, useState } from 'react';
import { getGoalsHistory, getErrorMessage } from '../../services/api';
import { formatDateTR, todayISO } from '../../utils/dateFormatter';
import { borderColorFor } from '../../utils/colors';

const WEEKDAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

/** Gün bazında günlük görev geçmişi: hangi gün hangi hedef kondu, ne kadarı tamamlandı */
const GoalHistory = ({ showAlert }) => {
  const [days, setDays] = useState(14);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openDate, setOpenDate] = useState(todayISO());

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getGoalsHistory(days)
      .then((r) => alive && setHistory(r.data || []))
      .catch((err) => alive && showAlert('Hata', getErrorMessage(err, 'Görev geçmişi yüklenemedi'), 'error'))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [days, showAlert]);

  const totals = history.reduce((acc, d) => ({ done: acc.done + d.doneCount, total: acc.total + d.total }), { done: 0, total: 0 });

  return (
    <section className="card p-4 space-y-3 lg:col-span-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-bold">🎯 Günlük görev geçmişi</h3>
          <p className="text-xs text-gray-500">
            Son {days} günde {totals.done}/{totals.total} hedef tamamlandı. Görevler ve kotalar üst çubuktaki "Günlük Görevler" penceresinden yönetilir.
          </p>
        </div>
        <div className="flex gap-1 p-1 rounded-xl bg-gray-100 dark:bg-gray-900">
          {[7, 14, 30, 90].map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)} className={`btn btn-sm ${days === d ? 'btn-primary' : 'btn-ghost'}`}>
              {d} gün
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-center py-6 text-gray-500">Yükleniyor…</p>
      ) : history.length === 0 ? (
        <p className="text-center py-6 text-gray-500">Bu aralıkta tanımlı görev yok.</p>
      ) : (
        <ul className="space-y-2">
          {history.map((day) => {
            const isOpen = openDate === day.date;
            const d = new Date(`${day.date}T12:00:00`);
            const isToday = day.date === todayISO();
            return (
              <li key={day.date} className={`rounded-xl border ${day.allDone ? 'border-emerald-300 dark:border-emerald-700' : 'border-gray-200 dark:border-gray-700'} overflow-hidden`}>
                <button type="button" onClick={() => setOpenDate(isOpen ? null : day.date)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-gray-700/40">
                  <span className={`text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}>▶</span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold">
                      {formatDateTR(d)} <span className="text-gray-400 font-normal text-sm">{WEEKDAYS[d.getDay()]}</span>
                      {isToday && <span className="badge badge-blue ml-2">bugün</span>}
                    </div>
                    <div className="h-1.5 rounded-full bg-gray-100 dark:bg-gray-700 mt-1.5 overflow-hidden max-w-xs">
                      <div className={`h-full rounded-full ${day.allDone ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${day.total ? Math.round((day.doneCount / day.total) * 100) : 0}%` }} />
                    </div>
                  </div>
                  <span className={`badge ${day.allDone ? 'badge-green' : 'badge-amber'} tabular-nums`}>
                    {day.allDone ? '✅ ' : ''}
                    {day.doneCount}/{day.total}
                  </span>
                </button>
                {isOpen && (
                  <ul className="border-t border-gray-200 dark:border-gray-700 divide-y divide-gray-100 dark:divide-gray-700/70">
                    {day.goals.map((g) => (
                      <li key={`${day.date}-${g.productId}`} className="flex items-center gap-3 px-3 py-2" style={{ borderLeft: `4px solid ${borderColorFor(g.categoryColor || '#3B82F6')}` }}>
                        <span className={`text-xl leading-none ${g.done ? '' : 'opacity-40'}`}>{g.done ? '☑️' : '⬜'}</span>
                        <div className="min-w-0 flex-1">
                          <div className={`font-semibold truncate ${g.done ? 'line-through decoration-emerald-500/60' : ''}`}>{g.productName}</div>
                          <div className="text-[11px] text-gray-500 tabular-nums">
                            {g.categoryName ? `${g.categoryName} · ` : ''}ödenen {g.paid} · açık {g.open}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="font-bold tabular-nums">
                            {g.sold} <span className="text-gray-400 font-normal">/ {g.quota}</span>
                          </div>
                          <div className={`text-xs ${g.done ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>{g.done ? 'Tamamlandı' : `${g.remaining} eksik (%${g.percent})`}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

export default GoalHistory;
