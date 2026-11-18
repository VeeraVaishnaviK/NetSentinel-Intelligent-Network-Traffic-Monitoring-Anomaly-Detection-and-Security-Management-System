import React, { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Activity,
  BarChart3,
  Bell,
  FileText,
  FlaskConical,
  LayoutDashboard,
  Menu,
  Network,
  Radar,
  Settings,
  ShieldAlert,
  Terminal,
  User,
  Wifi,
  X,
} from 'lucide-react';
import logoSvg from '../assets/logo.svg';
import StatusBadge from '../components/StatusBadge';
import { api } from '../services/api';
import { usePolling } from '../hooks/usePolling';
import { formatDateTime } from '../utils/formatters';

const NAV_ITEMS = [
  { to: '/', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/discovery', label: 'Network Discovery', icon: Radar },
  { to: '/packets', label: 'Packet Analyzer', icon: Activity },
  { to: '/traffic', label: 'Traffic Analytics', icon: BarChart3 },
  { to: '/security', label: 'Security Center', icon: ShieldAlert },
  { to: '/diagnostics', label: 'Network Diagnostics', icon: Terminal },
  { to: '/reports', label: 'Reports', icon: FileText },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export default function DashboardLayout() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [togglingDemo, setTogglingDemo] = useState(false);
  const notifRef = useRef(null);

  const { data: statusData, refresh: refreshStatus } = usePolling(
    () => api.getNetworkStatus(),
    3000,
    true
  );

  const { data: alertsData, refresh: refreshAlerts } = usePolling(
    () => api.getAlerts({ status: 'open', limit: 6 }),
    4000,
    true
  );

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const openAlerts = alertsData?.alerts || [];
  const openAlertsCount = statusData?.stats?.open_security_alerts ?? openAlerts.length;
  const activeInterface = statusData?.active_interface || 'Detecting...';
  const monitoringActive = Boolean(statusData?.monitoring_active);
  const demoMode = Boolean(statusData?.demo_mode);
  const health = statusData?.health || 'healthy';

  const handleToggleDemo = async () => {
    setTogglingDemo(true);
    try {
      await api.toggleDemoMode(!demoMode);
      await Promise.all([refreshStatus(), refreshAlerts()]);
      window.dispatchEvent(new CustomEvent('netsentinel:data-changed'));
    } catch {
      // handled on active pages
    } finally {
      setTogglingDemo(false);
    }
  };

  const renderSidebarLinks = (onNavigate) => (
    <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
      {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isActive
                ? 'bg-sky-500/15 text-sky-300 border border-sky-500/25'
                : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 border border-transparent'
            }`
          }
        >
          <span className="flex items-center gap-3 min-w-0">
            <Icon className="w-4 h-4 shrink-0" />
            <span className="truncate">{label}</span>
          </span>
          {to === '/security' && openAlertsCount > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-mono font-semibold rounded-full bg-red-500/20 text-red-300 border border-red-500/30">
              {openAlertsCount}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen flex bg-navy-950 text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 bg-navy-900 border-r border-slate-800/90 z-30">
        <div className="h-16 px-4 flex items-center gap-3 border-b border-slate-800/90">
          <img src={logoSvg} alt="NetSentinel" className="w-8 h-8" />
          <div className="min-w-0">
            <div className="text-sm font-bold tracking-tight text-slate-100">NetSentinel</div>
            <div className="text-[11px] text-slate-400 truncate">Network Operations Suite</div>
          </div>
        </div>

        {renderSidebarLinks(undefined)}

        <div className="p-3 border-t border-slate-800/90">
          <div className="rounded-lg bg-navy-950/80 border border-slate-800 p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Packet Capture</span>
              <StatusBadge
                label={monitoringActive ? 'Active' : 'Idle'}
                variant={monitoringActive ? 'active' : 'stopped'}
                dot
              />
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[11px] text-slate-400 font-mono truncate">
              <Wifi className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="truncate" title={activeInterface}>
                {activeInterface}
              </span>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile / Tablet Slide-over Sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="relative w-64 max-w-[80vw] bg-navy-900 border-r border-slate-800 flex flex-col z-10">
            <div className="h-16 px-4 flex items-center justify-between border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <img src={logoSvg} alt="NetSentinel" className="w-8 h-8" />
                <span className="text-sm font-bold text-slate-100">NetSentinel</span>
              </div>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {renderSidebarLinks(() => setSidebarOpen(false))}
          </aside>
        </div>
      )}

      {/* Main Column */}
      <div className="flex-1 flex flex-col lg:pl-64 min-w-0">
        {/* Top Navigation Bar */}
        <header className="sticky top-0 z-20 h-16 bg-navy-900/95 backdrop-blur border-b border-slate-800/90 px-4 lg:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-navy-950/90 border border-slate-800 text-xs">
              <Network className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span className="text-slate-400">Interface:</span>
              <span className="font-mono text-slate-200 max-w-[180px] truncate" title={activeInterface}>
                {activeInterface}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <StatusBadge
                label={
                  monitoringActive
                    ? 'Capturing Live'
                    : health === 'offline'
                    ? 'Offline'
                    : 'Telemetry Live'
                }
                variant={monitoringActive ? 'active' : health === 'offline' ? 'offline' : 'healthy'}
                dot
              />
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Demo Mode Toggle */}
            <button
              type="button"
              disabled={togglingDemo}
              onClick={handleToggleDemo}
              title="Toggle clearly-labelled DEMO MODE with synthetic datasets for presentation"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                demoMode
                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 hover:bg-amber-500/30'
                  : 'bg-slate-800/80 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
            >
              <FlaskConical className="w-3.5 h-3.5" />
              <span className="hidden md:inline">
                {demoMode ? 'DEMO MODE: ON' : 'Demo Mode'}
              </span>
            </button>

            {/* Notifications Bell */}
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => setNotifOpen((prev) => !prev)}
                className="relative p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800 transition-colors"
                aria-label="Security notifications"
              >
                <Bell className="w-4 h-4" />
                {openAlertsCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-mono font-bold flex items-center justify-center">
                    {openAlertsCount > 99 ? '99+' : openAlertsCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 ns-card shadow-2xl border-slate-700 overflow-hidden z-40">
                  <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                      Open Security Alerts
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setNotifOpen(false);
                        navigate('/security');
                      }}
                      className="text-xs text-sky-400 hover:text-sky-300"
                    >
                      View all
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/80">
                    {openAlerts.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-400">
                        No open security alerts right now.
                      </div>
                    ) : (
                      openAlerts.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => {
                            setNotifOpen(false);
                            navigate('/security');
                          }}
                          className="w-full text-left px-4 py-3 hover:bg-slate-800/50 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <StatusBadge label={a.severity} variant={a.severity} />
                            <span className="text-[11px] font-mono text-slate-400">
                              {formatDateTime(a.detected_at)}
                            </span>
                          </div>
                          <div className="mt-1.5 text-xs font-medium text-slate-200 truncate">
                            {a.title}
                          </div>
                          <div className="mt-0.5 text-[11px] font-mono text-slate-400 truncate">
                            Src: {a.src_ip || 'N/A'}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Profile / Settings Shortcut */}
            <button
              type="button"
              onClick={() => navigate('/settings')}
              className="flex items-center gap-2 pl-2 pr-3 py-1.5 rounded-lg bg-slate-800/70 hover:bg-slate-800 border border-slate-700/80 transition-colors"
            >
              <div className="w-6 h-6 rounded-full bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-300">
                <User className="w-3.5 h-3.5" />
              </div>
              <span className="hidden md:inline text-xs font-medium text-slate-200">
                NetAdmin
              </span>
            </button>
          </div>
        </header>

        {/* Clearly Labelled DEMO MODE Banner */}
        {demoMode && (
          <div className="bg-amber-500/15 border-b border-amber-500/30 px-4 lg:px-6 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-200">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong className="font-semibold text-amber-300">DEMO MODE ACTIVE:</strong>{' '}
                Synthetic demonstration devices, packets, traffic, and alerts (tagged{' '}
                <code className="font-mono bg-amber-500/20 px-1 rounded">DEMO</code>) are
                included alongside live OS metrics. Turn off DEMO MODE anytime to view purely
                live host data.
              </span>
            </div>
            <button
              type="button"
              disabled={togglingDemo}
              onClick={handleToggleDemo}
              className="px-2.5 py-1 rounded-md bg-amber-500/25 hover:bg-amber-500/35 text-amber-100 font-medium transition-colors"
            >
              Exit Demo Mode
            </button>
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 p-4 lg:p-6 max-w-[1600px] w-full mx-auto">
          <Outlet context={{ statusData, refreshStatus }} />
        </main>
      </div>
    </div>
  );
}

