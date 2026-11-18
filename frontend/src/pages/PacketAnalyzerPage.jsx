import React, { useEffect, useState } from 'react';
import {
  Activity,
  Filter,
  FlaskConical,
  Info,
  Lock,
  Play,
  RefreshCw,
  Search,
  ShieldAlert,
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
import { formatBytes, formatDateTime, formatNumber, formatTime } from '../utils/formatters';

const PROTOCOLS = ['ALL', 'TCP', 'UDP', 'ICMP', 'DNS', 'HTTP', 'ARP'];

export default function PacketAnalyzerPage() {
  const [selectedIface, setSelectedIface] = useState('');
  const [protocol, setProtocol] = useState('ALL');
  const [ipSearch, setIpSearch] = useState('');
  const [srcIp, setSrcIp] = useState('');
  const [dstIp, setDstIp] = useState('');
  const [port, setPort] = useState('');
  const [selectedPacket, setSelectedPacket] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [busy, setBusy] = useState(false);

  const { data: ifaceData } = usePolling(() => api.getInterfaces(), 10000, true);
  const interfaces = ifaceData?.interfaces || [];
  const capabilities = ifaceData?.capabilities || null;

  useEffect(() => {
    if (!selectedIface && interfaces.length > 0) {
      setSelectedIface(ifaceData?.selected_interface || interfaces[0].name);
    }
  }, [interfaces, ifaceData, selectedIface]);

  const {
    data: packetData,
    loading,
    error,
    refresh: refreshPackets,
  } = usePolling(
    () =>
      api.getPackets({
        protocol: protocol === 'ALL' ? '' : protocol,
        ip: ipSearch.trim(),
        src_ip: srcIp.trim(),
        dst_ip: dstIp.trim(),
        port: port.trim(),
        limit: 120,
      }),
    2500,
    true,
    [protocol, ipSearch, srcIp, dstIp, port]
  );

  const { data: statsData, refresh: refreshStats } = usePolling(
    () => api.getPacketStats(),
    3000,
    true
  );

  useEffect(() => {
    const onDataChange = () => {
      refreshPackets();
      refreshStats();
    };
    window.addEventListener('netsentinel:data-changed', onDataChange);
    return () => window.removeEventListener('netsentinel:data-changed', onDataChange);
  }, [refreshPackets, refreshStats]);

  const captureStatus = packetData?.capture_status || statsData?.capture_status || {};
  const isCapturing = Boolean(captureStatus.capturing);
  const packets = packetData?.packets || [];

  const handleStart = async () => {
    setActionError(null);
    setBusy(true);
    try {
      await api.startPacketCapture(selectedIface);
      refreshPackets();
      refreshStats();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setActionError(null);
    setBusy(true);
    try {
      await api.stopPacketCapture();
      refreshPackets();
      refreshStats();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleEnableDemo = async () => {
    setActionError(null);
    setBusy(true);
    try {
      await api.toggleDemoMode(true);
      window.dispatchEvent(new CustomEvent('netsentinel:data-changed'));
      refreshPackets();
      refreshStats();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleClearFilters = () => {
    setProtocol('ALL');
    setIpSearch('');
    setSrcIp('');
    setDstIp('');
    setPort('');
  };

  const columns = [
    {
      key: 'timestamp',
      label: 'Time',
      mono: true,
      render: (r) => <span className="text-slate-500 dark:text-slate-400">{formatTime(r.timestamp)}</span>,
    },
    {
      key: 'protocol',
      label: 'Protocol',
      render: (r) => <StatusBadge label={r.protocol} variant={r.protocol} />,
    },
    {
      key: 'src_ip',
      label: 'Source',
      mono: true,
      render: (r) => (
        <span className="text-[#244a5c] dark:text-sky-300 font-medium">
          {r.src_ip || '—'}
          {r.src_port !== null && r.src_port !== undefined ? `:${r.src_port}` : ''}
        </span>
      ),
    },
    {
      key: 'dst_ip',
      label: 'Destination',
      mono: true,
      render: (r) => (
        <span className="text-slate-700 dark:text-slate-200">
          {r.dst_ip || '—'}
          {r.dst_port !== null && r.dst_port !== undefined ? `:${r.dst_port}` : ''}
        </span>
      ),
    },
    {
      key: 'length',
      label: 'Length',
      mono: true,
      align: 'right',
      render: (r) => <span className="text-slate-600 dark:text-slate-300">{r.length} B</span>,
    },
    {
      key: 'tcp_flags',
      label: 'Flags',
      mono: true,
      render: (r) =>
        r.tcp_flags ? (
          <span className="px-2 py-0.5 rounded-md bg-[#eef6fa] dark:bg-navy-800 border border-[#cde0ea] dark:border-slate-700 text-[#1f4152] dark:text-cyan-300 text-[11px]">
            {r.tcp_flags}
          </span>
        ) : (
          <span className="text-slate-400">—</span>
        ),
    },
    {
      key: 'summary',
      label: 'Metadata Summary',
      render: (r) => (
        <div className="max-w-[340px] truncate text-xs text-slate-600 dark:text-slate-300" title={r.summary}>
          {r.dns_query ? `DNS: ${r.dns_query}` : r.http_info ? `HTTP: ${r.http_info}` : r.summary}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="ns-page-title">Live Packet Analyzer</h1>
          <p className="ns-page-subtitle">
            Safe packet metadata capture and protocol inspection powered by Scapy (TCP, UDP, ICMP, DNS, visible HTTP).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedIface}
            onChange={(e) => setSelectedIface(e.target.value)}
            disabled={isCapturing}
            className="ns-input !py-1.5 text-xs min-w-[200px]"
          >
            {interfaces.map((i) => (
              <option key={i.name} value={i.name}>
                {i.name} {i.ipv4 ? `(${i.ipv4})` : ''}
              </option>
            ))}
          </select>

          <button
            type="button"
            disabled={busy || isCapturing}
            onClick={handleStart}
            className="ns-btn-primary !py-1.5 !text-xs"
          >
            <Play className="w-3.5 h-3.5" />
            Start Capture
          </button>
          <button
            type="button"
            disabled={busy || !isCapturing}
            onClick={handleStop}
            className="ns-btn-danger !py-1.5 !text-xs"
          >
            <Square className="w-3.5 h-3.5" />
            Stop Capture
          </button>
          <button
            type="button"
            onClick={() => {
              refreshPackets();
              refreshStats();
            }}
            className="ns-btn-secondary !py-1.5 !text-xs"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Permission / Npcap Capability Notice with 1-click Demo Mode button */}
      {capabilities && !capabilities.can_live_capture && (
        <div className="rounded-2xl border border-[#f2d0a7] dark:border-amber-500/30 bg-[#fef6ec] dark:bg-amber-500/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-[#b45309] dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="text-xs text-[#7c3d12] dark:text-amber-200 space-y-1">
              <div className="font-semibold">Live Raw Packet Capture Permissions Check</div>
              <p className="leading-relaxed">{capabilities.summary}</p>
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={handleEnableDemo}
            className="ns-btn-primary !py-2 !px-3.5 !text-xs shrink-0"
          >
            <FlaskConical className="w-3.5 h-3.5" />
            Enable Demo Mode
          </button>
        </div>
      )}

      <ErrorBanner
        message={error || actionError}
        onDismiss={() => setActionError(null)}
      />

      {/* Packet KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label="Capture Status"
          value={isCapturing ? 'Capturing Live' : 'Idle'}
          subtext={
            isCapturing
              ? `Session #${captureStatus.session_id} on ${captureStatus.interface}`
              : 'Ready to capture'
          }
          icon={Activity}
          accent={isCapturing ? 'emerald' : 'slate'}
        />
        <StatCard
          label="Total Packets Stored"
          value={formatNumber(statsData?.total_packets || 0)}
          subtext={`Matching filters: ${formatNumber(packetData?.total || 0)}`}
          icon={Filter}
          accent="mint"
          mono
        />
        <StatCard
          label="Captured Volume"
          value={formatBytes(statsData?.total_bytes || 0)}
          subtext={`Session limit: ${formatNumber(captureStatus.capture_limit || 5000)} pkts`}
          icon={Info}
          accent="sky"
          mono
        />
        <StatCard
          label="Capture Rate"
          value={`${Number(captureStatus.packets_per_second || 0).toFixed(1)} pkt/s`}
          subtext="Metadata inspection only"
          icon={Lock}
          accent="blue"
          mono
        />
      </div>

      {/* Filters Toolbar */}
      <div className="ns-card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Protocol
            </label>
            <select
              value={protocol}
              onChange={(e) => setProtocol(e.target.value)}
              className="ns-input w-full !py-1.5 text-xs"
            >
              {PROTOCOLS.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Search Any IP
            </label>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={ipSearch}
                onChange={(e) => setIpSearch(e.target.value)}
                placeholder="192.168.1."
                className="ns-input w-full !py-1.5 !pl-8 text-xs font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Source IP
            </label>
            <input
              type="text"
              value={srcIp}
              onChange={(e) => setSrcIp(e.target.value)}
              placeholder="e.g. 192.168.1.15"
              className="ns-input w-full !py-1.5 text-xs font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Destination IP
            </label>
            <input
              type="text"
              value={dstIp}
              onChange={(e) => setDstIp(e.target.value)}
              placeholder="e.g. 8.8.8.8"
              className="ns-input w-full !py-1.5 text-xs font-mono"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
              Port
            </label>
            <input
              type="number"
              min="0"
              max="65535"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="e.g. 443, 53"
              className="ns-input w-full !py-1.5 text-xs font-mono"
            />
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={handleClearFilters}
              className="ns-btn-secondary w-full !py-1.5 !text-xs"
            >
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      {/* Packet Table + Details Panel */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 items-start">
        <div className={`ns-card overflow-hidden ${selectedPacket ? 'xl:col-span-2' : 'xl:col-span-3'}`}>
          <div className="px-4 py-3 border-b border-[#e4eff5] dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs font-bold text-[#1a3342] dark:text-slate-200">
              Captured Packet Stream (showing latest {packets.length} of{' '}
              {formatNumber(packetData?.total || 0)})
            </span>
            <span className="text-[11px] text-slate-500 dark:text-slate-400">
              Click any row to inspect packet metadata
            </span>
          </div>
          {loading && packets.length === 0 ? (
            <TableSkeleton rows={6} />
          ) : (
            <DataTable
              compact
              columns={columns}
              rows={packets}
              keyField="id"
              onRowClick={(pkt) => setSelectedPacket(pkt)}
              selectedRowKey={selectedPacket?.id ?? null}
              emptyIcon={Activity}
              emptyTitle="No captured packets match your criteria"
              emptyDescription="Start a live capture session (requires Administrator + Npcap on Windows) or click Enable Demo Mode above to inspect packet metadata."
            />
          )}
        </div>

        {/* Packet Details Panel */}
        {selectedPacket && (
          <div className="ns-card p-5 space-y-4 sticky top-20">
            <div className="flex items-start justify-between gap-2 pb-3 border-b border-[#e4eff5] dark:border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-[#1a3342] dark:text-slate-100">
                    Packet #{selectedPacket.id}
                  </h3>
                  <StatusBadge label={selectedPacket.protocol} variant={selectedPacket.protocol} />
                  {selectedPacket.is_demo && <StatusBadge label="DEMO" variant="demo" />}
                </div>
                <p className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-1">
                  {formatDateTime(selectedPacket.timestamp)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedPacket(null)}
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-100 rounded-lg"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-slate-500 font-semibold mb-1">
                  Packet Summary
                </div>
                <div className="p-2.5 rounded-xl bg-[#f4f9fc] dark:bg-navy-900 border border-[#d6e6ef] dark:border-slate-800 font-mono text-slate-700 dark:text-slate-200 break-words">
                  {selectedPacket.summary || '—'}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="p-2.5 rounded-xl bg-[#f4f9fc] dark:bg-navy-900 border border-[#d6e6ef] dark:border-slate-800">
                  <div className="text-[10px] uppercase text-slate-500">Source Endpoint</div>
                  <div className="font-mono text-[#244a5c] dark:text-sky-300 font-semibold mt-1 break-all">
                    {selectedPacket.src_ip || '—'}
                    {selectedPacket.src_port !== null && selectedPacket.src_port !== undefined
                      ? `:${selectedPacket.src_port}`
                      : ''}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-[#f4f9fc] dark:bg-navy-900 border border-[#d6e6ef] dark:border-slate-800">
                  <div className="text-[10px] uppercase text-slate-500">Destination Endpoint</div>
                  <div className="font-mono text-slate-700 dark:text-slate-200 font-semibold mt-1 break-all">
                    {selectedPacket.dst_ip || '—'}
                    {selectedPacket.dst_port !== null && selectedPacket.dst_port !== undefined
                      ? `:${selectedPacket.dst_port}`
                      : ''}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div className="p-2.5 rounded-xl bg-[#f4f9fc] dark:bg-navy-900 border border-[#d6e6ef] dark:border-slate-800">
                  <div className="text-[10px] uppercase text-slate-500">Size</div>
                  <div className="font-mono font-semibold text-slate-700 dark:text-slate-200 mt-1">
                    {selectedPacket.length} B
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-[#f4f9fc] dark:bg-navy-900 border border-[#d6e6ef] dark:border-slate-800">
                  <div className="text-[10px] uppercase text-slate-500">TCP Flags</div>
                  <div className="font-mono font-semibold text-[#244a5c] dark:text-cyan-300 mt-1">
                    {selectedPacket.tcp_flags || 'N/A'}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-[#f4f9fc] dark:bg-navy-900 border border-[#d6e6ef] dark:border-slate-800">
                  <div className="text-[10px] uppercase text-slate-500">Direction</div>
                  <div className="font-mono font-semibold text-slate-700 dark:text-slate-200 mt-1 capitalize">
                    {selectedPacket.direction || 'local'}
                  </div>
                </div>
              </div>

              {selectedPacket.dns_query && (
                <div className="p-3 rounded-xl bg-[#e8f8f0] dark:bg-emerald-500/10 border border-[#b7e4cd] dark:border-emerald-500/25">
                  <div className="text-[10px] uppercase text-[#176442] dark:text-emerald-400 font-semibold">
                    DNS Query Metadata
                  </div>
                  <div className="font-mono text-[#145337] dark:text-emerald-200 mt-1 break-all">
                    {selectedPacket.dns_query}
                  </div>
                </div>
              )}

              {selectedPacket.http_info && (
                <div className="p-3 rounded-xl bg-[#fef6ec] dark:bg-amber-500/10 border border-[#f2d0a7] dark:border-amber-500/25">
                  <div className="text-[10px] uppercase text-[#9a5514] dark:text-amber-400 font-semibold">
                    Visible Cleartext HTTP Metadata
                  </div>
                  <div className="font-mono text-[#7c3d12] dark:text-amber-200 mt-1 break-all">
                    {selectedPacket.http_info}
                  </div>
                </div>
              )}

              <div className="p-3 rounded-xl bg-[#f4f9fc] dark:bg-navy-900 border border-[#d6e6ef] dark:border-slate-800 flex items-start gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <span>
                  NetSentinel inspects header metadata only. Encrypted HTTPS/TLS payloads are never
                  decrypted or stored.
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
