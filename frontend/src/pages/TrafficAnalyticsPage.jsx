import React, { useEffect, useState } from 'react';
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  Download,
  Gauge,
  Info,
  Layers,
  Upload,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import ChartCard from '../components/ChartCard';
import DataTable from '../components/DataTable';
import EmptyState from '../components/EmptyState';
import ErrorBanner from '../components/ErrorBanner';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import { usePolling } from '../hooks/usePolling';
import { api } from '../services/api';
import {
  formatBytes,
  formatNumber,
  formatSpeed,
  formatTime,
  getProtocolColor,
} from '../utils/formatters';

const RANGES = [
  { key: '5m', label: 'Last 5 min' },
  { key: '15m', label: 'Last 15 min' },
  { key: '1h', label: 'Last 1 hour' },
  { key: '24h', label: 'Last 24 hours' },
];

export default function TrafficAnalyticsPage() {
  const [range, setRange] = useState('15m');

  const {
    data: current,
    error: currErr,
    refresh: refreshCurrent,
  } = usePolling(() => api.getCurrentTraffic(), 2500, true);

  const {
    data: history,
    error: histErr,
    refresh: refreshHistory,
  } = usePolling(() => api.getTrafficHistory(range), 3000, true, [range]);

  const {
    data: protoData,
    error: protoErr,
    refresh: refreshProto,
  } = usePolling(() => api.getTrafficProtocols(), 4000, true);

  useEffect(() => {
    const onDataChange = () => {
      refreshCurrent();
      refreshHistory();
      refreshProto();
    };
    window.addEventListener('netsentinel:data-changed', onDataChange);
    return () => window.removeEventListener('netsentinel:data-changed', onDataChange);
  }, [refreshCurrent, refreshHistory, refreshProto]);

  const ifaceMetrics = current?.interface_metrics || {};
  const pktMetrics = current?.captured_packet_metrics || {};
  const points = (history?.points || []).map((p) => ({
    ...p,
    timeLabel: formatTime(p.timestamp),
  }));
  const protocols = protoData?.protocols || [];
  const topDevices = protoData?.top_devices || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Network Traffic Analytics</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time interface bandwidth telemetry separated cleanly from packet-level captured metadata.
          </p>
        </div>

        <div className="flex items-center gap-1 bg-navy-900 border border-slate-800 rounded-lg p-1">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                range === r.key
                  ? 'bg-sky-600 text-white'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <ErrorBanner message={currErr || histErr || protoErr} onRetry={refreshCurrent} />

      {/* Explicit Metric Distinction Notice */}
      <div className="rounded-xl border border-sky-500/25 bg-sky-500/10 px-4 py-3 flex items-start gap-3 text-xs text-sky-200">
        <Info className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-sky-300">Metric Scope Separation:</strong> Top bandwidth speeds,
          total incoming/outgoing bytes, and link utilization are measured from{' '}
          <strong>OS interface-level counters (psutil)</strong> on{' '}
          <code className="font-mono bg-sky-500/20 px-1 rounded">{current?.interface || 'NIC'}</code>.
          Protocol distribution and per-device traffic charts are derived strictly from{' '}
          <strong>packet-level captured metadata</strong> ({formatNumber(pktMetrics.total_packets)}{' '}
          packets / {formatBytes(pktMetrics.total_bytes)}).
        </div>
      </div>

      {/* OS Interface KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard
          label="Download Speed"
          value={formatSpeed(ifaceMetrics.download_bps)}
          subtext="NIC incoming rate"
          icon={Download}
          accent="emerald"
          mono
        />
        <StatCard
          label="Upload Speed"
          value={formatSpeed(ifaceMetrics.upload_bps)}
          subtext="NIC outgoing rate"
          icon={Upload}
          accent="sky"
          mono
        />
        <StatCard
          label="Incoming Total"
          value={formatBytes(ifaceMetrics.bytes_recv_total)}
          subtext="OS counter since boot"
          icon={ArrowDownLeft}
          accent="emerald"
          mono
        />
        <StatCard
          label="Outgoing Total"
          value={formatBytes(ifaceMetrics.bytes_sent_total)}
          subtext="OS counter since boot"
          icon={ArrowUpRight}
          accent="blue"
          mono
        />
        <StatCard
          label="Packets / Sec"
          value={`${Number(ifaceMetrics.packets_per_sec || 0).toFixed(1)}`}
          subtext={`Capture: ${Number(pktMetrics.capture_pps || 0).toFixed(1)} pkt/s`}
          icon={Activity}
          accent="sky"
          mono
        />
        <StatCard
          label="Link Utilization"
          value={`${Number(ifaceMetrics.utilization_percent || 0).toFixed(2)}%`}
          subtext={
            ifaceMetrics.link_speed_mbps
              ? `${ifaceMetrics.link_speed_mbps} Mbps link`
              : 'Link speed unknown'
          }
          icon={Gauge}
          accent="amber"
          mono
        />
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        {/* Chart 1: Incoming vs Outgoing over time */}
        <ChartCard
          title="Incoming vs Outgoing Traffic Over Time"
          subtitle={`Interface throughput in KB/s (${RANGES.find((r) => r.key === range)?.label})`}
        >
          {points.length === 0 ? (
            <EmptyState
              icon={BarChart3}
              title="No traffic samples in this window yet"
              description="Keep NetSentinel open for a few seconds as psutil records live interface counters."
              compact
            />
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="inArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="outArea" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="timeLabel" stroke="#64748b" tick={{ fontSize: 11 }} minTickGap={24} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 11 }} unit=" KB/s" width={70} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0c1322',
                      border: '1px solid #1e293b',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="download_kbps"
                    name="Incoming (KB/s)"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#inArea)"
                  />
                  <Area
                    type="monotone"
                    dataKey="upload_kbps"
                    name="Outgoing (KB/s)"
                    stroke="#38bdf8"
                    strokeWidth={2}
                    fill="url(#outArea)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        {/* Chart 2: Packets per second & Bandwidth utilization trend */}
        <ChartCard
          title="Packets Per Second (NIC Rate)"
          subtitle="Real-time interface packet rate over selected time range"
        >
          {points.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="Awaiting interface samples"
              description="Packet-per-second telemetry populates automatically every 2.5 seconds."
              compact
            />
          ) : (
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="timeLabel" stroke="#64748b" tick={{ fontSize: 11 }} minTickGap={24} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 11 }} unit=" pps" width={62} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0c1322',
                      border: '1px solid #1e293b',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="packets_per_sec"
                    name="Packets / sec"
                    stroke="#6366f1"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        {/* Chart 3: TCP vs UDP vs ICMP Protocol Distribution */}
        <ChartCard
          title="TCP vs UDP vs ICMP Protocol Distribution"
          subtitle="Packet count by protocol from captured packet metadata"
        >
          {protocols.length === 0 ? (
            <EmptyState
              icon={Layers}
              title="No captured packets available"
              description="Run a packet capture session (or toggle Demo Mode) to analyze TCP, UDP, ICMP, DNS, and HTTP traffic."
              compact
            />
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={protocols} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                  <XAxis dataKey="protocol" stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0c1322',
                      border: '1px solid #1e293b',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="count" name="Packets" radius={[4, 4, 0, 0]}>
                    {protocols.map((entry) => (
                      <Cell key={entry.protocol} fill={getProtocolColor(entry.protocol)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        {/* Chart 4: Top Devices by Traffic */}
        <ChartCard
          title="Top Devices by Observed Traffic"
          subtitle="Packet-level byte volume attributed to discovered hosts"
        >
          {topDevices.filter((d) => d.total_bytes > 0).length === 0 ? (
            <EmptyState
              icon={BarChart3}
              title="No per-device traffic data"
              description="Discover devices on your local network and capture packets to rank top talkers."
              compact
            />
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topDevices
                    .filter((d) => d.total_bytes > 0)
                    .slice(0, 7)
                    .map((d) => ({
                      ip: d.ip_address,
                      sentKB: Math.round(d.bytes_sent / 1024),
                      recvKB: Math.round(d.bytes_received / 1024),
                    }))}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 10, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                  <XAxis type="number" stroke="#64748b" tick={{ fontSize: 11 }} unit=" KB" />
                  <YAxis
                    type="category"
                    dataKey="ip"
                    stroke="#94a3b8"
                    tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }}
                    width={102}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0c1322',
                      border: '1px solid #1e293b',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="recvKB" name="Received (KB)" stackId="a" fill="#10b981" />
                  <Bar dataKey="sentKB" name="Sent (KB)" stackId="a" fill="#38bdf8" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      </div>

      {/* Device Traffic Breakdown Table */}
      <div className="ns-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800">
          <h3 className="text-sm font-semibold text-slate-100">Device-Wise Traffic Breakdown</h3>
        </div>
        <DataTable
          compact
          keyField="ip_address"
          rows={topDevices}
          columns={[
            { key: 'ip_address', label: 'IP Address', mono: true },
            { key: 'hostname', label: 'Hostname' },
            {
              key: 'status',
              label: 'Status',
              render: (r) => <StatusBadge label={r.status} variant={r.status} dot />,
            },
            {
              key: 'bytes_received',
              label: 'Received',
              mono: true,
              align: 'right',
              render: (r) => formatBytes(r.bytes_received),
            },
            {
              key: 'bytes_sent',
              label: 'Sent',
              mono: true,
              align: 'right',
              render: (r) => formatBytes(r.bytes_sent),
            },
            {
              key: 'total_bytes',
              label: 'Total Volume',
              mono: true,
              align: 'right',
              render: (r) => formatBytes(r.total_bytes),
            },
            {
              key: 'packet_count',
              label: 'Packets',
              mono: true,
              align: 'right',
              render: (r) => formatNumber(r.packet_count),
            },
          ]}
          emptyTitle="No device traffic records yet"
          emptyDescription="Run Network Discovery and Packet Capture to collect per-device traffic counters."
        />
      </div>
    </div>
  );
}

