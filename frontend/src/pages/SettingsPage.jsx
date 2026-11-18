import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  FlaskConical,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import ConfirmDialog from '../components/ConfirmDialog';
import DataTable from '../components/DataTable';
import ErrorBanner from '../components/ErrorBanner';
import { api } from '../services/api';
import { formatDateTime } from '../utils/formatters';

export default function SettingsPage() {
  const [settings, setSettings] = useState(null);
  const [interfaces, setInterfaces] = useState([]);
  const [trustedDevices, setTrustedDevices] = useState([]);
  const [targetsText, setTargetsText] = useState('');

  const [newTrustIp, setNewTrustIp] = useState('');
  const [newTrustMac, setNewTrustMac] = useState('');
  const [newTrustDesc, setNewTrustDesc] = useState('');

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [feedback, setFeedback] = useState(null);

  const [confirmState, setConfirmState] = useState({
    open: false,
    title: '',
    message: '',
    confirmLabel: 'Confirm',
    destructive: true,
    onConfirm: null,
  });
  const [confirmBusy, setConfirmBusy] = useState(false);

  const loadAll = async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, ifaces, devRes] = await Promise.all([
        api.getSettings(),
        api.getInterfaces(),
        api.getDevices(),
      ]);
      setSettings(s);
      setTargetsText((s.connectivity_targets || []).join(', '));
      setInterfaces(ifaces.interfaces || []);
      setTrustedDevices(devRes.trusted_devices || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setError(null);
    setFeedback(null);
    try {
      const targets = targetsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean);

      const updated = await api.updateSettings({
        default_interface: settings.default_interface,
        packet_capture_limit: Number(settings.packet_capture_limit),
        packet_retention_limit: Number(settings.packet_retention_limit),
        refresh_interval_ms: Number(settings.refresh_interval_ms),
        alert_notifications_enabled: Boolean(settings.alert_notifications_enabled),
        alert_min_severity: settings.alert_min_severity,
        connectivity_targets: targets,
        security_rules: settings.security_rules,
      });
      setSettings(updated);
      setFeedback('Application settings saved successfully.');
      window.dispatchEvent(new CustomEvent('netsentinel:data-changed'));
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleAddTrusted = async (e) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);
    try {
      await api.trustDevice({
        ip_address: newTrustIp.trim(),
        mac_address: newTrustMac.trim(),
        description: newTrustDesc.trim(),
      });
      setNewTrustIp('');
      setNewTrustMac('');
      setNewTrustDesc('');
      setFeedback('Trusted device added to registry.');
      const devRes = await api.getDevices();
      setTrustedDevices(devRes.trusted_devices || []);
    } catch (err) {
      setError(err.message);
    }
  };

  const requestRemoveTrusted = (row) => {
    setConfirmState({
      open: true,
      title: 'Remove Trusted Device',
      message: `Remove ${row.ip_address} (${row.description || 'Unnamed device'}) from the approved Trusted Devices registry?`,
      confirmLabel: 'Remove Device',
      destructive: true,
      onConfirm: async () => {
        await api.untrustDevice(row.id);
        const devRes = await api.getDevices();
        setTrustedDevices(devRes.trusted_devices || []);
        setFeedback(`Removed ${row.ip_address} from Trusted Devices.`);
      },
    });
  };

  const requestClearHistory = (scope, label) => {
    setConfirmState({
      open: true,
      title: `Clear ${label}`,
      message: `Are you sure you want to permanently delete all stored ${label.toLowerCase()} from the local SQLite database? This action cannot be undone.`,
      confirmLabel: `Clear ${label}`,
      destructive: true,
      onConfirm: async () => {
        await api.clearHistory(scope);
        setFeedback(`Cleared ${label.toLowerCase()} successfully.`);
        window.dispatchEvent(new CustomEvent('netsentinel:data-changed'));
        await loadAll();
      },
    });
  };

  const handleToggleDemo = async () => {
    if (!settings) return;
    setError(null);
    setFeedback(null);
    try {
      const res = await api.toggleDemoMode(!settings.demo_mode);
      setFeedback(res.message);
      window.dispatchEvent(new CustomEvent('netsentinel:data-changed'));
      await loadAll();
    } catch (err) {
      setError(err.message);
    }
  };

  const executeConfirm = async () => {
    if (!confirmState.onConfirm) return;
    setConfirmBusy(true);
    setError(null);
    try {
      await confirmState.onConfirm();
      setConfirmState((prev) => ({ ...prev, open: false }));
    } catch (err) {
      setError(err.message);
      setConfirmState((prev) => ({ ...prev, open: false }));
    } finally {
      setConfirmBusy(false);
    }
  };

  if (loading && !settings) {
    return <div className="ns-card p-8 text-sm text-slate-500">Loading settings...</div>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="ns-page-title">Settings</h1>
        <p className="ns-page-subtitle">
          Configure monitoring interfaces, capture limits, alert thresholds, trusted devices, and database retention.
        </p>
      </div>

      <ErrorBanner message={error} onRetry={loadAll} onDismiss={() => setError(null)} />

      {feedback && (
        <div className="rounded-2xl border border-[#b7e4cd] dark:border-emerald-500/30 bg-[#e8f8f0] dark:bg-emerald-500/10 px-4 py-2.5 text-xs text-[#176442] dark:text-emerald-200 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            {feedback}
          </span>
          <button type="button" onClick={() => setFeedback(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {settings && (
        <form onSubmit={handleSaveSettings} className="space-y-5">
          {/* Core Monitoring Settings */}
          <div className="ns-card p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#e4eff5] dark:border-slate-800 pb-3">
              <h2 className="ns-section-title">Monitoring &amp; Capture Configuration</h2>
              <button type="submit" disabled={saving} className="ns-btn-primary !py-1.5 !text-xs">
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Saving...' : 'Save Settings'}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Default Network Interface
                </label>
                <select
                  value={settings.default_interface || ''}
                  onChange={(e) => setSettings({ ...settings, default_interface: e.target.value })}
                  className="ns-input w-full"
                >
                  <option value="">Auto-detect best active interface</option>
                  {interfaces.map((iface) => (
                    <option key={iface.name} value={iface.name}>
                      {iface.name} {iface.ipv4 ? `(${iface.ipv4})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Packet Capture Session Limit (100–50,000)
                </label>
                <input
                  type="number"
                  min="100"
                  max="50000"
                  value={settings.packet_capture_limit}
                  onChange={(e) => setSettings({ ...settings, packet_capture_limit: e.target.value })}
                  className="ns-input w-full font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  SQLite Packet Retention Limit (500–100,000)
                </label>
                <input
                  type="number"
                  min="500"
                  max="100000"
                  value={settings.packet_retention_limit}
                  onChange={(e) =>
                    setSettings({ ...settings, packet_retention_limit: e.target.value })
                  }
                  className="ns-input w-full font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Monitoring Refresh Interval (ms)
                </label>
                <input
                  type="number"
                  min="1000"
                  max="30000"
                  step="500"
                  value={settings.refresh_interval_ms}
                  onChange={(e) => setSettings({ ...settings, refresh_interval_ms: e.target.value })}
                  className="ns-input w-full font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Minimum Alert Notification Severity
                </label>
                <select
                  value={settings.alert_min_severity || 'Low'}
                  onChange={(e) => setSettings({ ...settings, alert_min_severity: e.target.value })}
                  className="ns-input w-full"
                >
                  <option value="Low">Low and above</option>
                  <option value="Medium">Medium and above</option>
                  <option value="High">High and above</option>
                  <option value="Critical">Critical only</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
                  Connectivity Check Targets (comma-separated)
                </label>
                <input
                  type="text"
                  value={targetsText}
                  onChange={(e) => setTargetsText(e.target.value)}
                  className="ns-input w-full font-mono"
                />
              </div>
            </div>

            <div className="pt-3 flex flex-wrap items-center justify-between gap-4 border-t border-[#e4eff5] dark:border-slate-800">
              <label className="flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={Boolean(settings.alert_notifications_enabled)}
                  onChange={(e) =>
                    setSettings({ ...settings, alert_notifications_enabled: e.target.checked })
                  }
                  className="rounded border-slate-400 text-[#244a5c]"
                />
                Enable real-time security alert notifications in the top bar
              </label>

              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                  <FlaskConical className="w-3.5 h-3.5 text-[#c95944]" />
                  Academic Demo Mode:
                </span>
                <button
                  type="button"
                  onClick={handleToggleDemo}
                  className={
                    settings.demo_mode ? 'ns-btn-danger !py-1.5 !text-xs' : 'ns-btn-secondary !py-1.5 !text-xs'
                  }
                >
                  {settings.demo_mode ? 'Enabled (Click to Disable)' : 'Disabled (Click to Enable)'}
                </button>
              </div>
            </div>
          </div>

          {/* Security Thresholds Quick Summary */}
          {settings.security_rules && (
            <div className="ns-card p-5 space-y-4">
              <h2 className="ns-section-title">Security Detection Thresholds</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div className="ns-subcard p-3.5 space-y-2">
                  <div className="font-bold text-[#1a3342] dark:text-slate-200">Port Scan Indicator</div>
                  <label className="block text-slate-500 dark:text-slate-400">
                    Distinct Ports Threshold
                    <input
                      type="number"
                      min="2"
                      value={settings.security_rules.port_scan?.distinct_ports_threshold ?? 10}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          security_rules: {
                            ...settings.security_rules,
                            port_scan: {
                              ...settings.security_rules.port_scan,
                              distinct_ports_threshold: Number(e.target.value),
                            },
                          },
                        })
                      }
                      className="ns-input w-full mt-1 !py-1.5 font-mono"
                    />
                  </label>
                </div>

                <div className="ns-subcard p-3.5 space-y-2">
                  <div className="font-bold text-[#1a3342] dark:text-slate-200">Repeated Connections</div>
                  <label className="block text-slate-500 dark:text-slate-400">
                    Attempts Threshold (per window)
                    <input
                      type="number"
                      min="3"
                      value={settings.security_rules.repeated_connection?.attempts_threshold ?? 20}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          security_rules: {
                            ...settings.security_rules,
                            repeated_connection: {
                              ...settings.security_rules.repeated_connection,
                              attempts_threshold: Number(e.target.value),
                            },
                          },
                        })
                      }
                      className="ns-input w-full mt-1 !py-1.5 font-mono"
                    />
                  </label>
                </div>

                <div className="ns-subcard p-3.5 space-y-2">
                  <div className="font-bold text-[#1a3342] dark:text-slate-200">Traffic Spike Baseline</div>
                  <label className="block text-slate-500 dark:text-slate-400">
                    Throughput Threshold (KB/s)
                    <input
                      type="number"
                      min="100"
                      value={settings.security_rules.traffic_spike?.threshold_kbps ?? 5000}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          security_rules: {
                            ...settings.security_rules,
                            traffic_spike: {
                              ...settings.security_rules.traffic_spike,
                              threshold_kbps: Number(e.target.value),
                            },
                          },
                        })
                      }
                      className="ns-input w-full mt-1 !py-1.5 font-mono"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}
        </form>
      )}

      {/* Trusted Device Management */}
      <div className="ns-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#244a5c] dark:text-sky-400" />
          <h2 className="ns-section-title">
            Approved Trusted Devices Registry ({trustedDevices.length})
          </h2>
        </div>

        <form onSubmit={handleAddTrusted} className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
              IP Address *
            </label>
            <input
              type="text"
              required
              value={newTrustIp}
              onChange={(e) => setNewTrustIp(e.target.value)}
              placeholder="192.168.1.1"
              className="ns-input w-full !py-1.5 text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
              MAC Address (optional)
            </label>
            <input
              type="text"
              value={newTrustMac}
              onChange={(e) => setNewTrustMac(e.target.value)}
              placeholder="AA:BB:CC:DD:EE:FF"
              className="ns-input w-full !py-1.5 text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Description
            </label>
            <input
              type="text"
              value={newTrustDesc}
              onChange={(e) => setNewTrustDesc(e.target.value)}
              placeholder="Gateway Router / Lab PC"
              className="ns-input w-full !py-1.5 text-xs"
            />
          </div>
          <button type="submit" className="ns-btn-primary !py-1.5 !text-xs">
            <Plus className="w-3.5 h-3.5" />
            Add Trusted Device
          </button>
        </form>

        <DataTable
          compact
          keyField="id"
          rows={trustedDevices}
          columns={[
            { key: 'ip_address', label: 'IP Address', mono: true },
            { key: 'mac_address', label: 'MAC Address', mono: true },
            { key: 'description', label: 'Description' },
            {
              key: 'added_at',
              label: 'Added At',
              mono: true,
              render: (r) => (
                <span className="text-slate-500 dark:text-slate-400">
                  {formatDateTime(r.added_at)}
                </span>
              ),
            },
            {
              key: 'actions',
              label: 'Action',
              align: 'right',
              render: (r) => (
                <button
                  type="button"
                  onClick={() => requestRemoveTrusted(r)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#c95944] hover:underline"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Remove
                </button>
              ),
            },
          ]}
          emptyTitle="No trusted devices configured"
          emptyDescription="Add approved devices above or mark discovered hosts as Trusted from the Network Discovery page."
        />
      </div>

      {/* Clear Historical Records */}
      <div className="ns-card p-5 border-[#e7bfb0] dark:border-red-500/20 space-y-4">
        <div>
          <h2 className="text-sm font-bold text-[#a53524] dark:text-red-300">
            Database Maintenance &amp; Cleanup
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Permanently remove historical records from local SQLite storage. Trusted devices and
            settings are preserved.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          {[
            { scope: 'packets', label: 'Captured Packets' },
            { scope: 'traffic', label: 'Traffic History' },
            { scope: 'alerts', label: 'Security Alerts' },
            { scope: 'diagnostics', label: 'Diagnostics Logs' },
            { scope: 'devices', label: 'Discovered Devices' },
            { scope: 'all', label: 'All Historical Data' },
          ].map((item) => (
            <button
              key={item.scope}
              type="button"
              onClick={() => requestClearHistory(item.scope, item.label)}
              className={
                item.scope === 'all'
                  ? 'ns-btn-danger !py-1.5 !text-xs'
                  : 'ns-btn-secondary !py-1.5 !text-xs !bg-[#fdf3f0] !text-[#a53524] !border-[#eabbb0] hover:!bg-[#f8dfd7] dark:!bg-red-500/10 dark:!text-red-300 dark:!border-red-500/30'
              }
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear {item.label}
            </button>
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        message={confirmState.message}
        confirmLabel={confirmState.confirmLabel}
        destructive={confirmState.destructive}
        loading={confirmBusy}
        onConfirm={executeConfirm}
        onCancel={() => setConfirmState((prev) => ({ ...prev, open: false }))}
      />
    </div>
  );
}
