import React, { useEffect, useState } from 'react';
import { useOutletContext } from 'react-router-dom';
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
  const { darkMode } = useOutletContext() || {};

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

  const gridStroke = darkMode ? '#1e3446' : '#e4eff5';
  const axisStroke = darkMode ? '#64748b' : '#7b94a3';
  const tooltipStyle = {
    backgroundColor: darkMode ? '#101d28' : '#ffffff',
    border: darkMode ? '1px solid #243d52' : '1px solid #cde0ea',
    borderRadius: '12px',
    fontSize: '12px',
    color: darkMode ? '#e2e8f0' : '#1a3342',
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="ns-page-title">Network Traffic Analytics</h1>
          <p className="ns-page-subtitle">
            Real-time interface bandwidth telemetry separated cleanly from packet-level captured metadata.
          </p>
        </div>

        <div className="flex items-center gap-1 bg-white dark:bg-navy-900 border border-[#cde0ea] dark:border-slate-800 rounded-xl p-1 shadow-card">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              onClick={() => setRange(r.key)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                range === r.key
                  ? 'bg-[#244a5c] dark:bg-sky-600 text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-[#eef6fa] dark:hover:bg-navy-800'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      <ErrorBanner message={currErr || histErr || protoErr} onRetry={refreshCurrent} />

      {/* Explicit Metric Distinction Notice */}
      <div className="rounded-2xl border border-[#bfdceb] dark:border-sky-500/25 bg-white dark:bg-sky-500/10 px-4 py-3 flex items-start gap-3 text-xs text-slate-600 dark:text-sky-200 shadow-card">
        <Info className="w-4 h-4 text-[#244a5c] dark:text-sky-400 shrink-0 mt-0.5" />
        <div>
          <strong className="text-[#1a3342] dark:text-sky-300">Metric Scope Separation:</strong>{' '}
          Bandwidth speeds, cumulative incoming/outgoing bytes, and utilization are measured from{' '}
          <strong>OS interface-level counters (psutil)</strong> on{' '}
          <code className="font-mono bg-[#eef6fa] dark:bg-sky-500/20 px-1.5 py-0.5 rounded">
            {current?.interface || 'NIC'}
          </code>
          . Protocol and per-device traffic charts come strictly from{' '}
          <strong>packet-level captured metadata</strong> ({formatNumber(pktMetrics.total_packets)}{' '}
          packets / {formatBytes(pktMetrics.total_bytes)}).
        </div>
      </div>

      {/* OS Interface KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <StatCard
          label="Download Speed"
          value={formatSpeed(ifaceMetrics.download_bps)}
          subtext="NIC incoming rate"
          icon={Download}
          accent="mint"
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
          label="Packets / Sec"
          value={`${Number(ifaceMetrics.packets_per_sec || 0).toFixed(1)}`}
          subtext={`Capture: ${Number(pktMetrics.capture_pps || 0).toFixed(1)} pkt/s`}
          icon={Activity}
          accent="blue"
          mono
        />
        <StatCard
          label="Incoming Total (NIC)"
          value={formatBytes(ifaceMetrics.bytes_recv_total)}
          subtext="OS counter since boot"
          icon={ArrowDownLeft}
          accent="emerald"
          mono
        />
        <StatCard
          label="Outgoing Total (NIC)"
          value={formatBytes(ifaceMetrics.bytes_sent_total)}
          subtext="OS counter since boot"
          icon={ArrowUpRight}
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
                    <linearGradient id="inAreaLight" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3c9a7c" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3c9a7c" stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="outAreaLight" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#d98a6c" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#d98a6c" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="timeLabel" stroke={axisStroke} tick={{ fontSize: 11 }} minTickGap={24} />
                  <YAxis stroke={axisStroke} tick={{ fontSize: 11 }} unit=" KB/s" width={70} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Area
                    type="monotone"
                    dataKey="download_kbps"
                    name="Incoming (KB/s)"
                    stroke="#2a6f5b"
                    strokeWidth={2}
                    fill="url(#inAreaLight)"
                  />
                  <Area
                    type="monotone"
                    dataKey="upload_kbps"
                    name="Outgoing (KB/s)"
                    stroke="#c96e4b"
                    strokeWidth={2}
                    fill="url(#outAreaLight)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

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
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="timeLabel" stroke={axisStroke} tick={{ fontSize: 11 }} minTickGap={24} />
                  <YAxis stroke={axisStroke} tick={{ fontSize: 11 }} unit=" pps" width={62} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Line
                    type="monotone"
                    dataKey="packets_per_sec"
                    name="Packets / sec"
                    stroke="#486d7e"
                    strokeWidth={2.2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

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
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} vertical={false} />
                  <XAxis dataKey="protocol" stroke={axisStroke} tick={{ fontSize: 11 }} />
                  <YAxis stroke={axisStroke} tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="count" name="Packets" radius={[6, 6, 0, 0]}>
                    {protocols.map((entry) => (
                      <Cell key={entry.protocol} fill={getProtocolColor(entry.protocol)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

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
                  <CartesianGrid strokeDasharray="3 3" stroke={gridStroke} horizontal={false} />
                  <XAxis type="number" stroke={axisStroke} tick={{ fontSize: 11 }} unit=" KB" />
                  <YAxis
                    type="category"
                    dataKey="ip"
                    stroke={axisStroke}
                    tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }}
                    width={102}
                  />
                  <Tooltip contentStyle={tooltipStyle} />
                  <Bar dataKey="recvKB" name="Received (KB)" stackId="a" fill="#486d7e" />
                  <Bar dataKey="sentKB" name="Sent (KB)" stackId="a" fill="#a9c2d1" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>
      </div>

      {/* Device Traffic Breakdown Table */}
      <div className="ns-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#e4eff5] dark:border-slate-800">
          <h3 className="ns-section-title">Device-Wise Traffic Breakdown</h3>
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
