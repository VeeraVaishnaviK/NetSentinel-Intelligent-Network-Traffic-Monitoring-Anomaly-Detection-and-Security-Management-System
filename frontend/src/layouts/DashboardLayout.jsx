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
  Moon,
  Network,
  Radar,
  Search,
  Settings,
  ShieldAlert,
  ShieldCheck,
  Sun,
  Terminal,
  Wifi,
  X,
} from 'lucide-react';
import StatusBadge from '../components/StatusBadge';
import { api } from '../services/api';
import { usePolling } from '../hooks/usePolling';
import { formatDateTime } from '../utils/formatters';

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', keywords: 'overview home dashboard', icon: LayoutDashboard, end: true },
  { to: '/discovery', label: 'Network Discovery', keywords: 'devices arp scan hosts lan', icon: Radar },
  { to: '/packets', label: 'Packet Analyzer', keywords: 'packets capture scapy tcp udp dns', icon: Activity },
  { to: '/traffic', label: 'Traffic Analytics', keywords: 'bandwidth speed charts analytics', icon: BarChart3 },
  { to: '/security', label: 'Security Center', keywords: 'alerts rules port scan anomaly', icon: ShieldAlert },
  { to: '/diagnostics', label: 'Diagnostics', keywords: 'ping traceroute dns connectivity', icon: Terminal },
  { to: '/reports', label: 'Reports', keywords: 'export csv pdf summary', icon: FileText },
  { to: '/settings', label: 'Settings', keywords: 'config preferences trusted clear', icon: Settings },
];

