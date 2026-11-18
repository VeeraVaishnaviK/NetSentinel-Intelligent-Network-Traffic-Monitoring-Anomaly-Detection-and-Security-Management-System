import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity,
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  FileText,
  Gauge,
  HeartPulse,
  Laptop,
  Network,
  Play,
  Radar,
  ShieldAlert,
  Square,
  Terminal,
  Upload,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import ChartCard from '../components/ChartCard';
import EmptyState from '../components/EmptyState';
import ErrorBanner from '../components/ErrorBanner';
import { StatCardSkeleton } from '../components/LoadingSkeleton';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import { usePolling } from '../hooks/usePolling';
import { api } from '../services/api';
import {
  formatBytes,
  formatDateTime,
  formatNumber,
  formatSpeed,
  formatTime,
  getProtocolColor,
} from '../utils/formatters';

export default function OverviewPage() {
  const navigate = useNavigate();

  const {
    data: status,
    loading,
    error,
    refresh: refreshStatus,
  } = usePolling(() => api.getNetworkStatus(), 2500, true);

  const { data: historyData, refresh: refreshHistory } = usePolling(
    () => api.getTrafficHistory('15m'),
    3000,
    true
  );

  const { data: protoData, refresh: refreshProto } = usePolling(
    () => api.getTrafficProtocols(),
    4000,
    true
  );

  const { data: secSummary, refresh: refreshSec } = usePolling(
    () => api.getSecuritySummary(),
    4000,
    true
  );

  useEffect(() => {
    const onDataChange = () => {
      refreshStatus();
      refreshHistory();
      refreshProto();
      refreshSec();
    };
    window.addEventListener('netsentinel:data-changed', onDataChange);
    return () => window.removeEventListener('netsentinel:data-changed', onDataChange);
  }, [refreshStatus, refreshHistory, refreshProto, refreshSec]);

  const stats = status?.stats || {};
  const points = (historyData?.points || []).map((p) => ({
    ...p,
    timeLabel: formatTime(p.timestamp),
  }));
  const protocols = protoData?.protocols || [];
  const topDevices = (protoData?.top_devices || []).filter((d) => d.total_bytes > 0).slice(0, 6);
  const recentAlerts = secSummary?.recent_alerts || [];
  const activity = status?.recent_activity || [];

  return (
    <div className="space-y-6">
      {/* Header + Health Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Network Overview</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Real-time telemetry from local OS interfaces, packet analyzer, and security engine.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => navigate('/discovery')}
            className="ns-btn-secondary !py-1.5 !text-xs"
          >
            <Radar className="w-3.5 h-3.5 text-sky-400" />
            Discover Devices
          </button>
          <button
            type="button"
            onClick={() => navigate('/packets')}
            className="ns-btn-primary !py-1.5 !text-xs"
          >
            {status?.monitoring_active ? (
              <>
                <Square className="w-3.5 h-3.5" />
                View Live Capture
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5" />
                Packet Analyzer
              </>
            )}
          </button>
          <button
            type="button"
            onClick={() => navigate('/diagnostics')}
            className="ns-btn-secondary !py-1.5 !text-xs"
          >
            <Terminal className="w-3.5 h-3.5 text-emerald-400" />
            Diagnostics
          </button>
          <button
            type="button"
            onClick={() => navigate('/reports')}
            className="ns-btn-secondary !py-1.5 !text-xs"
          >
            <FileText className="w-3.5 h-3.5 text-amber-400" />
            Reports
          </button>
        </div>
      </div>

      <ErrorBanner message={error} onRetry={refreshStatus} />

      {/* Network Health & Active Monitoring Session Banner */}
      {status && (
        <div className="ns-card p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3">
            <div
              className={`p-2.5 rounded-xl border ${
                status.health === 'healthy'
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                  : status.health === 'warning'
                  ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                  : 'bg-red-500/10 border-red-500/30 text-red-400'
              }`}
            >
              <HeartPulse className="w-5 h-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-slate-100">Network Health</span>
                <StatusBadge label={status.availability} variant={status.health} dot />
                <StatusBadge
                  label={
                    status.monitoring_active
                      ? 'Packet Capture Running'
                      : 'No Active Capture Session'
                  }
                  variant={status.monitoring_active ? 'active' : 'stopped'}
                />
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {status.monitoring_active && status.active_session
                  ? `Active capture session #${status.active_session.id} on ${status.active_session.interface_name} started at ${formatDateTime(
                      status.active_session.started_at
                    )}.`
                  : `Interface ${status.active_interface || 'N/A'} OS telemetry is live. Start a packet capture session in Packet Analyzer to inspect per-packet protocol metadata.`}
              </p>
            </div>
          </div>

          {status.interface_details && (
            <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-300 bg-navy-900/70 border border-slate-800 rounded-lg px-3.5 py-2">
              <div>
                <span className="text-slate-500">IPv4: </span>
                <span>{status.interface_details.ipv4 || '—'}</span>
              </div>
              <div>
                <span className="text-slate-500">Subnet: </span>
                <span>{status.interface_details.subnet || '—'}</span>
              </div>
              <div>
                <span className="text-slate-500">Link: </span>
                <span>
                  {status.interface_details.speed_mbps
                    ? `${status.interface_details.speed_mbps} Mbps`
                    : status.interface_details.is_up
                    ? 'UP'
                    : 'DOWN'}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Primary KPI Grid (All 9 required overview metrics) */}
      {loading && !status ? (
        <StatCardSkeleton count={8} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          <StatCard
            label="Connected Devices"
            value={formatNumber(stats.connected_devices)}
            subtext={`${formatNumber(stats.total_devices)} total discovered`}
            icon={Laptop}
            accent="sky"
            mono
          />
          <StatCard
            label="Packets Captured"
            value={formatNumber(stats.total_packets_captured)}
            subtext={status?.monitoring_active ? 'Live Scapy capture' : 'Stored metadata records'}
            icon={Activity}
            accent="blue"
            mono
          />
          <StatCard
            label="Download Speed"
            value={formatSpeed(stats.download_bps)}
            subtext={`In: ${formatBytes(stats.incoming_bytes_total)}`}
            icon={Download}
            accent="emerald"
            mono
          />
          <StatCard
            label="Upload Speed"
            value={formatSpeed(stats.upload_bps)}
            subtext={`Out: ${formatBytes(stats.outgoing_bytes_total)}`}
            icon={Upload}
            accent="sky"
            mono
          />
          <StatCard
            label="Security Alerts"
            value={formatNumber(stats.total_security_alerts)}
            subtext={`${formatNumber(stats.open_security_alerts)} open alerts`}
            icon={ShieldAlert}
            accent={stats.open_security_alerts > 0 ? 'red' : 'emerald'}
            mono
          />
        </div>
      )}

      {/* Secondary OS Interface Counter Row */}
      {status && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Incoming Traffic (NIC)"
            value={formatBytes(stats.incoming_bytes_total)}
            subtext="Cumulative psutil counter"
            icon={ArrowDownLeft}
            accent="emerald"
            mono
          />
          <StatCard
            label="Outgoing Traffic (NIC)"
            value={formatBytes(stats.outgoing_bytes_total)}
            subtext="Cumulative psutil counter"
            icon={ArrowUpRight}
            accent="blue"
            mono
          />
          <StatCard
            label="Active Interface"
            value={status.active_interface || 'None'}
            subtext={`${status.interfaces_count || 0} interfaces detected`}
            icon={Network}
            accent="slate"
          />
          <StatCard
            label="Network Availability"
            value={status.availability || 'Unknown'}
            subtext={`${Number(stats.packets_per_sec || 0).toFixed(1)} NIC pkt/s`}
            icon={Gauge}
            accent={status.health === 'healthy' ? 'emerald' : 'amber'}
          />
        </div>
      )}

      {/* Charts Row 1: Traffic Graph + Protocol Pie */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <ChartCard
          title="Real-Time Incoming & Outgoing Traffic"
          subtitle="Interface throughput in KB/s sampled from psutil (last 15 min)"
          className="xl:col-span-2"
        >
          {points.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="Collecting traffic telemetry..."
              description="Live interface traffic samples are recorded automatically every 2.5 seconds."
              compact
            />
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dlGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.28} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="ulGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="timeLabel" stroke="#64748b" tick={{ fontSize: 11 }} minTickGap={24} />
                  <YAxis stroke="#64748b" tick={{ fontSize: 11 }} unit=" KB/s" width={68} />
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
                    name="Incoming (Download)"
                    stroke="#10b981"
                    strokeWidth={2}
                    fill="url(#dlGrad)"
                  />
                  <Area
                    type="monotone"
                    dataKey="upload_kbps"
                    name="Outgoing (Upload)"
                    stroke="#38bdf8"
                    strokeWidth={2}
                    fill="url(#ulGrad)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="Protocol Distribution"
          subtitle="Breakdown of captured packet metadata"
        >
          {protocols.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="No captured packets yet"
              description="Start a packet capture session in Packet Analyzer (or enable Demo Mode) to view protocol distribution."
              compact
              action={
                <button
                  type="button"
                  onClick={() => navigate('/packets')}
                  className="ns-btn-secondary !text-xs"
                >
                  Open Packet Analyzer
                </button>
              }
            />
          ) : (
            <div className="flex flex-col h-64">
              <div className="flex-1 min-h-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={protocols}
                      dataKey="count"
                      nameKey="protocol"
                      cx="50%"
                      cy="50%"
                      innerRadius={48}
                      outerRadius={76}
                      paddingAngle={2}
                    >
                      {protocols.map((entry) => (
                        <Cell key={entry.protocol} fill={getProtocolColor(entry.protocol)} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#0c1322',
                        border: '1px solid #1e293b',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-slate-800/80">
                {protocols.slice(0, 6).map((p) => (
                  <div key={p.protocol} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 text-slate-300">
                      <span
                        className="w-2.5 h-2.5 rounded-sm"
                        style={{ backgroundColor: getProtocolColor(p.protocol) }}
                      />
                      {p.protocol}
                    </span>
                    <span className="font-mono text-slate-400">{p.percentage}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </ChartCard>
      </div>

      {/* Charts Row 2: Device Bandwidth + Recent Alerts & Timeline */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <ChartCard
          title="Device-Wise Bandwidth Usage"
          subtitle="Total bytes observed per discovered local host"
        >
          {topDevices.length === 0 ? (
            <EmptyState
              icon={Laptop}
              title="No device traffic recorded"
              description="Run Network Discovery and capture packets to attribute bandwidth to individual local devices."
              compact
            />
          ) : (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topDevices.map((d) => ({
                    name: d.ip_address,
                    kb: Math.round(d.total_bytes / 1024),
                  }))}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 10, bottom: 4 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" horizontal={false} />
                  <XAxis type="number" stroke="#64748b" tick={{ fontSize: 11 }} unit=" KB" />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke="#94a3b8"
                    tick={{ fontSize: 11, fontFamily: 'JetBrains Mono' }}
                    width={100}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#0c1322',
                      border: '1px solid #1e293b',
                      borderRadius: '8px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="kb" name="Traffic (KB)" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="Recent Security Events"
          subtitle="Latest rule-based anomaly notifications"
          action={
            <button
              type="button"
              onClick={() => navigate('/security')}
              className="text-xs text-sky-400 hover:text-sky-300"
            >
              Security Center →
            </button>
          }
        >
          {recentAlerts.length === 0 ? (
            <EmptyState
              icon={ShieldAlert}
              title="No security alerts triggered"
              description="All monitored traffic is within configured baseline detection thresholds."
              compact
            />
          ) : (
            <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
              {recentAlerts.slice(0, 5).map((a) => (
                <div
                  key={a.id}
                  onClick={() => navigate('/security')}
                  className="cursor-pointer rounded-lg border border-slate-800 bg-navy-900/70 hover:border-slate-700 p-3 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge label={a.severity} variant={a.severity} />
                    <span className="text-[11px] font-mono text-slate-400">
                      {formatTime(a.detected_at)}
                    </span>
                  </div>
                  <div className="mt-1.5 text-xs font-medium text-slate-200 truncate">
                    {a.title}
                  </div>
                  <div className="mt-0.5 text-[11px] font-mono text-slate-400">
                    {a.src_ip || 'N/A'} {a.dst_ip ? `→ ${a.dst_ip}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="Recent Activity Timeline"
          subtitle="Sessions, diagnostics, and alert events"
        >
          {activity.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="No recent activity yet"
              description="Run a ping test, discover local devices, or start packet capture to see operational history."
              compact
            />
          ) : (
            <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
              {activity.map((item, idx) => (
                <div key={idx} className="flex items-start gap-3">
                  <div
                    className={`mt-1 w-2 h-2 rounded-full shrink-0 ${
                      item.type === 'alert'
                        ? 'bg-red-400'
                        : item.type === 'diagnostic'
                        ? 'bg-emerald-400'
                        : 'bg-sky-400'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-slate-200 truncate">
                      {item.title}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">{item.subtitle}</div>
                    <div className="text-[10px] font-mono text-slate-500 mt-0.5">
                      {formatDateTime(item.timestamp)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ChartCard>
      </div>
    </div>
  );
}

