import React, { useEffect } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import {
  Activity,
  Download,
  FileText,
  Info,
  Laptop,
  Network,
  Play,
  Radar,
  ShieldAlert,
  Square,
  Terminal,
  TrendingUp,
} from 'lucide-react';
import {
  Area,
  AreaChart,
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
  const { darkMode } = useOutletContext() || {};

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
  const topDevices = (protoData?.top_devices || []).slice(0, 10);
  const maxDeviceBytes = Math.max(...topDevices.map((d) => d.total_bytes || 0), 1);
  const recentAlerts = secSummary?.recent_alerts || [];
  const activity = status?.recent_activity || [];

  const peakDownload = points.reduce((m, p) => Math.max(m, p.download_kbps || 0), 0);
  const peakUpload = points.reduce((m, p) => Math.max(m, p.upload_kbps || 0), 0);

  const tooltipStyle = {
    backgroundColor: darkMode ? '#101d28' : '#ffffff',
    border: darkMode ? '1px solid #243d52' : '1px solid #cde0ea',
    borderRadius: '12px',
    fontSize: '12px',
    color: darkMode ? '#e2e8f0' : '#1a3342',
    boxShadow: '0 6px 18px rgba(26,56,72,0.12)',
  };

  return (
    <div className="space-y-5">
      <ErrorBanner message={error} onRetry={refreshStatus} />

      {/* Top White "Overview" Container Card (Matches Reference Top Section) */}
      <section className="ns-card p-5">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-base font-bold text-[#1a3342] dark:text-slate-100">Overview</h1>
            {status && (
              <>
                <StatusBadge label={status.availability} variant={status.health} dot />
                <StatusBadge
                  label={status.monitoring_active ? 'Capture Active' : 'Telemetry Live'}
                  variant={status.monitoring_active ? 'active' : 'low'}
                />
              </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/discovery')}
              className="ns-btn-secondary !py-1.5 !px-3 !text-xs"
            >
              <Radar className="w-3.5 h-3.5" />
              Discover
            </button>
            <button
              type="button"
              onClick={() => navigate('/packets')}
              className="ns-btn-primary !py-1.5 !px-3 !text-xs"
            >
              {status?.monitoring_active ? (
                <>
                  <Square className="w-3.5 h-3.5" />
                  Live Capture
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
              className="ns-btn-secondary !py-1.5 !px-3 !text-xs"
            >
              <Terminal className="w-3.5 h-3.5" />
              Diagnostics
            </button>
            <button
              type="button"
              onClick={() => navigate('/reports')}
              className="ns-btn-secondary !py-1.5 !px-3 !text-xs"
            >
              <FileText className="w-3.5 h-3.5" />
              Reports
            </button>
          </div>
        </div>

        {loading && !status ? (
          <StatCardSkeleton count={4} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
            {/* KPI 1: Connected Devices */}
            <div className="bg-[#f6fafc] dark:bg-navy-900/80 border border-[#d6e6ef] dark:border-slate-800 rounded-xl p-4 flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-[#d4f3ea] dark:bg-emerald-500/15 border border-[#bce8db] dark:border-emerald-500/30 text-[#1b6b57] dark:text-emerald-300 flex items-center justify-center shrink-0">
                <Laptop className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-2xl font-bold text-[#1a3342] dark:text-slate-100 leading-tight font-mono">
                  {formatNumber(stats.connected_devices)}
                </div>
                <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Connected Devices
                </div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500">
                  {formatNumber(stats.total_devices)} total discovered
                </div>
              </div>
            </div>

            {/* KPI 2: Packets Captured */}
            <div className="bg-[#f6fafc] dark:bg-navy-900/80 border border-[#d6e6ef] dark:border-slate-800 rounded-xl p-4 flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-[#d8f3e5] dark:bg-sky-500/15 border border-[#bde6d1] dark:border-sky-500/30 text-[#1b6b46] dark:text-sky-300 flex items-center justify-center shrink-0">
                <Activity className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-2xl font-bold text-[#1a3342] dark:text-slate-100 leading-tight font-mono">
                  {formatNumber(stats.total_packets_captured)}
                </div>
                <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Packets Captured
                </div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500">
                  {Number(stats.packets_per_sec || 0).toFixed(1)} NIC pkt/s
                </div>
              </div>
            </div>

            {/* KPI 3: Live Speed */}
            <div className="bg-[#f6fafc] dark:bg-navy-900/80 border border-[#d6e6ef] dark:border-slate-800 rounded-xl p-4 flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-[#d4f1ee] dark:bg-teal-500/15 border border-[#b8e5e0] dark:border-teal-500/30 text-[#1a6864] dark:text-teal-300 flex items-center justify-center shrink-0">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-xl font-bold text-[#1a3342] dark:text-slate-100 leading-tight font-mono truncate">
                  {formatSpeed(stats.download_bps)}
                </div>
                <div className="text-xs font-medium text-slate-600 dark:text-slate-400">
                  Download Speed
                </div>
                <div className="text-[11px] text-slate-400 dark:text-slate-500 font-mono truncate">
                  Up: {formatSpeed(stats.upload_bps)}
                </div>
              </div>
            </div>

            {/* KPI 4: Security Alerts (Signature Peach Accent Card with 'i' badge) */}
            <div
              onClick={() => navigate('/security')}
              className="relative cursor-pointer bg-[#fdf5f1] dark:bg-red-950/25 border border-[#e7bfb0] dark:border-red-500/35 rounded-xl p-4 flex items-center gap-3.5 hover:border-[#d79b86] transition-colors"
            >
              <div className="w-12 h-12 rounded-xl bg-[#f6dfd6] dark:bg-red-500/15 border border-[#e8bfb0] dark:border-red-500/30 text-[#a53e2b] dark:text-red-300 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="text-2xl font-bold text-[#1a3342] dark:text-slate-100 leading-tight font-mono">
                  {formatNumber(stats.total_security_alerts)}
                </div>
                <div className="text-xs font-medium text-[#7e3b2b] dark:text-red-300">
                  Security Alerts
                </div>
                <div className="text-[11px] text-[#a35a46] dark:text-red-400/80">
                  {formatNumber(stats.open_security_alerts)} open requiring review
                </div>
              </div>
              <span
                title="Click to inspect rule-based anomaly alerts"
                className="absolute bottom-2 right-2 w-5 h-5 rounded-full bg-[#f5ddd2] dark:bg-red-500/20 text-[#8f3f2b] dark:text-red-300 flex items-center justify-center"
              >
                <Info className="w-3 h-3" />
              </span>
            </div>
          </div>
        )}
      </section>

      {/* Main 12-Column Reference Bento Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
        {/* Left 8 Columns: Top (Interface Card + Protocol Donut) + Bottom (Traffic Spline Area Chart) */}
        <div className="xl:col-span-8 flex flex-col gap-5">
          {/* Top Sub-row */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-5">
            {/* Compact Metric Card (mirrors "No of users") */}
            <div className="md:col-span-4 ns-card p-5 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <h3 className="text-[15px] font-bold text-[#1a3342] dark:text-slate-100">
                  Active Interface
                </h3>
                <StatusBadge
                  label={status?.interface_details?.is_up ? 'UP' : 'DOWN'}
                  variant={status?.interface_details?.is_up ? 'online' : 'offline'}
                  dot
                />
              </div>

              <div className="my-5 flex flex-col items-center text-center">
                <div className="w-14 h-14 rounded-2xl bg-[#dcebf2] dark:bg-navy-800 border border-[#bfd7e4] dark:border-slate-700 text-[#244a5c] dark:text-sky-300 flex items-center justify-center">
                  <Network className="w-7 h-7" />
                </div>
                <div
                  className="mt-3 text-lg font-bold text-[#1a3342] dark:text-slate-100 truncate max-w-full"
                  title={status?.active_interface}
                >
                  {status?.active_interface || 'None'}
                </div>
                <div className="text-xs font-mono text-slate-500 dark:text-slate-400 mt-0.5">
                  {status?.interface_details?.ipv4 || 'No IPv4'}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-3 border-t border-[#e4eff5] dark:border-slate-800 text-xs">
                <div className="bg-[#f4f9fc] dark:bg-navy-900 rounded-lg p-2">
                  <div className="text-[10px] text-slate-400 uppercase">Incoming</div>
                  <div className="font-mono font-semibold text-[#1a3342] dark:text-slate-200 mt-0.5 truncate">
                    {formatBytes(stats.incoming_bytes_total)}
                  </div>
                </div>
                <div className="bg-[#f4f9fc] dark:bg-navy-900 rounded-lg p-2">
                  <div className="text-[10px] text-slate-400 uppercase">Outgoing</div>
                  <div className="font-mono font-semibold text-[#1a3342] dark:text-slate-200 mt-0.5 truncate">
                    {formatBytes(stats.outgoing_bytes_total)}
                  </div>
                </div>
              </div>
            </div>

            {/* Protocol Distribution Pie Card (mirrors "Inventory Values") */}
            <ChartCard
              title="Protocol Distribution"
              subtitle="Captured packet share by protocol"
              className="md:col-span-8"
            >
              {protocols.length === 0 ? (
                <EmptyState
                  icon={Activity}
                  title="No captured packets yet"
                  description="Start capture in Packet Analyzer or click Demo Mode in the sidebar to see live protocol breakdown."
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
                <div className="grid grid-cols-1 sm:grid-cols-12 items-center gap-4 h-52">
                  <div className="sm:col-span-7 h-52">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={protocols}
                          dataKey="count"
                          nameKey="protocol"
                          cx="50%"
                          cy="50%"
                          outerRadius={78}
                          paddingAngle={3}
                          stroke={darkMode ? '#152533' : '#ffffff'}
                          strokeWidth={3}
                        >
                          {protocols.map((entry) => (
                            <Cell key={entry.protocol} fill={getProtocolColor(entry.protocol)} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={tooltipStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="sm:col-span-5 space-y-2.5">
                    {protocols.slice(0, 6).map((p) => (
                      <div key={p.protocol} className="flex items-center justify-between gap-2 text-xs">
                        <span className="flex items-center gap-2.5 text-slate-700 dark:text-slate-300 font-medium">
                          <span
                            className="w-4 h-4 rounded-md shrink-0"
                            style={{ backgroundColor: getProtocolColor(p.protocol) }}
                          />
                          {p.protocol}
                        </span>
                        <span className="font-mono font-semibold text-[#1a3342] dark:text-slate-200">
                          {p.percentage}%
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </ChartCard>
          </div>

          {/* Bottom Wide Spline Area Chart (mirrors "Expense vs Profit") */}
          <ChartCard
            title="Incoming vs Outgoing Traffic"
            subtitle="Live interface throughput (KB/s) sampled via psutil"
            action={
              <div className="flex items-center gap-2 text-[11px]">
                <span className="px-2.5 py-1 rounded-md bg-[#2a6f5b] text-white font-medium">
                  Peak In: {peakDownload.toFixed(1)} KB/s
                </span>
                <span className="px-2.5 py-1 rounded-md bg-[#c96e4b] text-white font-medium">
                  Peak Out: {peakUpload.toFixed(1)} KB/s
                </span>
              </div>
            }
          >
            {points.length === 0 ? (
              <EmptyState
                icon={Download}
                title="Collecting live traffic samples..."
                description="OS interface throughput samples are automatically recorded every 2.5 seconds."
                compact
              />
            ) : (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={points} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="mintIn" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3c9a7c" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#3c9a7c" stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="peachOut" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#d98a6c" stopOpacity={0.28} />
                        <stop offset="95%" stopColor="#d98a6c" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke={darkMode ? '#1e3446' : '#e4eff5'}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="timeLabel"
                      stroke={darkMode ? '#64748b' : '#7b94a3'}
                      tick={{ fontSize: 11 }}
                      minTickGap={26}
                    />
                    <YAxis
                      stroke={darkMode ? '#64748b' : '#7b94a3'}
                      tick={{ fontSize: 11 }}
                      unit=" KB/s"
                      width={68}
                    />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Area
                      type="monotone"
                      dataKey="download_kbps"
                      name="Incoming (Download)"
                      stroke="#2a6f5b"
                      strokeWidth={2.2}
                      fill="url(#mintIn)"
                    />
                    <Area
                      type="monotone"
                      dataKey="upload_kbps"
                      name="Outgoing (Upload)"
                      stroke="#c96e4b"
                      strokeWidth={2.2}
                      fill="url(#peachOut)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </ChartCard>
        </div>

        {/* Right 4 Columns: Tall Horizontal Capsule Bars Card (mirrors "Top 10 Stores by sales") */}
        <div className="xl:col-span-4 ns-card p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-[15px] font-bold text-[#1a3342] dark:text-slate-100">
                Top Devices by Traffic
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Observed local hosts ranked by byte volume
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/discovery')}
              className="text-xs font-medium text-[#244a5c] dark:text-sky-400 hover:underline"
            >
              Manage →
            </button>
          </div>

          {topDevices.length === 0 ? (
            <div className="flex-1 flex items-center justify-center">
              <EmptyState
                icon={Laptop}
                title="No devices discovered yet"
                description="Run Network Discovery or enable Demo Mode to rank top bandwidth hosts."
                compact
              />
            </div>
          ) : (
            <div className="space-y-3.5 flex-1">
              {topDevices.map((d) => {
                const pct =
                  d.total_bytes > 0
                    ? Math.max(8, Math.round((d.total_bytes / maxDeviceBytes) * 100))
                    : 6;
                return (
                  <div key={d.ip_address} className="grid grid-cols-12 items-center gap-2.5 text-xs">
                    <div
                      className="col-span-4 truncate font-mono text-slate-600 dark:text-slate-300"
                      title={`${d.hostname || d.ip_address} (${d.ip_address})`}
                    >
                      {d.ip_address}
                    </div>
                    <div className="col-span-5">
                      <div className="h-3 rounded-full bg-[#eaf3f8] dark:bg-navy-900 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-[#486d7e] dark:bg-sky-500 transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                    <div className="col-span-3 text-right font-mono font-semibold text-[#1a3342] dark:text-slate-200 whitespace-nowrap">
                      {formatBytes(d.total_bytes, 1)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Active Session Summary Footer inside Right Card */}
          <div className="mt-5 pt-4 border-t border-[#e4eff5] dark:border-slate-800">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Monitoring Session
            </div>
            <div className="rounded-xl bg-[#f4f9fc] dark:bg-navy-900 border border-[#d6e6ef] dark:border-slate-800 p-3 text-xs text-slate-600 dark:text-slate-300">
              {status?.monitoring_active && status?.active_session ? (
                <span>
                  Active session <strong>#{status.active_session.id}</strong> on{' '}
                  <code className="font-mono">{status.active_session.interface_name}</code>
                </span>
              ) : (
                <span>
                  NIC telemetry active on{' '}
                  <strong className="font-mono">{status?.active_interface || 'N/A'}</strong>. No
                  live Scapy capture session running.
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Row: Recent Security Events & Activity Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard
          title="Recent Security Events"
          subtitle="Latest rule-based anomaly indicators"
          action={
            <button
              type="button"
              onClick={() => navigate('/security')}
              className="text-xs font-medium text-[#244a5c] dark:text-sky-400 hover:underline"
            >
              Security Center →
            </button>
          }
        >
          {recentAlerts.length === 0 ? (
            <EmptyState
              icon={ShieldAlert}
              title="No security alerts triggered"
              description="All monitored traffic is currently within configured thresholds."
              compact
            />
          ) : (
            <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
              {recentAlerts.slice(0, 5).map((a) => (
                <div
                  key={a.id}
                  onClick={() => navigate('/security')}
                  className="cursor-pointer rounded-xl border border-[#dceaf2] dark:border-slate-800 bg-[#f6fafc] dark:bg-navy-900/70 hover:border-[#b9d4e3] p-3 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <StatusBadge label={a.severity} variant={a.severity} />
                    <span className="text-[11px] font-mono text-slate-400">
                      {formatTime(a.detected_at)}
                    </span>
                  </div>
                  <div className="mt-1.5 text-xs font-semibold text-[#1a3342] dark:text-slate-200 truncate">
                    {a.title}
                  </div>
                  <div className="mt-0.5 text-[11px] font-mono text-slate-500 dark:text-slate-400">
                    {a.src_ip || 'N/A'} {a.dst_ip ? `→ ${a.dst_ip}` : ''}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ChartCard>

        <ChartCard
          title="Recent Activity Timeline"
          subtitle="Diagnostics, capture sessions, and alert logs"
        >
          {activity.length === 0 ? (
            <EmptyState
              icon={Activity}
              title="No recent activity yet"
              description="Run a ping test, local network scan, or packet capture to build activity history."
              compact
            />
          ) : (
            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
              {activity.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-start gap-3 pb-2.5 border-b border-[#eaf3f8] dark:border-slate-800/80 last:border-0"
                >
                  <div
                    className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${
                      item.type === 'alert'
                        ? 'bg-[#c95944]'
                        : item.type === 'diagnostic'
                        ? 'bg-[#2a6f5b]'
                        : 'bg-[#486d7e]'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-[#1a3342] dark:text-slate-200 truncate">
                      {item.title}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {item.subtitle}
                    </div>
                    <div className="text-[10px] font-mono text-slate-400 mt-0.5">
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
