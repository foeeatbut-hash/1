import React from 'react';
import { useLocation } from 'react-router-dom';
import { fetchLicenseStatus, activateLicense, LicenseStatus } from '../lib/license';

// Гейт лицензии: показывается ПОСЛЕ стартовой заставки и ДО экрана входа.
// Пока лицензия не активирована/просрочена — приложение дальше не пускает.
export default function LicenseGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const [status, setStatus] = React.useState<LicenseStatus | null>(null);
  const [code, setCode] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState('');
  const [copied, setCopied] = React.useState(false);

  const load = React.useCallback(async () => {
    try { setStatus(await fetchLicenseStatus()); }
    catch (e: any) { setStatus({ licensed: false, machineId: '', expiresAt: null, daysLeft: null, reason: 'none', error: e?.message }); }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  // Отдельное окно-стикер открывается уже после входа — его не гейтим
  if (location.pathname === '/sticker') return <>{children}</>;

  // Пока статус не загружен — короткий индикатор (заставка уже погашена)
  if (!status) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-slate-950">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
      </div>
    );
  }

  if (status.licensed) return <>{children}</>;

  const reasonText: Record<string, string> = {
    none: 'Программа ещё не активирована на этом компьютере.',
    invalid: 'Ключ активации неверный или повреждён. Проверьте, что скопировали его полностью.',
    wrong_machine: 'Этот ключ выдан для другого компьютера. Запросите ключ для кода этого компьютера.',
    expired: 'Срок действия лицензии истёк. Запросите новый ключ активации.',
  };

  const submit = async () => {
    setBusy(true); setError('');
    try {
      const res = await activateLicense(code.trim());
      if (res.licensed) { setStatus(res); return; }
      setError(reasonText[res.reason] || res.error || 'Не удалось активировать ключ.');
    } catch (e: any) {
      setError(e?.message || 'Ошибка активации.');
    } finally {
      setBusy(false);
    }
  };

  const copyId = async () => {
    try { await navigator.clipboard.writeText(status.machineId); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch (_) {}
  };

  return (
    <div className="w-full h-full flex items-center justify-center bg-slate-950 p-6">
      <div className="max-w-lg w-full bg-slate-900 border border-slate-800 rounded-2xl p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shadow">
            <span className="text-sm font-black text-white">M</span>
          </div>
          <div>
            <div className="text-lg font-bold text-white">Активация лицензии</div>
            <div className="text-xs text-slate-400">Программа защищена лицензией на один компьютер</div>
          </div>
        </div>

        <p className="text-sm text-slate-300 leading-relaxed">
          Отправьте владельцу программы <b>код этого компьютера</b> (ниже) и введите
          полученный ключ активации.
        </p>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-400">Код этого компьютера</label>
          <div className="flex items-stretch gap-2">
            <div className="flex-1 font-mono text-sm text-emerald-300 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 select-all tracking-wide">
              {status.machineId || '—'}
            </div>
            <button onClick={copyId} className="px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer">
              {copied ? 'Скопировано' : 'Копировать'}
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-400">Ключ активации</label>
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            rows={3}
            placeholder="FLUX1.…"
            className="w-full font-mono text-xs bg-slate-950 text-slate-100 p-3 border border-slate-800 rounded-lg outline-none focus:border-emerald-500 resize-none break-all"
          />
        </div>

        {(error || (status.reason && status.reason !== 'none')) && (
          <div className="p-3 text-xs font-medium text-rose-300 bg-rose-950/30 border border-rose-900/50 rounded-lg">
            {error || reasonText[status.reason]}
          </div>
        )}

        <button
          onClick={submit}
          disabled={busy || !code.trim()}
          className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold cursor-pointer disabled:opacity-50"
        >
          {busy ? 'Проверка…' : 'Активировать'}
        </button>
      </div>
    </div>
  );
}
