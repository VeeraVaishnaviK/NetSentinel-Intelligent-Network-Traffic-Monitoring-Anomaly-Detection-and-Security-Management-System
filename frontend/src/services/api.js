/**
 * NetSentinel REST API Client
 * Communicates with the local Flask backend via Vite proxy (/api -> http://127.0.0.1:5000/api).
 */

const API_BASE = '/api';

async function request(path, options = {}) {
  const config = {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  };

  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, config);
  } catch (err) {
    const error = new Error(
      'Unable to reach NetSentinel backend API (http://127.0.0.1:5000). Verify the Flask server is running.'
    );
    error.code = 'NETWORK_UNREACHABLE';
    throw error;
  }

  let payload = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    payload = await response.json();
  }

  if (!response.ok || (payload && payload.success === false)) {
    const msg =
      payload?.error?.message ||
      payload?.message ||
      `Request failed with status ${response.status}`;
    const error = new Error(msg);
    error.status = response.status;
    error.code = payload?.error?.code || 'API_ERROR';
    error.details = payload?.error?.details || null;
    throw error;
  }

  return payload?.data ?? payload;
}

function buildQuery(params = {}) {
  const qs = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') {
      qs.set(k, String(v));
    }
  });
  const str = qs.toString();
  return str ? `?${str}` : '';
}

export const api = {
  // Network
  getInterfaces: () => request('/network/interfaces'),
  getNetworkStatus: () => request('/network/status'),
  startDiscovery: (payload) =>
    request('/network/discover', { method: 'POST', body: JSON.stringify(payload) }),
  stopDiscovery: () => request('/network/discover/stop', { method: 'POST' }),
  getDiscoveryStatus: () => request('/network/discover/status'),
  getNetworkDevices: () => request('/network/devices'),

  // Packet Capture
  startPacketCapture: (interfaceName = '') =>
    request('/packets/start', {
      method: 'POST',
      body: JSON.stringify({ interface: interfaceName }),
    }),
  stopPacketCapture: () => request('/packets/stop', { method: 'POST' }),
  getPackets: (params = {}) => request(`/packets${buildQuery(params)}`),
  getPacketStats: () => request('/packets/stats'),

  // Traffic
  getCurrentTraffic: (iface = '') =>
    request(`/traffic/current${buildQuery({ interface: iface })}`),
  getTrafficHistory: (range = '15m', iface = '') =>
    request(`/traffic/history${buildQuery({ range, interface: iface })}`),
  getTrafficProtocols: () => request('/traffic/protocols'),

  // Security
  getAlerts: (params = {}) => request(`/security/alerts${buildQuery(params)}`),
  updateAlertStatus: (id, status) =>
    request(`/security/alerts/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }),
  getSecuritySummary: () => request('/security/summary'),
  getSecurityRules: () => request('/security/rules'),
  updateSecurityRules: (rules) =>
    request('/security/rules', {
      method: 'PUT',
      body: JSON.stringify({ rules }),
    }),
  testSecurityRule: (ruleType) =>
    request('/security/test-rule', {
      method: 'POST',
      body: JSON.stringify({ rule_type: ruleType }),
    }),

  // Devices & Trust
  getDevices: () => request('/devices'),
  trustDevice: (payload) =>
    request('/devices/trust', { method: 'POST', body: JSON.stringify(payload) }),
  untrustDevice: (trustedId) =>
    request(`/devices/trust/${trustedId}`, { method: 'DELETE' }),

  // Diagnostics
  runPing: (target, count = 4) =>
    request('/diagnostics/ping', {
      method: 'POST',
      body: JSON.stringify({ target, count }),
    }),
  runTraceroute: (target, maxHops = 15) =>
    request('/diagnostics/traceroute', {
      method: 'POST',
      body: JSON.stringify({ target, max_hops: maxHops }),
    }),
  runDnsLookup: (domain) =>
    request('/diagnostics/dns', {
      method: 'POST',
      body: JSON.stringify({ domain }),
    }),
  runConnectivityTest: (targets = null) =>
    request('/diagnostics/connectivity', {
      method: 'POST',
      body: JSON.stringify(targets ? { targets } : {}),
    }),
  getDiagnosticsHistory: (type = '', limit = 30) =>
    request(`/diagnostics/history${buildQuery({ type, limit })}`),

  // Reports
  getReportSummary: (startDate = '', endDate = '') =>
    request(`/reports/summary${buildQuery({ start_date: startDate, end_date: endDate })}`),
  getCsvExportUrl: (startDate = '', endDate = '', section = 'full') =>
    `${API_BASE}/reports/export/csv${buildQuery({
      start_date: startDate,
      end_date: endDate,
      section,
    })}`,
  getPdfExportUrl: (startDate = '', endDate = '') =>
    `${API_BASE}/reports/export/pdf${buildQuery({
      start_date: startDate,
      end_date: endDate,
    })}`,

  // Settings & Demo Mode
  getSettings: () => request('/settings'),
  updateSettings: (payload) =>
    request('/settings', { method: 'PUT', body: JSON.stringify(payload) }),
  clearHistory: (scope = 'all') =>
    request('/settings/clear-history', {
      method: 'POST',
      body: JSON.stringify({ scope }),
    }),
  toggleDemoMode: (enabled) =>
    request('/demo/toggle', {
      method: 'POST',
      body: JSON.stringify({ enabled }),
    }),
};

