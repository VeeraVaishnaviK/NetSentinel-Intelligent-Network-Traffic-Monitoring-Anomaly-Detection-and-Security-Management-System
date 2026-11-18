import React, { useEffect, useState } from 'react';
import {
  Activity,
  Calendar,
  Download,
  FileSpreadsheet,
  FileText,
  Laptop,
  RefreshCw,
  ShieldAlert,
  Terminal,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
import { api } from '../services/api';
import {
  formatBytes,
  formatDateTime,
  formatNumber,
  formatSpeed,
  getProtocolColor,
} from '../utils/formatters';

function toInputDate(dateObj) {
  return dateObj.toISOString().slice(0, 10);
}

export default function ReportsPage() {
  const today = new Date();
  const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [startDate, setStartDate] = useState(toInputDate(sevenDaysAgo));
  const [endDate, setEndDate] = useState(toInputDate(today));
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadReport = async (sDate = startDate, eDate = endDate) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getReportSummary(sDate, eDate);
      setReport(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const applyPreset = (days) => {
    const end = new Date();
    const start = new Date(end.getTime() - days * 24 * 60 * 60 * 1000);
    const s = toInputDate(start);
    const e = toInputDate(end);
    setStartDate(s);
    setEndDate(e);
    loadReport(s, e);
  };

  const summary = report?.summary || {};
  const traffic = report?.traffic_statistics || {};
  const protocols = report?.protocols || [];

  return (
    <div className="space-y-6">
      {/* Header & Export Actions */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">Reports &amp; Analytics</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Generate date-filtered network audit summaries and export professional CSV or PDF reports.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a
            href={api.getCsvExportUrl(startDate, endDate, 'full')}
            className="ns-btn-secondary !py-2 !text-xs"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            Export CSV Report
          </a>
          <a
            href={api.getPdfExportUrl(startDate, endDate)}
            className="ns-btn-primary !py-2 !text-xs"
          >
            <Download className="w-4 h-4" />
            Export PDF Report
          </a>
        </div>
      </div>

      {/* Date Range Controls */}
      <div className="ns-card p-4 flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">
              Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="ns-input !py-1.5 text-xs font-mono"
            />
          </div>
          <div>
            <label className="block text-[11px] font-medium text-slate-400 mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="ns-input !py-1.5 text-xs font-mono"
            />
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={() => loadReport()}
            className="ns-btn-primary !py-1.5 !text-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Generate Preview
          </button>
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <Calendar className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-slate-400 mr-1">Presets:</span>
          {[
            { label: 'Today', days: 0 },
            { label: 'Last 7d', days: 7 },
            { label: 'Last 30d', days: 30 },
          ].map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => applyPreset(p.days)}
              className="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/80 transition-colors"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <ErrorBanner message={error} onRetry={() => loadReport()} />

      {report && (
        <>
          {/* Report Metadata Banner */}
          <div className="ns-card p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2.5">
              <FileText className="w-4 h-4 text-sky-400" />
              <span className="font-semibold text-slate-200">
                NetSentinel Monitoring Period Report
              </span>
              {report.demo_mode_included && <StatusBadge label="Includes Demo Data" variant="demo" />}
            </div>
            <div className="flex flex-wrap items-center gap-4 font-mono text-slate-400">
              <span>Interface: {report.selected_interface}</span>
              <span>
                Period: {startDate} → {endDate}
              </span>
              <span>Generated: {formatDateTime(report.generated_at)}</span>
            </div>
          </div>

          {/* Summary KPIs */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Discovered Devices"
              value={formatNumber(summary.discovered_devices)}
              subtext={`${summary.online_devices || 0} online · ${summary.trusted_devices || 0} trusted`}
              icon={Laptop}
              accent="sky"
              mono
            />
            <StatCard
              label="Packets Captured"
              value={formatNumber(summary.total_packets_captured)}
              subtext={`Metadata volume: ${formatBytes(summary.captured_bytes)}`}
              icon={Activity}
              accent="blue"
              mono
            />
            <StatCard
              label="Security Alerts"
              value={formatNumber(summary.total_alerts)}
              subtext={`${summary.open_alerts || 0} open · ${summary.alerts_by_severity?.High || 0} High`}
              icon={ShieldAlert}
              accent={summary.open_alerts > 0 ? 'red' : 'emerald'}
              mono
            />
            <StatCard
              label="Diagnostics Executed"
              value={formatNumber(summary.diagnostics_run)}
              subtext={`${summary.monitoring_sessions || 0} capture sessions`}
              icon={Terminal}
              accent="emerald"
              mono
            />
          </div>

          {/* Traffic & Protocol Breakdown */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
            <div className="ns-card p-5 space-y-3">
              <h3 className="text-sm font-semibold text-slate-100">
                Traffic Statistics Summary
              </h3>
              <div className="space-y-2.5 text-xs">
                {[
                  ['Telemetry Samples', formatNumber(traffic.samples)],
                  ['Period Incoming (NIC)', formatBytes(traffic.total_recv_bytes)],
                  ['Period Outgoing (NIC)', formatBytes(traffic.total_sent_bytes)],
                  ['Avg Download Speed', formatSpeed(traffic.avg_download_bps)],
                  ['Avg Upload Speed', formatSpeed(traffic.avg_upload_bps)],
                  ['Peak Download Speed', formatSpeed(traffic.peak_download_bps)],
                  ['Peak Upload Speed', formatSpeed(traffic.peak_upload_bps)],
                  ['Avg NIC Packets/Sec', `${traffic.avg_pps || 0} pps`],
                ].map(([label, val]) => (
                  <div
                    key={label}
                    className="flex items-center justify-between py-1.5 border-b border-slate-800/80 last:border-0"
                  >
                    <span className="text-slate-400">{label}</span>
                    <span className="font-mono text-slate-200">{val}</span>
                  </div>
                ))}
              </div>
            </div>

            <ChartCard
              title="Protocol Distribution (Period)"
              subtitle="Captured packet breakdown included in exported PDF & CSV"
              className="xl:col-span-2"
            >
              {protocols.length === 0 ? (
                <EmptyState
                  icon={Activity}
                  title="No captured packets in selected date range"
                  description="Capture network traffic or toggle Demo Mode to populate protocol analytics."
                  compact
                />
              ) : (
                <div className="h-60 w-full">
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
          </div>

          {/* Alerts & Diagnostics Preview Tables */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <div className="ns-card overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-800">
                <h3 className="text-sm font-semibold text-slate-100">
                  Security Alerts in Period ({report.alerts?.length || 0})
                </h3>
              </div>
              <DataTable
                compact
                keyField="id"
                rows={(report.alerts || []).slice(0, 10)}
                columns={[
                  { key: 'alert_code', label: 'Code', mono: true },
                  {
                    key: 'severity',
                    label: 'Severity',
                    render: (r) => <StatusBadge label={r.severity} variant={r.severity} />,
                  },
                  { key: 'title', label: 'Alert Title' },
                  {
                    key: 'status',
                    label: 'Status',
                    render: (r) => <StatusBadge label={r.status} variant={r.status} />,
                  },
                ]}
                emptyTitle="No alerts in this date range"
                emptyDescription="All traffic remained within thresholds during this period."
              />
            </div>

            <div className="ns-card overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-800">
                <h3 className="text-sm font-semibold text-slate-100">
                  Diagnostics Results in Period ({report.diagnostics?.length || 0})
                </h3>
              </div>
              <DataTable
                compact
                keyField="id"
                rows={(report.diagnostics || []).slice(0, 10)}
                columns={[
                  {
                    key: 'test_type',
                    label: 'Test',
                    render: (r) => (
                      <span className="uppercase text-xs font-semibold text-sky-300">
                        {r.test_type}
                      </span>
                    ),
                  },
                  { key: 'target', label: 'Target', mono: true },
                  {
                    key: 'status',
                    label: 'Status',
                    render: (r) => <StatusBadge label={r.status} variant={r.status} dot />,
                  },
                  { key: 'summary', label: 'Summary' },
                ]}
                emptyTitle="No diagnostics in this date range"
                emptyDescription="Run tests in Network Diagnostics to include them in reports."
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

