// Клиент лицензии: в упакованном приложении спрашивает главный процесс Electron
// (IPC) — он считает отпечаток именно этой машины. В dev/браузере падает на
// резервный HTTP-эндпоинт встроенного сервера.

export interface LicenseStatus {
  licensed: boolean;
  machineId: string;
  expiresAt: number | null;
  daysLeft: number | null;
  reason: '' | 'none' | 'invalid' | 'wrong_machine' | 'expired';
  error?: string;
}

function ipc(): any {
  const el = (window as any).electron;
  return el?.ipcRenderer?.invoke ? el.ipcRenderer : null;
}

export async function fetchLicenseStatus(): Promise<LicenseStatus> {
  const r = ipc();
  if (r) {
    try { return await r.invoke('license:status'); } catch (_) { /* фолбэк ниже */ }
  }
  const res = await fetch('/api/license/status');
  return await res.json();
}

export async function activateLicense(code: string): Promise<LicenseStatus> {
  const r = ipc();
  if (r) {
    try { return await r.invoke('license:activate', code); } catch (_) { /* фолбэк ниже */ }
  }
  const res = await fetch('/api/license/activate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  return await res.json();
}
