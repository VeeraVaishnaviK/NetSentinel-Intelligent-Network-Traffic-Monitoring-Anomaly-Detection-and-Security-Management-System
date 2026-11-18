export function formatBytes(bytes, decimals = 2) {
  const val = Number(bytes || 0);
  if (val <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(Math.floor(Math.log(val) / Math.log(k)), sizes.length - 1);
  return `${(val / Math.pow(k, i)).toFixed(i === 0 ? 0 : decimals)} ${sizes[i]}`;
}

export function formatSpeed(bytesPerSec) {
  const val = Number(bytesPerSec || 0);
  if (val <= 0) return '0 B/s';
  if (val < 1024) return `${val.toFixed(0)} B/s`;
  if (val < 1024 * 1024) return `${(val / 1024).toFixed(1)} KB/s`;
  return `${(val / (1024 * 1024)).toFixed(2)} MB/s`;
}

export function formatNumber(num) {
  return Number(num || 0).toLocaleString();
}

export function formatTime(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString;
  return d.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

export function formatDateTime(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return isoString;
  return d.toLocaleString([], {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export const PROTOCOL_COLORS = {
  TCP: '#38bdf8',
  UDP: '#6366f1',
  DNS: '#10b981',
  HTTP: '#f59e0b',
  ICMP: '#f43f5e',
  ARP: '#a855f7',
  OTHER: '#64748b',
};

export function getProtocolColor(proto) {
  return PROTOCOL_COLORS[(proto || 'OTHER').toUpperCase()] || '#64748b';
}

