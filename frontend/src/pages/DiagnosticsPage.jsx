import React, { useState } from 'react';
import {
  Activity,
  Globe,
  Loader2,
  Play,
  Route,
  Terminal,
  Wifi,
} from 'lucide-react';
import DataTable from '../components/DataTable';
import ErrorBanner from '../components/ErrorBanner';
import StatusBadge from '../components/StatusBadge';
import { usePolling } from '../hooks/usePolling';
import { api } from '../services/api';
import { formatDateTime } from '../utils/formatters';

const TOOLS = [
  { key: 'ping', label: 'Ping Test', icon: Activity },
  { key: 'traceroute', label: 'Traceroute', icon: Route },
  { key: 'dns', label: 'DNS Lookup', icon: Globe },
  { key: 'connectivity', label: 'Connectivity Test', icon: Wifi },
];

export default function DiagnosticsPage() {
  const [activeTool, setActiveTool] = useState('ping');
  const [pingTarget, setPingTarget] = useState('8.8.8.8');
  const [pingCount, setPingCount] = useState(4);
  const [traceTarget, setTraceTarget] = useState('1.1.1.1');
  const [traceMaxHops, setTraceMaxHops] = useState(12);
  const [dnsDomain, setDnsDomain] = useState('google.com');
  const [connTargets, setConnTargets] = useState('8.8.8.8, 1.1.1.1, google.com');

  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [latestResult, setLatestResult] = useState(null);

  const { data: historyData, refresh: refreshHistory } = usePolling(
    () => api.getDiagnosticsHistory('', 25),
    10000,
    true
  );

  const history = historyData?.history || [];

  const runTool = async (e) => {
    e.preventDefault();
    setError(null);
    setRunning(true);
    try {
      let res;
      if (activeTool === 'ping') {
        res = await api.runPing(pingTarget.trim(), Number(pingCount));
      } else if (activeTool === 'traceroute') {
        res = await api.runTraceroute(traceTarget.trim(), Number(traceMaxHops));
      } else if (activeTool === 'dns') {
        res = await api.runDnsLookup(dnsDomain.trim());
      } else {
        const list = connTargets
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean);
        res = await api.runConnectivityTest(list.length > 0 ? list : null);
      }
      setLatestResult(res);
      refreshHistory();
    } catch (err) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-100">Network Diagnostics</h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Safe interactive troubleshooting utilities using subprocess argument arrays and Python sockets.
        </p>
      </div>

      {/* Tool Selector Tabs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {TOOLS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setActiveTool(key);
              setError(null);
            }}
            className={`ns-card p-3.5 flex items-center gap-3 text-left transition-colors ${
              activeTool === key
                ? 'border-sky-500/60 bg-sky-500/10 text-sky-200'
                : 'text-slate-300 hover:border-slate-700'
            }`}
          >
            <div
              className={`p-2 rounded-lg border ${
                activeTool === key
                  ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                  : 'bg-slate-800 border-slate-700 text-slate-400'
              }`}
            >
              <Icon className="w-4 h-4" />
            </div>
            <span className="text-sm font-medium">{label}</span>
          </button>
        ))}
      </div>

      <ErrorBanner message={error} />

      {/* Tool Input Form */}
      <form onSubmit={runTool} className="ns-card p-5 space-y-4">
        {activeTool === 'ping' && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Target Hostname or IP Address
              </label>
              <input
                type="text"
                required
                value={pingTarget}
                onChange={(e) => setPingTarget(e.target.value)}
                placeholder="e.g. 8.8.8.8 or google.com"
                className="ns-input w-full font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Echo Count (1–8)
              </label>
              <input
                type="number"
                min="1"
                max="8"
                value={pingCount}
                onChange={(e) => setPingCount(e.target.value)}
                className="ns-input w-full font-mono"
              />
            </div>
            <button type="submit" disabled={running} className="ns-btn-primary">
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {running ? 'Pinging...' : 'Run Ping Test'}
            </button>
          </div>
        )}

        {activeTool === 'traceroute' && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="md:col-span-2">
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Destination IP or Hostname
              </label>
              <input
                type="text"
                required
                value={traceTarget}
                onChange={(e) => setTraceTarget(e.target.value)}
                placeholder="e.g. 1.1.1.1 or example.com"
                className="ns-input w-full font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Max Hops (1–25)
              </label>
              <input
                type="number"
                min="1"
                max="25"
                value={traceMaxHops}
                onChange={(e) => setTraceMaxHops(e.target.value)}
                className="ns-input w-full font-mono"
              />
            </div>
            <button type="submit" disabled={running} className="ns-btn-primary">
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {running ? 'Tracing...' : 'Run Traceroute'}
            </button>
          </div>
        )}

        {activeTool === 'dns' && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Domain Name
              </label>
              <input
                type="text"
                required
                value={dnsDomain}
                onChange={(e) => setDnsDomain(e.target.value)}
                placeholder="e.g. github.com"
                className="ns-input w-full font-mono"
              />
            </div>
            <button type="submit" disabled={running} className="ns-btn-primary">
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {running ? 'Resolving...' : 'Resolve DNS'}
            </button>
          </div>
        )}

        {activeTool === 'connectivity' && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div className="md:col-span-3">
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Connectivity Targets (comma-separated)
              </label>
              <input
                type="text"
                value={connTargets}
                onChange={(e) => setConnTargets(e.target.value)}
                placeholder="8.8.8.8, 1.1.1.1, google.com"
                className="ns-input w-full font-mono"
              />
            </div>
            <button type="submit" disabled={running} className="ns-btn-primary">
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              {running ? 'Checking...' : 'Check Connectivity'}
            </button>
          </div>
        )}
      </form>

      {/* Latest Result Output */}
      {latestResult && (
        <div className="ns-card p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-800">
            <div className="flex items-center gap-2.5">
              <Terminal className="w-4 h-4 text-sky-400" />
              <h3 className="text-sm font-semibold text-slate-100 uppercase">
                {latestResult.test_type} Result — {latestResult.target}
              </h3>
              <StatusBadge label={latestResult.status} variant={latestResult.status} dot />
            </div>
            <span className="text-xs font-mono text-slate-400">
              {formatDateTime(latestResult.executed_at)}
            </span>
          </div>

          {/* Ping Visual Summary */}
          {latestResult.test_type === 'ping' && latestResult.result && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-navy-900 border border-slate-800">
                  <div className="text-slate-400">Reachability</div>
                  <div className="mt-1.5">
                    <StatusBadge
                      label={latestResult.result.reachable ? 'Reachable' : 'Unreachable'}
                      variant={latestResult.result.reachable ? 'online' : 'failed'}
                      dot
                    />
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-navy-900 border border-slate-800">
                  <div className="text-slate-400">Avg Response Time</div>
                  <div className="mt-1 font-mono text-base font-semibold text-sky-300">
                    {latestResult.result.avg_rtt_ms !== null
                      ? `${latestResult.result.avg_rtt_ms} ms`
                      : '—'}
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-navy-900 border border-slate-800">
                  <div className="text-slate-400">Packet Loss</div>
                  <div className="mt-1 font-mono text-base font-semibold text-slate-100">
                    {latestResult.result.packet_loss_percent}%
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-navy-900 border border-slate-800">
                  <div className="text-slate-400">Min / Max RTT</div>
                  <div className="mt-1 font-mono text-sm text-slate-200">
                    {latestResult.result.min_rtt_ms ?? '—'} / {latestResult.result.max_rtt_ms ?? '—'} ms
                  </div>
                </div>
              </div>
              {latestResult.result.raw_output && (
                <pre className="p-3.5 rounded-lg bg-navy-950 border border-slate-800 text-xs font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap">
                  {latestResult.result.raw_output}
                </pre>
              )}
            </div>
          )}

          {/* Traceroute Visual Summary */}
          {latestResult.test_type === 'traceroute' && latestResult.result && (
            <div className="space-y-4">
              <DataTable
                compact
                keyField="hop"
                rows={latestResult.result.hops || []}
                columns={[
                  { key: 'hop', label: 'Hop #', mono: true },
                  { key: 'ip', label: 'Hop IP Address', mono: true },
                  {
                    key: 'rtt_ms',
                    label: 'Avg RTT',
                    mono: true,
                    render: (r) => (r.rtt_ms !== null ? `${r.rtt_ms} ms` : 'Timeout (*)'),
                  },
                  {
                    key: 'status',
                    label: 'Status',
                    render: (r) => (
                      <StatusBadge
                        label={r.status === 'timeout' ? 'Timeout' : 'Reached'}
                        variant={r.status === 'timeout' ? 'timeout' : 'success'}
                      />
                    ),
                  },
                ]}
                emptyTitle="No hops returned"
                emptyDescription="The destination or intermediate routers may block ICMP/traceroute probes."
              />
              {latestResult.result.raw_output && (
                <pre className="p-3.5 rounded-lg bg-navy-950 border border-slate-800 text-xs font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap">
                  {latestResult.result.raw_output}
                </pre>
              )}
            </div>
          )}

          {/* DNS Visual Summary */}
          {latestResult.test_type === 'dns' && latestResult.result && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div className="p-3.5 rounded-lg bg-navy-900 border border-slate-800">
                <div className="text-slate-400">Resolution Status</div>
                <div className="mt-1.5 flex items-center gap-2">
                  <StatusBadge
                    label={latestResult.result.resolved ? 'Resolved' : 'Failed'}
                    variant={latestResult.result.resolved ? 'success' : 'failed'}
                  />
                  <span className="font-mono text-slate-400">
                    {latestResult.result.resolution_time_ms} ms
                  </span>
                </div>
                {latestResult.result.canonical_name && (
                  <div className="mt-2 font-mono text-slate-300">
                    CNAME: {latestResult.result.canonical_name}
                  </div>
                )}
              </div>
              <div className="p-3.5 rounded-lg bg-navy-900 border border-slate-800">
                <div className="text-slate-400 mb-1.5">IPv4 Addresses (A Records)</div>
                {(latestResult.result.ipv4_addresses || []).length > 0 ? (
                  <ul className="space-y-1 font-mono text-sky-300">
                    {latestResult.result.ipv4_addresses.map((ip) => (
                      <li key={ip}>{ip}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-slate-500">None</span>
                )}
              </div>
              <div className="p-3.5 rounded-lg bg-navy-900 border border-slate-800">
                <div className="text-slate-400 mb-1.5">IPv6 Addresses (AAAA Records)</div>
                {(latestResult.result.ipv6_addresses || []).length > 0 ? (
                  <ul className="space-y-1 font-mono text-slate-300 break-all">
                    {latestResult.result.ipv6_addresses.map((ip) => (
                      <li key={ip}>{ip}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-slate-500">None</span>
                )}
              </div>
            </div>
          )}

          {/* Connectivity Test Visual Summary */}
          {latestResult.test_type === 'connectivity' && latestResult.result && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400">Overall Internet Status:</span>
                <StatusBadge
                  label={latestResult.result.overall_status?.toUpperCase()}
                  variant={latestResult.result.overall_status}
                  dot
                />
              </div>
              <DataTable
                compact
                keyField="target"
                rows={latestResult.result.checks || []}
                columns={[
                  { key: 'target', label: 'Target', mono: true },
                  { key: 'port', label: 'Port', mono: true },
                  {
                    key: 'reachable',
                    label: 'Status',
                    render: (r) => (
                      <StatusBadge
                        label={r.reachable ? 'Reachable' : 'Unreachable'}
                        variant={r.reachable ? 'online' : 'failed'}
                        dot
                      />
                    ),
                  },
                  {
                    key: 'latency_ms',
                    label: 'TCP Handshake Latency',
                    mono: true,
                    render: (r) => (r.latency_ms !== null ? `${r.latency_ms} ms` : r.error || '—'),
                  },
                ]}
              />
            </div>
          )}
        </div>
      )}

      {/* Diagnostics History Table */}
      <div className="ns-card overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-800">
          <h3 className="text-sm font-semibold text-slate-100">
            Diagnostics Execution History ({history.length})
          </h3>
        </div>
        <DataTable
          compact
          keyField="id"
          rows={history}
          onRowClick={(row) => setLatestResult(row)}
          selectedRowKey={latestResult?.id ?? null}
          columns={[
            {
              key: 'test_type',
              label: 'Utility',
              render: (r) => (
                <span className="uppercase text-xs font-semibold text-sky-300">{r.test_type}</span>
              ),
            },
            { key: 'target', label: 'Target', mono: true },
            {
              key: 'status',
              label: 'Status',
              render: (r) => <StatusBadge label={r.status} variant={r.status} dot />,
            },
            { key: 'summary', label: 'Summary' },
            {
              key: 'executed_at',
              label: 'Executed At',
              mono: true,
              render: (r) => <span className="text-slate-400">{formatDateTime(r.executed_at)}</span>,
            },
          ]}
          emptyIcon={Terminal}
          emptyTitle="No diagnostics run yet"
          emptyDescription="Execute a Ping, Traceroute, DNS Lookup, or Connectivity test above to log results."
        />
      </div>
    </div>
  );
}

