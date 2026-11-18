import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  Download,
  Info,
  Laptop,
  Play,
  Radar,
  RefreshCw,
  ShieldCheck,
  ShieldOff,
  Square,
  X,
} from 'lucide-react';
import DataTable from '../components/DataTable';
import ErrorBanner from '../components/ErrorBanner';
import { TableSkeleton } from '../components/LoadingSkeleton';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import { usePolling } from '../hooks/usePolling';
import { api } from '../services/api';
import { formatBytes, formatDateTime, formatNumber } from '../utils/formatters';

export default function DiscoveryPage() {
  const [selectedIface, setSelectedIface] = useState('');
  const [subnet, setSubnet] = useState('');
  const [authorized, setAuthorized] = useState(false);
  const [actionError, setActionError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);
  const [starting, setStarting] = useState(false);

  // Trust modal state
  const [trustModalDevice, setTrustModalDevice] = useState(null);
  const [trustDescription, setTrustDescription] = useState('');
  const [trustBusy, setTrustBusy] = useState(false);

  const { data: ifaceData } = usePolling(() => api.getInterfaces(), 10000, true);
  const {
    data: devicesData,
    loading,
    error,
    refresh: refreshDevices,
  } = usePolling(() => api.getNetworkDevices(), 3000, true);

  const interfaces = ifaceData?.interfaces || [];
  const devices = devicesData?.devices || [];
  const scanStatus = devicesData?.scan_status || {};
  const isScanning = Boolean(scanStatus.running);

  useEffect(() => {
    if (!selectedIface && interfaces.length > 0) {
      const def =
        interfaces.find((i) => i.name === ifaceData?.selected_interface) || interfaces[0];
      setSelectedIface(def.name);
      if (def.subnet) setSubnet(def.subnet);
    }
  }, [interfaces, ifaceData, selectedIface]);

  useEffect(() => {
    const onDataChange = () => refreshDevices();
    window.addEventListener('netsentinel:data-changed', onDataChange);
    return () => window.removeEventListener('netsentinel:data-changed', onDataChange);
  }, [refreshDevices]);

  const handleInterfaceChange = (name) => {
    setSelectedIface(name);
    const found = interfaces.find((i) => i.name === name);
    if (found?.subnet) {
      setSubnet(found.subnet);
    }
  };

  const handleStartScan = async () => {
    setActionError(null);
    setActionSuccess(null);
    if (!authorized) {
      setActionError(
        'Please confirm you are authorized to scan this local private network before starting.'
      );
      return;
    }
    setStarting(true);
    try {
      await api.startDiscovery({
        interface: selectedIface,
        subnet: subnet.trim(),
        authorized: true,
      });
      setActionSuccess(`Local network discovery started on ${subnet || selectedIface}.`);
      refreshDevices();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setStarting(false);
    }
  };

  const handleStopScan = async () => {
    setActionError(null);
    try {
      await api.stopDiscovery();
      refreshDevices();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const handleConfirmTrust = async () => {
    if (!trustModalDevice) return;
    setTrustBusy(true);
    setActionError(null);
    try {
      await api.trustDevice({
        ip_address: trustModalDevice.ip_address,
        mac_address: trustModalDevice.mac_address,
        hostname: trustModalDevice.hostname,
        description: trustDescription.trim(),
      });
      setTrustModalDevice(null);
      setTrustDescription('');
      setActionSuccess(`Marked ${trustModalDevice.ip_address} as a Trusted Device.`);
      refreshDevices();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setTrustBusy(false);
    }
  };

  const handleUntrust = async (device) => {
    if (!device.trusted_id) return;
    setActionError(null);
    try {
      await api.untrustDevice(device.trusted_id);
      setActionSuccess(`Removed ${device.ip_address} from Trusted Devices.`);
      refreshDevices();
    } catch (err) {
      setActionError(err.message);
    }
  };

  const trustedCount = devices.filter((d) => d.is_trusted).length;
  const unapprovedCount = devices.filter((d) => !d.is_trusted).length;

  const columns = [
    {
      key: 'ip_address',
      label: 'Device IP',
      mono: true,
      render: (row) => (
        <div className="flex items-center gap-2">
          <span className="font-mono text-sky-300 font-medium">{row.ip_address}</span>
          {row.is_new && <StatusBadge label="NEW" variant="new" />}
          {row.is_demo && <StatusBadge label="DEMO" variant="demo" />}
        </div>
      ),
    },
    {
      key: 'mac_address',
      label: 'MAC Address',
      mono: true,
      render: (row) => (
        <span className="font-mono text-xs text-slate-300">{row.mac_address || 'Unavailable'}</span>
      ),
    },
    {
      key: 'hostname',
      label: 'Hostname',
      render: (row) => (
        <div>
          <div className="text-sm text-slate-200">{row.hostname || 'Unknown'}</div>
          {row.description && (
            <div className="text-[11px] text-slate-400">{row.description}</div>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      render: (row) => <StatusBadge label={row.status} variant={row.status} dot />,
    },
    {
      key: 'is_trusted',
      label: 'Trust',
      render: (row) => (
        <StatusBadge
          label={row.is_trusted ? 'Trusted' : 'Unapproved'}
          variant={row.is_trusted ? 'trusted' : 'unapproved'}
        />
      ),
    },
    {
      key: 'total_bytes',
      label: 'Observed Traffic',
      mono: true,
      render: (row) => (
        <span className="text-xs text-slate-300">
          {formatBytes(row.total_bytes)} ({formatNumber(row.packet_count)} pkts)
        </span>
      ),
    },
    {
      key: 'first_discovered',
      label: 'First Discovered',
      mono: true,
      render: (row) => <span className="text-xs text-slate-400">{formatDateTime(row.first_discovered)}</span>,
    },
    {
      key: 'last_seen',
      label: 'Last Seen',
      mono: true,
      render: (row) => <span className="text-xs text-slate-300">{formatDateTime(row.last_seen)}</span>,
    },
    {
      key: 'actions',
      label: 'Manage',
      align: 'right',
      render: (row) => (
        <div className="flex items-center justify-end gap-1.5">
          {row.is_trusted ? (
            <button
              type="button"
              onClick={() => handleUntrust(row)}
              className="ns-btn-secondary !py-1 !px-2.5 !text-xs text-amber-300 border-amber-500/30 hover:bg-amber-500/10"
            >
              <ShieldOff className="w-3.5 h-3.5" />
              Untrust
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setTrustModalDevice(row);
                setTrustDescription(row.description || '');
              }}
              className="ns-btn-secondary !py-1 !px-2.5 !text-xs text-sky-300 border-sky-500/30 hover:bg-sky-500/10"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              Trust
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">
            Network Discovery &amp; Device Management
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Discover hosts on your authorized local subnet via ARP scanning and manage trusted devices.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={refreshDevices}
            className="ns-btn-secondary !py-1.5 !text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
          <a
            href={api.getCsvExportUrl('', '', 'devices')}
            className="ns-btn-secondary !py-1.5 !text-xs"
          >
            <Download className="w-3.5 h-3.5" />
            Export CSV
          </a>
        </div>
      </div>

      <ErrorBanner message={error || actionError} onRetry={refreshDevices} />

      {actionSuccess && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-xs text-emerald-200 flex items-center justify-between">
          <span className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            {actionSuccess}
          </span>
          <button type="button" onClick={() => setActionSuccess(null)} className="text-emerald-300 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Summary Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Discovered"
          value={formatNumber(devices.length)}
          subtext={`${devicesData?.online || 0} currently online`}
          icon={Laptop}
          accent="sky"
          mono
        />
        <StatCard
          label="New This Scan"
          value={formatNumber(devicesData?.new_count || 0)}
          subtext="Compared with previous scan"
          icon={Radar}
          accent="blue"
          mono
        />
        <StatCard
          label="Trusted Devices"
          value={formatNumber(trustedCount)}
          subtext="Approved in SQLite registry"
          icon={ShieldCheck}
          accent="emerald"
          mono
        />
        <StatCard
          label="Unapproved Devices"
          value={formatNumber(unapprovedCount)}
          subtext="Flagged for admin review"
          icon={ShieldOff}
          accent={unapprovedCount > 0 ? 'amber' : 'slate'}
          mono
        />
      </div>

      {/* Scan Control Card */}
      <div className="ns-card p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-100">Authorized Local ARP Scanner</h2>
          {scanStatus.method && (
            <StatusBadge
              label={isScanning ? 'Scan Running' : scanStatus.method}
              variant={isScanning ? 'active' : 'low'}
              dot={isScanning}
            />
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Network Interface
            </label>
            <select
              value={selectedIface}
              onChange={(e) => handleInterfaceChange(e.target.value)}
              className="ns-input w-full"
            >
              {interfaces.map((iface) => (
                <option key={iface.name} value={iface.name}>
                  {iface.name} {iface.ipv4 ? `(${iface.ipv4})` : '(No IPv4)'}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 mb-1.5">
              Local Private Subnet (CIDR)
            </label>
            <input
              type="text"
              value={subnet}
              onChange={(e) => setSubnet(e.target.value)}
              placeholder="e.g. 192.168.1.0/24"
              className="ns-input w-full font-mono"
            />
          </div>

          <div className="flex items-end gap-2">
            <button
              type="button"
              disabled={isScanning || starting}
              onClick={handleStartScan}
              className="ns-btn-primary flex-1"
            >
              <Play className="w-4 h-4" />
              {isScanning ? 'Scanning...' : 'Start Scan'}
            </button>
            <button
              type="button"
              disabled={!isScanning}
              onClick={handleStopScan}
              className="ns-btn-danger"
            >
              <Square className="w-4 h-4" />
              Stop Scan
            </button>
          </div>
        </div>

        <label className="flex items-start gap-2.5 text-xs text-slate-300 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={authorized}
            onChange={(e) => setAuthorized(e.target.checked)}
            className="mt-0.5 rounded border-slate-600 bg-navy-900 text-sky-500 focus:ring-sky-500/40"
          />
          <span>
            I confirm that I have explicit authorization to scan this private local network subnet.
            Public IP ranges are automatically blocked by NetSentinel.
          </span>
        </label>

        {scanStatus.message && (
          <div
            className={`rounded-lg border px-3.5 py-2.5 text-xs flex items-start gap-2 ${
              scanStatus.error
                ? 'bg-red-500/10 border-red-500/30 text-red-200'
                : scanStatus.fallback_used
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                : 'bg-sky-500/10 border-sky-500/30 text-sky-200'
            }`}
          >
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <div>{scanStatus.error || scanStatus.message}</div>
              {scanStatus.finished_at && !isScanning && (
                <div className="mt-1 text-[11px] opacity-80 font-mono">
                  Last scan completed: {formatDateTime(scanStatus.finished_at)} · Found:{' '}
                  {scanStatus.discovered_count} · New: {scanStatus.new_devices_count}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Detected Interfaces Reference Table */}
      <div className="ns-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-100">
            Detected Local Network Interfaces ({interfaces.length})
          </h3>
        </div>
        <DataTable
          compact
          keyField="name"
          rows={interfaces}
          columns={[
            { key: 'name', label: 'Interface Name' },
            { key: 'ipv4', label: 'IPv4 Address', mono: true },
            { key: 'subnet', label: 'Subnet CIDR', mono: true },
            { key: 'mac', label: 'MAC Address', mono: true },
            {
              key: 'speed_mbps',
              label: 'Speed',
              mono: true,
              render: (r) => (r.speed_mbps ? `${r.speed_mbps} Mbps` : '—'),
            },
            {
              key: 'is_up',
              label: 'Link Status',
              render: (r) => (
                <StatusBadge label={r.is_up ? 'UP' : 'DOWN'} variant={r.is_up ? 'online' : 'offline'} dot />
              ),
            },
          ]}
        />
      </div>

      {/* Discovered Devices Table */}
      <div className="ns-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-100">
              Discovered Devices ({devices.length})
            </h3>
            <p className="text-xs text-slate-400">
              NetSentinel tracks device trust passively without modifying OS firewall rules.
            </p>
          </div>
        </div>
        {loading && devices.length === 0 ? (
          <TableSkeleton rows={5} />
        ) : (
          <DataTable
            columns={columns}
            rows={devices}
            keyField="id"
            emptyIcon={Radar}
            emptyTitle="No local devices discovered yet"
            emptyDescription="Select a local network interface, confirm authorization above, and click Start Scan to discover hosts."
          />
        )}
      </div>

      {/* Mark Trusted Modal */}
      {trustModalDevice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="ns-card w-full max-w-md p-5 border-slate-700 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-100">Mark Device as Trusted</h3>
              <button
                type="button"
                onClick={() => setTrustModalDevice(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="mt-3 rounded-lg bg-navy-900 border border-slate-800 p-3 text-xs font-mono space-y-1">
              <div>
                <span className="text-slate-500">IP: </span>
                <span className="text-sky-300">{trustModalDevice.ip_address}</span>
              </div>
              <div>
                <span className="text-slate-500">MAC: </span>
                <span className="text-slate-300">{trustModalDevice.mac_address || 'Unavailable'}</span>
              </div>
              <div>
                <span className="text-slate-500">Host: </span>
                <span className="text-slate-300">{trustModalDevice.hostname || 'Unknown'}</span>
              </div>
            </div>
            <div className="mt-4">
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Device Description / Owner Note
              </label>
              <input
                type="text"
                value={trustDescription}
                onChange={(e) => setTrustDescription(e.target.value)}
                placeholder="e.g. Lab Gateway Router, Admin Laptop"
                className="ns-input w-full"
              />
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setTrustModalDevice(null)}
                className="ns-btn-secondary"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={trustBusy}
                onClick={handleConfirmTrust}
                className="ns-btn-primary"
              >
                {trustBusy ? 'Saving...' : 'Save as Trusted'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

