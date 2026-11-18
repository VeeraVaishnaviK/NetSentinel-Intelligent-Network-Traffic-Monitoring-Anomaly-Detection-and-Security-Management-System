import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  FlaskConical,
  Info,
  Save,
  ShieldAlert,
  ShieldCheck,
  Sliders,
  X,
} from 'lucide-react';
import AlertCard from '../components/AlertCard';
import EmptyState from '../components/EmptyState';
import ErrorBanner from '../components/ErrorBanner';
import StatCard from '../components/StatCard';
import StatusBadge from '../components/StatusBadge';
import { usePolling } from '../hooks/usePolling';
import { api } from '../services/api';
import { formatDateTime, formatNumber } from '../utils/formatters';

export default function SecurityCenterPage() {
  const [severityFilter, setSeverityFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedAlert, setSelectedAlert] = useState(null);
  const [rulesDraft, setRulesDraft] = useState(null);
  const [savingRules, setSavingRules] = useState(false);
  const [testingRule, setTestingRule] = useState('');
  const [feedback, setFeedback] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [activeTab, setActiveTab] = useState('alerts');

  const {
    data: summary,
    error: sumErr,
    refresh: refreshSummary,
  } = usePolling(() => api.getSecuritySummary(), 3500, true);

  const {
    data: alertsRes,
    error: alertsErr,
    refresh: refreshAlerts,
  } = usePolling(
    () => api.getAlerts({ severity: severityFilter, status: statusFilter, limit: 150 }),
    3500,
    true,
    [severityFilter, statusFilter]
  );

  const { data: rulesRes, refresh: refreshRules } = usePolling(
    () => api.getSecurityRules(),
    15000,
    true
  );

  useEffect(() => {
    if (rulesRes?.rules && !rulesDraft) {
      setRulesDraft(structuredClone(rulesRes.rules));
    }
  }, [rulesRes, rulesDraft]);

  useEffect(() => {
    const onDataChange = () => {
      refreshSummary();
      refreshAlerts();
      refreshRules();
    };
    window.addEventListener('netsentinel:data-changed', onDataChange);
    return () => window.removeEventListener('netsentinel:data-changed', onDataChange);
  }, [refreshSummary, refreshAlerts, refreshRules]);

  const alerts = alertsRes?.alerts || [];

  const handleUpdateAlert = async (id, nextStatus) => {
    setActionError(null);
    try {
      await api.updateAlertStatus(id, nextStatus);
      setFeedback(`Alert #${id} marked as ${nextStatus}.`);
      refreshAlerts();
      refreshSummary();
      if (selectedAlert?.id === id) {
        setSelectedAlert((prev) => (prev ? { ...prev, status: nextStatus } : null));
      }
    } catch (err) {
      setActionError(err.message);
    }
  };

  const handleRuleFieldChange = (ruleKey, field, value) => {
    setRulesDraft((prev) => ({
      ...prev,
      [ruleKey]: {
        ...prev[ruleKey],
        [field]: value,
      },
    }));
  };

  const handleSaveRules = async () => {
    if (!rulesDraft) return;
    setSavingRules(true);
    setActionError(null);
    setFeedback(null);
    try {
      const res = await api.updateSecurityRules(rulesDraft);
      setRulesDraft(structuredClone(res.rules));
      setFeedback('Detection rule thresholds saved successfully.');
      refreshSummary();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setSavingRules(false);
    }
  };

  const handleControlledTest = async (ruleType) => {
    setTestingRule(ruleType);
    setActionError(null);
    setFeedback(null);
    try {
      const res = await api.testSecurityRule(ruleType);
      setFeedback(
        `Controlled test for '${ruleType}' executed: ${res.alerts_triggered} alert(s) triggered.`
      );
      setActiveTab('alerts');
      refreshAlerts();
      refreshSummary();
    } catch (err) {
      setActionError(err.message);
    } finally {
      setTestingRule('');
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="ns-page-title">Security Center</h1>
          <p className="ns-page-subtitle">
            Explainable rule-based network anomaly detection, alert triage, and threshold management.
          </p>
        </div>

        <div className="flex items-center gap-1 bg-white dark:bg-navy-900 border border-[#cde0ea] dark:border-slate-800 rounded-xl p-1 shadow-card">
          <button
            type="button"
            onClick={() => setActiveTab('alerts')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'alerts'
                ? 'bg-[#244a5c] dark:bg-sky-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:bg-[#eef6fa] dark:hover:bg-navy-800'
            }`}
          >
            Alerts ({summary?.total_alerts ?? alerts.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('rules')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              activeTab === 'rules'
                ? 'bg-[#244a5c] dark:bg-sky-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:bg-[#eef6fa] dark:hover:bg-navy-800'
            }`}
          >
            Detection Rules ({summary?.active_rules_count ?? 5}/{summary?.total_rules_count ?? 5})
          </button>
        </div>
      </div>

      {/* Academic Disclaimer */}
      <div className="rounded-2xl border border-[#bfdceb] dark:border-sky-500/25 bg-white dark:bg-sky-500/10 px-4 py-3 flex items-start gap-2.5 text-xs text-slate-600 dark:text-sky-200 shadow-card">
        <Info className="w-4 h-4 text-[#244a5c] dark:text-sky-400 shrink-0 mt-0.5" />
        <span>
          <strong className="text-[#1a3342] dark:text-sky-300">Advisory Notice:</strong> NetSentinel
          uses configurable rule-based heuristics to highlight suspicious network patterns for
          investigation. Alerts are indicators only and are not definitive proof of malicious activity.
        </span>
      </div>

      <ErrorBanner
        message={sumErr || alertsErr || actionError}
        onRetry={refreshAlerts}
        onDismiss={() => setActionError(null)}
      />

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

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Open Alerts"
          value={formatNumber(summary?.open_alerts || 0)}
          subtext={`Critical: ${summary?.open_by_severity?.Critical || 0} · High: ${summary?.open_by_severity?.High || 0}`}
          icon={ShieldAlert}
          accent={(summary?.open_alerts || 0) > 0 ? 'peach' : 'emerald'}
          variant={(summary?.open_alerts || 0) > 0 ? 'alert' : 'default'}
          mono
        />
        <StatCard
          label="Acknowledged"
          value={formatNumber(summary?.acknowledged_alerts || 0)}
          subtext="Under administrator review"
          icon={Info}
          accent="amber"
          mono
        />
        <StatCard
          label="Resolved"
          value={formatNumber(summary?.resolved_alerts || 0)}
          subtext={`Total logged: ${formatNumber(summary?.total_alerts || 0)}`}
          icon={ShieldCheck}
          accent="mint"
          mono
        />
        <StatCard
          label="Active Rules"
          value={`${summary?.active_rules_count ?? 5} / ${summary?.total_rules_count ?? 5}`}
          subtext="Rule-based anomaly engine"
          icon={Sliders}
          accent="sky"
          mono
        />
      </div>

      {/* Controlled Test Traffic Bar */}
      <div className="ns-card p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="p-2 rounded-xl bg-[#fef0dc] dark:bg-amber-500/15 text-[#9a5514] dark:text-amber-400 shrink-0">
            <FlaskConical className="w-4 h-4" />
          </div>
          <div className="text-xs">
            <div className="font-bold text-[#1a3342] dark:text-slate-200">
              Controlled Rule Verification (Synthetic Test Traffic)
            </div>
            <p className="text-slate-500 dark:text-slate-400 mt-0.5">
              Feed controlled synthetic events into the real detection engine to verify thresholds safely.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {[
            { key: 'port_scan', label: 'Test Port Scan' },
            { key: 'repeated_connection', label: 'Test Repeated Conn' },
            { key: 'traffic_spike', label: 'Test Traffic Spike' },
            { key: 'unusual_traffic', label: 'Test ICMP Burst' },
          ].map((btn) => (
            <button
              key={btn.key}
              type="button"
              disabled={Boolean(testingRule)}
              onClick={() => handleControlledTest(btn.key)}
              className="ns-btn-secondary !py-1.5 !px-3 !text-xs"
            >
              {testingRule === btn.key ? 'Testing...' : btn.label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === 'alerts' ? (
        <div className="space-y-4">
          <div className="ns-card p-4 flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Severity:
              </label>
              <select
                value={severityFilter}
                onChange={(e) => setSeverityFilter(e.target.value)}
                className="ns-input !py-1.5 text-xs"
              >
                <option value="">All Severities</option>
                <option value="Critical">Critical</option>
                <option value="High">High</option>
                <option value="Medium">Medium</option>
                <option value="Low">Low</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Status:
              </label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="ns-input !py-1.5 text-xs"
              >
                <option value="">All Statuses</option>
                <option value="open">Open</option>
                <option value="acknowledged">Acknowledged</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
            {(severityFilter || statusFilter) && (
              <button
                type="button"
                onClick={() => {
                  setSeverityFilter('');
                  setStatusFilter('');
                }}
                className="text-xs font-medium text-[#244a5c] dark:text-sky-400 hover:underline"
              >
                Clear Filters
              </button>
            )}
          </div>

          {alerts.length === 0 ? (
            <div className="ns-card">
              <EmptyState
                icon={ShieldCheck}
                title="No matching security alerts"
                description="No suspicious patterns have triggered alerts matching your current filters. Use the Controlled Rule Verification buttons above to test rule triggers."
              />
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {alerts.map((alert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  onAcknowledge={(id) => handleUpdateAlert(id, 'acknowledged')}
                  onResolve={(id) => handleUpdateAlert(id, 'resolved')}
                  onSelect={(a) => setSelectedAlert(a)}
                />
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="ns-section-title">Configurable Anomaly Detection Rules</h2>
            <button
              type="button"
              disabled={savingRules || !rulesDraft}
              onClick={handleSaveRules}
              className="ns-btn-primary !py-1.5 !text-xs"
            >
              <Save className="w-3.5 h-3.5" />
              {savingRules ? 'Saving...' : 'Save Rule Thresholds'}
            </button>
          </div>

          {rulesDraft && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {Object.entries(rulesDraft).map(([key, rule]) => (
                <div key={key} className="ns-card p-5 space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-bold text-[#1a3342] dark:text-slate-100">
                        {rule.name}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                        {rule.description}
                      </p>
                    </div>
                    <label className="inline-flex items-center gap-2 text-xs cursor-pointer shrink-0">
                      <input
                        type="checkbox"
                        checked={Boolean(rule.enabled)}
                        onChange={(e) => handleRuleFieldChange(key, 'enabled', e.target.checked)}
                        className="rounded border-slate-400 text-[#244a5c]"
                      />
                      <span
                        className={
                          rule.enabled
                            ? 'text-[#176442] dark:text-emerald-400 font-semibold'
                            : 'text-slate-400'
                        }
                      >
                        {rule.enabled ? 'Enabled' : 'Disabled'}
                      </span>
                    </label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3 border-t border-[#e4eff5] dark:border-slate-800">
                    <div>
                      <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                        Severity
                      </label>
                      <select
                        value={rule.severity || 'Medium'}
                        onChange={(e) => handleRuleFieldChange(key, 'severity', e.target.value)}
                        className="ns-input w-full !py-1.5 text-xs"
                      >
                        <option value="Critical">Critical</option>
                        <option value="High">High</option>
                        <option value="Medium">Medium</option>
                        <option value="Low">Low</option>
                      </select>
                    </div>

                    {rule.distinct_ports_threshold !== undefined && (
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                          Distinct Ports Threshold
                        </label>
                        <input
                          type="number"
                          min="2"
                          value={rule.distinct_ports_threshold}
                          onChange={(e) =>
                            handleRuleFieldChange(key, 'distinct_ports_threshold', Number(e.target.value))
                          }
                          className="ns-input w-full !py-1.5 text-xs font-mono"
                        />
                      </div>
                    )}

                    {rule.attempts_threshold !== undefined && (
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                          Attempts Threshold
                        </label>
                        <input
                          type="number"
                          min="3"
                          value={rule.attempts_threshold}
                          onChange={(e) =>
                            handleRuleFieldChange(key, 'attempts_threshold', Number(e.target.value))
                          }
                          className="ns-input w-full !py-1.5 text-xs font-mono"
                        />
                      </div>
                    )}

                    {rule.threshold_kbps !== undefined && (
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                          Traffic Spike Threshold (KB/s)
                        </label>
                        <input
                          type="number"
                          min="100"
                          value={rule.threshold_kbps}
                          onChange={(e) =>
                            handleRuleFieldChange(key, 'threshold_kbps', Number(e.target.value))
                          }
                          className="ns-input w-full !py-1.5 text-xs font-mono"
                        />
                      </div>
                    )}

                    {rule.icmp_threshold !== undefined && (
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                          ICMP Packets Threshold
                        </label>
                        <input
                          type="number"
                          min="5"
                          value={rule.icmp_threshold}
                          onChange={(e) =>
                            handleRuleFieldChange(key, 'icmp_threshold', Number(e.target.value))
                          }
                          className="ns-input w-full !py-1.5 text-xs font-mono"
                        />
                      </div>
                    )}

                    {rule.time_window_seconds !== undefined && (
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                          Time Window (seconds)
                        </label>
                        <input
                          type="number"
                          min="5"
                          value={rule.time_window_seconds}
                          onChange={(e) =>
                            handleRuleFieldChange(key, 'time_window_seconds', Number(e.target.value))
                          }
                          className="ns-input w-full !py-1.5 text-xs font-mono"
                        />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Alert Details Modal */}
      {selectedAlert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
          <div className="ns-card w-full max-w-lg p-5 shadow-2xl space-y-4">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                    {selectedAlert.alert_code}
                  </span>
                  <StatusBadge label={selectedAlert.severity} variant={selectedAlert.severity} />
                  <StatusBadge label={selectedAlert.status} variant={selectedAlert.status} />
                </div>
                <h3 className="text-base font-bold text-[#1a3342] dark:text-slate-100 mt-2">
                  {selectedAlert.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedAlert(null)}
                className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div className="p-2.5 rounded-xl bg-[#f4f9fc] dark:bg-navy-900 border border-[#d6e6ef] dark:border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase">Source IP</div>
                <div className="text-[#244a5c] dark:text-sky-300 font-semibold mt-1">
                  {selectedAlert.src_ip || 'N/A'}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-[#f4f9fc] dark:bg-navy-900 border border-[#d6e6ef] dark:border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase">Destination IP</div>
                <div className="text-slate-700 dark:text-slate-200 font-semibold mt-1">
                  {selectedAlert.dst_ip || 'N/A'}
                </div>
              </div>
            </div>

            <div className="text-xs space-y-2.5">
              <div>
                <span className="text-slate-500 font-semibold">Detected At: </span>
                <span className="font-mono text-slate-700 dark:text-slate-200">
                  {formatDateTime(selectedAlert.detected_at)}
                </span>
              </div>
              <div>
                <div className="text-slate-500 font-semibold mb-1">Reason for Detection</div>
                <p className="text-slate-700 dark:text-slate-200 leading-relaxed">
                  {selectedAlert.reason}
                </p>
              </div>
              <div>
                <div className="text-slate-500 font-semibold mb-1">Recommended Action</div>
                <p className="text-[#244a5c] dark:text-sky-200 leading-relaxed">
                  {selectedAlert.recommended_action}
                </p>
              </div>
              {selectedAlert.details && Object.keys(selectedAlert.details).length > 0 && (
                <div>
                  <div className="text-slate-500 font-semibold mb-1">Observed Evidence Metadata</div>
                  <pre className="p-3 rounded-xl bg-[#f4f9fc] dark:bg-navy-950 border border-[#d6e6ef] dark:border-slate-800 text-[11px] font-mono text-slate-700 dark:text-slate-300 overflow-x-auto">
                    {JSON.stringify(selectedAlert.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="pt-2 border-t border-[#e4eff5] dark:border-slate-800 flex justify-end gap-2">
              {selectedAlert.status === 'open' && (
                <button
                  type="button"
                  onClick={() => handleUpdateAlert(selectedAlert.id, 'acknowledged')}
                  className="ns-btn-secondary !text-xs"
                >
                  Acknowledge
                </button>
              )}
              {selectedAlert.status !== 'resolved' && (
                <button
                  type="button"
                  onClick={() => handleUpdateAlert(selectedAlert.id, 'resolved')}
                  className="ns-btn-primary !text-xs"
                >
                  Mark Resolved
                </button>
              )}
              <button
                type="button"
                onClick={() => setSelectedAlert(null)}
                className="ns-btn-secondary !text-xs"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