export default function DashboardLayout() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [togglingDemo, setTogglingDemo] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('ns-theme') === 'dark');
  const notifRef = useRef(null);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
      localStorage.setItem('ns-theme', 'dark');
    } else {
      root.classList.remove('dark');
      localStorage.setItem('ns-theme', 'light');
    }
  }, [darkMode]);

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

  const handleToggleDemo = async () => {
    setTogglingDemo(true);
    try {
      await api.toggleDemoMode(!demoMode);
      await Promise.all([refreshStatus(), refreshAlerts()]);
      window.dispatchEvent(new CustomEvent('netsentinel:data-changed'));
    } catch {
      // surfaced on active page
    } finally {
      setTogglingDemo(false);
    }
  };

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    const q = searchQuery.trim().toLowerCase();
    if (!q) return;
    const match = NAV_ITEMS.find(
      (item) =>
        item.label.toLowerCase().includes(q) || item.keywords.toLowerCase().includes(q)
    );
    if (match) {
      navigate(match.to);
      setSearchQuery('');
    } else {
      navigate('/packets');
    }
  };

  const renderSidebarLinks = (onNavigate) => (
    <nav className="flex-1 pl-4 py-2 space-y-1 overflow-y-auto">
      {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          className={({ isActive }) =>
            `flex items-center justify-between gap-3 pl-4 pr-5 py-2.5 text-sm font-medium transition-all ${
              isActive
                ? 'sidebar-active-tab font-semibold'
                : 'text-slate-100/85 hover:text-white hover:bg-white/10 rounded-l-full'
            }`
          }
        >
          <span className="flex items-center gap-3 min-w-0">
            <Icon className="w-4 h-4 shrink-0" />
            <span className="truncate">{label}</span>
          </span>
          {to === '/security' && openAlertsCount > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-mono font-bold rounded-full bg-[#e07a5f] text-white">
              {openAlertsCount}
            </span>
          )}
        </NavLink>
      ))}
    </nav>
  );

  const renderSidebarProfile = () => (
    <div className="pt-7 pb-5 px-5 flex flex-col items-center text-center">
      <div className="w-16 h-16 rounded-full p-1 border-2 border-white/40 bg-white/10 flex items-center justify-center shadow-inner">
        <div className="w-full h-full rounded-full bg-white text-[#244a5c] flex items-center justify-center">
          <ShieldCheck className="w-8 h-8" />
        </div>
      </div>
      <div className="mt-3 text-sm font-semibold text-white tracking-tight">
        NetSentinel
      </div>
      <div className="mt-0.5 text-[11px] text-sky-100/70 font-mono truncate max-w-full">
        {activeInterface}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#dcebf2] dark:bg-navy-950 text-slate-800 dark:text-slate-100 transition-colors">
      {/* Desktop Deep Slate-Teal Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-60 lg:fixed lg:inset-y-0 bg-[#244a5c] dark:bg-[#132935] text-white z-30 shadow-lg">
        {renderSidebarProfile()}

        {renderSidebarLinks(undefined)}

        {/* Bottom Sidebar Status / Demo Toggle Slot (matches reference bottom action) */}
        <div className="px-5 py-4 border-t border-white/10 space-y-2.5">
          <div className="flex items-center justify-between text-[11px] text-sky-100/80">
            <span className="flex items-center gap-1.5">
              <Wifi className="w-3.5 h-3.5 text-emerald-300" />
              Capture
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                monitoringActive
                  ? 'bg-emerald-400/20 text-emerald-200'
                  : 'bg-white/10 text-sky-100/80'
              }`}
            >
              {monitoringActive ? 'LIVE' : 'IDLE'}
            </span>
          </div>

          <button
            type="button"
            disabled={togglingDemo}
            onClick={handleToggleDemo}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors ${
              demoMode
                ? 'bg-[#e07a5f] text-white hover:bg-[#cf6b50]'
                : 'text-sky-100/85 hover:bg-white/10 hover:text-white'
            }`}
          >
            <FlaskConical className="w-4 h-4 shrink-0" />
            <span>{demoMode ? 'Exit Demo Mode' : 'Demo Mode'}</span>
          </button>
        </div>
      </aside>

      {/* Mobile / Tablet Slide-over Sidebar */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
          <aside className="relative w-64 max-w-[80vw] bg-[#244a5c] dark:bg-[#132935] text-white flex flex-col z-10 shadow-2xl">
            <div className="flex justify-end p-3 pb-0">
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="p-1.5 text-white/80 hover:text-white rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {renderSidebarProfile()}
            {renderSidebarLinks(() => setSidebarOpen(false))}
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col lg:pl-60 min-w-0">
        {/* Crisp White Top Header Bar (Matches Reference) */}
        <header className="sticky top-0 z-20 h-16 bg-white dark:bg-navy-900 border-b border-[#cfe0ea] dark:border-slate-800 px-4 lg:px-7 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-xl text-[#244a5c] dark:text-slate-200 hover:bg-[#eef6fa] dark:hover:bg-navy-800"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 min-w-0">
              <h2 className="text-lg sm:text-xl font-bold text-[#1a3342] dark:text-slate-100 truncate">
                Welcome to NetSentinel !
              </h2>
              <div className="hidden xl:flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#eef6fa] dark:bg-navy-800 border border-[#cde0ea] dark:border-slate-700 text-xs">
                <Network className="w-3.5 h-3.5 text-[#244a5c] dark:text-sky-400" />
                <span className="font-mono text-[#1f4152] dark:text-slate-200 max-w-[140px] truncate">
                  {activeInterface}
                </span>
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
              </div>
            </div>
          </div>

          {/* Right Controls: Pill Search Bar, Theme Pill Switch, Bell */}
          <div className="flex items-center gap-3">
            {/* Pill Search Input matching reference */}
            <form
              onSubmit={handleSearchSubmit}
              className="hidden md:flex items-center rounded-full border border-[#b7d1df] dark:border-slate-700 bg-white dark:bg-navy-850 overflow-hidden h-9 w-56 lg:w-64 focus-within:border-[#244a5c] dark:focus-within:border-sky-400 transition-colors"
            >
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search modules..."
                className="flex-1 bg-transparent px-4 text-xs text-slate-700 dark:text-slate-200 placeholder-slate-400 focus:outline-none"
              />
              <button
                type="submit"
                aria-label="Search"
                className="h-full px-3.5 bg-[#dcebf2] dark:bg-navy-700 text-[#244a5c] dark:text-sky-300 hover:bg-[#cde0ea] dark:hover:bg-navy-600 transition-colors flex items-center justify-center"
              >
                <Search className="w-4 h-4" />
              </button>
            </form>

            {/* Theme Toggle Pill matching reference screenshot */}
            <button
              type="button"
              onClick={() => setDarkMode((prev) => !prev)}
              title={darkMode ? 'Switch to Light Slate-Teal Theme' : 'Switch to Dark Theme'}
              className="relative inline-flex items-center justify-between w-14 h-7 rounded-full px-1.5 bg-[#dcebf2] dark:bg-navy-800 border border-[#bfd6e3] dark:border-slate-700 transition-colors"
            >
              <span
                className={`w-5 h-5 rounded-full bg-[#244a5c] dark:bg-sky-500 text-white flex items-center justify-center shadow-sm transform transition-transform ${
                  darkMode ? 'translate-x-6' : 'translate-x-0'
                }`}
              >
                {darkMode ? <Moon className="w-3 h-3" /> : <Sun className="w-3 h-3" />}
              </span>
              {!darkMode && <Moon className="w-3 h-3 text-[#244a5c]/70 mr-1" />}
            </button>

            {/* Notification Bell */}
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => setNotifOpen((prev) => !prev)}
                className="relative p-2 rounded-full text-[#244a5c] dark:text-slate-200 hover:bg-[#eef6fa] dark:hover:bg-navy-800 transition-colors"
                aria-label="Security notifications"
              >
                <Bell className="w-5 h-5" />
                {openAlertsCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 min-w-[16px] h-[16px] px-1 rounded-full bg-[#d96b52] text-white text-[10px] font-bold flex items-center justify-center">
                    {openAlertsCount > 99 ? '99+' : openAlertsCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 ns-card shadow-xl overflow-hidden z-40">
                  <div className="px-4 py-3 border-b border-[#d6e6ef] dark:border-slate-800 flex items-center justify-between bg-[#f4f9fc] dark:bg-navy-900">
                    <span className="text-xs font-semibold uppercase tracking-wider text-[#1f4152] dark:text-slate-300">
                      Open Security Alerts
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setNotifOpen(false);
                        navigate('/security');
                      }}
                      className="text-xs font-medium text-[#244a5c] dark:text-sky-400 hover:underline"
                    >
                      View all
                    </button>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-[#e2edf3] dark:divide-slate-800">
                    {openAlerts.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
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
                          className="w-full text-left px-4 py-3 hover:bg-[#f4f9fc] dark:hover:bg-navy-800/70 transition-colors"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <StatusBadge label={a.severity} variant={a.severity} />
                            <span className="text-[11px] font-mono text-slate-400">
                              {formatDateTime(a.detected_at)}
                            </span>
                          </div>
                          <div className="mt-1.5 text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                            {a.title}
                          </div>
                          <div className="mt-0.5 text-[11px] font-mono text-slate-500 dark:text-slate-400 truncate">
                            Src: {a.src_ip || 'N/A'}
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Clearly Labelled DEMO MODE Banner */}
        {demoMode && (
          <div className="bg-[#fdf2ec] dark:bg-amber-500/15 border-b border-[#ecc3b0] dark:border-amber-500/30 px-4 lg:px-7 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[#8f3f2b] dark:text-amber-200">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-[#c95944] dark:text-amber-400 shrink-0" />
              <span>
                <strong className="font-semibold">DEMO MODE ACTIVE:</strong> Synthetic
                demonstration devices, packets, traffic, and alerts (tagged{' '}
                <code className="font-mono bg-[#f5ddd0] dark:bg-amber-500/20 px-1 rounded">DEMO</code>
                ) are shown alongside live host telemetry.
              </span>
            </div>
            <button
              type="button"
              disabled={togglingDemo}
              onClick={handleToggleDemo}
              className="px-2.5 py-1 rounded-lg bg-[#c95944] text-white hover:bg-[#b24936] font-medium transition-colors"
            >
              Exit Demo Mode
            </button>
          </div>
        )}

        {/* Main Workspace Canvas */}
        <main className="flex-1 p-4 lg:p-6 max-w-[1600px] w-full mx-auto">
          <Outlet context={{ statusData, refreshStatus, darkMode }} />
        </main>
      </div>
    </div>
  );
}
