import { useState, useEffect, useCallback } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Printer,
  CreditCard,
  Settings,
  DollarSign,
  CheckCircle,
  Clock,
  AlertCircle,
  Plus,
  Trash2,
  ExternalLink,
  RefreshCw,
  LogOut,
  Save,
  QrCode,
  ShieldCheck,
  Building,
  Layers,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  Sliders,
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../hooks/useToast';
import { storeSettingsApi, printHostApi, adminApi, documentApi } from '../utils/api';

export function AdminPortalPage() {
  const navigate = useNavigate();
  const { user, isAuthenticated, loading: authLoading, logout } = useAuth();
  const { success, error, info } = useToast();

  const [activeTab, setActiveTab] = useState('settings');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [settingsData, setSettingsData] = useState({
    store_name: '',
    upi_id: '',
    merchant_name: '',
    bw_price_per_page: '3.00',
    color_price_per_page: '9.00',
    duplex_discount_percent: '15.00',
    a3_multiplier: '2.00',
    legal_multiplier: '1.40',
    require_login_for_upload: false,
    auto_verify_payments: true,
    default_print_host: '',
  });

  const [printers, setPrinters] = useState([]);
  const [showAddPrinterModal, setShowAddPrinterModal] = useState(false);
  const [newPrinter, setNewPrinter] = useState({
    name: '',
    api_url: 'http://localhost:8001',
    api_key: '',
    location: '',
  });

  const [stats, setStats] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [orderFilter, setOrderFilter] = useState('all');

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/login', { replace: true });
    }
  }, [authLoading, isAuthenticated, navigate]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [settingsRes, statsRes, printersRes] = await Promise.all([
        storeSettingsApi.get(),
        adminApi.getDashboardStats().catch(() => ({ data: null })),
        printHostApi.list().catch(() => ({ data: [] })),
      ]);

      if (settingsRes.data) {
        setSettingsData(settingsRes.data);
      }
      if (statsRes?.data) {
        setStats(statsRes.data);
        setRecentOrders(statsRes.data.recent_orders || []);
      }
      const pList = printersRes.data?.results || printersRes.data || [];
      setPrinters(pList);
    } catch (err) {
      error(err.message || 'Failed to load store administration data.');
    } finally {
      setLoading(false);
    }
  }, [error]);

  useEffect(() => {
    if (isAuthenticated) {
      fetchData();
    }
  }, [isAuthenticated, fetchData]);

  const handleSaveSettings = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    setSaving(true);
    try {
      const res = await storeSettingsApi.update(settingsData);
      success(res.data.message || 'Store settings and UPI updated successfully!');
      if (res.data.settings) {
        setSettingsData(res.data.settings);
      }
    } catch (err) {
      error(err.message || 'Failed to update store settings.');
    } finally {
      setSaving(false);
    }
  };

  const handleAddPrinter = async (e) => {
    e.preventDefault();
    if (!newPrinter.name.trim() || !newPrinter.api_url.trim()) {
      error('Printer name and API URL are required.');
      return;
    }
    try {
      const apiKey = newPrinter.api_key.trim() || Math.random().toString(36).substring(2) + Date.now().toString(36);
      await printHostApi.create({
        ...newPrinter,
        api_key: apiKey,
        is_active: true,
      });
      success(`Printer "${newPrinter.name}" added successfully!`);
      setShowAddPrinterModal(false);
      setNewPrinter({ name: '', api_url: 'http://localhost:8001', api_key: '', location: '' });
      fetchData();
    } catch (err) {
      error(err.message || 'Failed to add printer station.');
    }
  };

  const handleTogglePrinter = async (printerId, currentActive) => {
    try {
      await printHostApi.update(printerId, { is_active: !currentActive });
      success(`Printer status updated!`);
      fetchData();
    } catch (err) {
      error(err.message || 'Failed to update printer.');
    }
  };

  const handleDeletePrinter = async (printerId, name) => {
    if (!confirm(`Are you sure you want to remove printer "${name}"?`)) return;
    try {
      await printHostApi.delete(printerId);
      success(`Printer "${name}" deleted.`);
      fetchData();
    } catch (err) {
      error(err.message || 'Failed to delete printer.');
    }
  };

  const handleManualApprove = async (docId) => {
    try {
      await documentApi.verifyPayment(docId, 'STORE_OWNER_MANUAL_APPROVE');
      success('Order approved! Dispatched to printer queue.');
      fetchData();
    } catch (err) {
      error(err.message || 'Failed to approve order.');
    }
  };

  const handleLogout = async () => {
    await logout();
    success('Logged out.');
    navigate('/login');
  };

  if (authLoading || (loading && !settingsData.store_name)) {
    return (
      <div className="max-w-6xl mx-auto py-24 text-center">
        <div className="spinner-lg mx-auto mb-4" />
        <p className="text-slate-500 font-medium">Loading Store Owner Portal...</p>
      </div>
    );
  }

  const filteredOrders = recentOrders.filter((o) => {
    if (orderFilter === 'all') return true;
    return o.status === orderFilter;
  });

  return (
    <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6 pb-10 sm:pb-12">
      {/* Top Banner & Profile Header */}
      <div className="p-5 sm:p-6 bg-white rounded-2xl border border-slate-200/90 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-blue-600 text-white flex items-center justify-center font-bold shadow-md shadow-blue-500/20 shrink-0">
            <Building className="w-6 h-6" aria-hidden="true" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                {settingsData.store_name || 'Store Administration'}
              </h1>
              <span className="badge badge-paid text-[10px] font-bold py-0.5 px-2">Store Owner</span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Logged in as <strong className="text-slate-700">{user?.username || 'admin'}</strong> • Manage UPI, physical printers & pricing
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-start sm:self-auto">
          <Link to="/" className="btn btn-secondary btn-sm text-xs py-2 px-3.5 flex items-center gap-1.5 min-h-[38px]">
            <ExternalLink className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
            Customer View
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="btn btn-ghost btn-sm text-xs py-2 px-3 flex items-center gap-1.5 text-red-600 hover:bg-red-50 min-h-[38px]"
          >
            <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
            Sign Out
          </button>
        </div>
      </div>

      {/* Metrics Summary Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="card bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] uppercase font-bold tracking-wider">Total Revenue</span>
              <DollarSign className="w-4 h-4 text-emerald-600" aria-hidden="true" />
            </div>
            <p className="text-2xl sm:text-3xl font-black text-slate-900 tabular-nums">₹{stats.total_revenue?.toFixed(2) || '0.00'}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{stats.total_orders} total orders placed</p>
          </div>

          <div className="card bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] uppercase font-bold tracking-wider">Printed Jobs</span>
              <CheckCircle className="w-4 h-4 text-blue-600" aria-hidden="true" />
            </div>
            <p className="text-2xl sm:text-3xl font-black text-blue-600 tabular-nums">{stats.printed_count || 0}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Physical printouts completed</p>
          </div>

          <div className="card bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] uppercase font-bold tracking-wider">In Queue</span>
              <Clock className="w-4 h-4 text-purple-600" aria-hidden="true" />
            </div>
            <p className="text-2xl sm:text-3xl font-black text-purple-600 tabular-nums">{stats.queued_count || 0}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">Awaiting physical printing</p>
          </div>

          <div className="card bg-white p-4 sm:p-5 rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="flex items-center justify-between text-slate-400 mb-1">
              <span className="text-[11px] uppercase font-bold tracking-wider">Active Printers</span>
              <Printer className="w-4 h-4 text-emerald-600" aria-hidden="true" />
            </div>
            <p className="text-2xl sm:text-3xl font-black text-emerald-600 tabular-nums">{stats.active_printers || 0}</p>
            <p className="text-[11px] text-slate-500 mt-0.5">{printers.length} printer station(s) setup</p>
          </div>
        </div>
      )}

      {/* Main Navigation Tabs */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 overflow-x-auto scrollbar-none" role="tablist" aria-label="Admin portal sections">
        <button
          role="tab"
          type="button"
          onClick={() => setActiveTab('settings')}
          aria-selected={activeTab === 'settings'}
          aria-controls="panel-settings"
          id="tab-settings"
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0 ${
            activeTab === 'settings'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
          }`}
        >
          <CreditCard className="w-4 h-4" aria-hidden="true" />
          UPI & Store Setup
        </button>

        <button
          role="tab"
          type="button"
          onClick={() => setActiveTab('printers')}
          aria-selected={activeTab === 'printers'}
          aria-controls="panel-printers"
          id="tab-printers"
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0 ${
            activeTab === 'printers'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
          }`}
        >
          <Printer className="w-4 h-4" aria-hidden="true" />
          Printer Stations <span className="tabular-nums">({printers.length})</span>
        </button>

        <button
          role="tab"
          type="button"
          onClick={() => setActiveTab('pricing')}
          aria-selected={activeTab === 'pricing'}
          aria-controls="panel-pricing"
          id="tab-pricing"
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0 ${
            activeTab === 'pricing'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
          }`}
        >
          <Sliders className="w-4 h-4" aria-hidden="true" />
          Pricing & Access
        </button>

        <button
          role="tab"
          type="button"
          onClick={() => setActiveTab('orders')}
          aria-selected={activeTab === 'orders'}
          aria-controls="panel-orders"
          id="tab-orders"
          className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all shrink-0 ${
            activeTab === 'orders'
              ? 'bg-blue-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 bg-white border border-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" aria-hidden="true" />
          Live Orders <span className="tabular-nums">({recentOrders.length})</span>
        </button>
      </div>

      {/* TAB 1: UPI & STORE SETUP */}
      {activeTab === 'settings' && (
        <div id="panel-settings" role="tabpanel" aria-labelledby="tab-settings" className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
          {/* Left 2 Cols: Form */}
          <div className="lg:col-span-2 space-y-6">
            <div className="card bg-white p-6 sm:p-7 rounded-2xl border border-slate-200/90 shadow-sm space-y-5">
              <div>
                <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-blue-600" aria-hidden="true" />
                  UPI Payment & Payee Configuration
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Change the receiving UPI ID anytime. Dynamic QR codes immediately route payments here.
                </p>
              </div>

              <form onSubmit={handleSaveSettings} className="space-y-4">
                <div className="form-group">
                  <label className="form-label text-xs uppercase font-bold text-slate-600">Store / Business Name</label>
                  <input
                    type="text"
                    className="form-input text-sm py-2 px-3 rounded-xl border border-slate-300"
                    placeholder="e.g. Priyam Xerox & Printing"
                    value={settingsData.store_name}
                    onChange={(e) => setSettingsData({ ...settingsData, store_name: e.target.value })}
                    required
                  />
                  <p className="form-hint text-[11px] text-slate-400">Shown to customers on receipts and site banner.</p>
                </div>

                <div className="form-group">
                  <label className="form-label text-xs uppercase font-bold text-slate-600 flex items-center gap-1.5">
                    <span>UPI ID / VPA Address</span>
                    <span className="text-blue-600 font-bold" aria-hidden="true">*</span>
                  </label>
                  <input
                    type="text"
                    className="form-input font-mono font-bold text-sm py-2.5 px-3 rounded-xl border border-slate-300 focus:border-blue-600"
                    placeholder="e.g. 8617883252@okbizaxis or store@okhdfcbank"
                    value={settingsData.upi_id}
                    onChange={(e) => setSettingsData({ ...settingsData, upi_id: e.target.value.trim() })}
                    required
                  />
                  <p className="form-hint text-[11px] text-slate-400">
                    Works with Google Pay Business, PhonePe Merchant, Paytm, SBI, Axis, or HDFC VPA.
                  </p>
                </div>

                <div className="form-group">
                  <label className="form-label text-xs uppercase font-bold text-slate-600">UPI Payee / Merchant Display Name</label>
                  <input
                    type="text"
                    className="form-input text-sm py-2 px-3 rounded-xl border border-slate-300"
                    placeholder="e.g. PrintShare"
                    value={settingsData.merchant_name}
                    onChange={(e) => setSettingsData({ ...settingsData, merchant_name: e.target.value })}
                  />
                  <p className="form-hint text-[11px] text-slate-400">The verified name shown inside customer banking apps when scanning.</p>
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="btn btn-primary flex items-center gap-2 px-6 py-2.5 text-sm font-bold shadow-md shadow-blue-500/20"
                  >
                    <Save className="w-4 h-4" aria-hidden="true" />
                    {saving ? 'Saving Changes...' : 'Save UPI & Store Settings'}
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Right Col: Live QR Code Preview */}
          <div className="space-y-4">
            <div className="card bg-white p-6 rounded-2xl border border-slate-200/90 text-center shadow-sm space-y-4">
              <div>
                <span className="badge badge-paid text-[10px] font-bold py-0.5 px-2">Live Preview</span>
                <h4 className="font-bold text-slate-900 text-sm mt-1">Customer QR Code Preview</h4>
                <p className="text-[11px] text-slate-500">Test scan with your phone banking app</p>
              </div>

              <div className="p-3 bg-white border border-slate-200 rounded-2xl shadow-inner inline-block">
                <QRCodeSVG
                  value={`upi://pay?pa=${settingsData.upi_id || 'merchant@upi'}&pn=${encodeURIComponent(
                    settingsData.merchant_name || 'PrintShare'
                  )}&cu=INR&tn=PrintShare%20Test`}
                  size={160}
                  level="M"
                  includeMargin={true}
                />
              </div>

              <div className="text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-200/80 font-mono text-slate-700 break-all">
                {settingsData.upi_id || 'No UPI ID set'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PRINTER STATION SETUP */}
      {activeTab === 'printers' && (
        <div id="panel-printers" role="tabpanel" aria-labelledby="tab-printers" className="space-y-6 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Connected Printer Stations</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Physical print stations running the print client that pull queued jobs and print automatically.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddPrinterModal(true)}
              className="btn btn-primary btn-sm flex items-center gap-1.5 self-start sm:self-auto shadow-md shadow-blue-500/20"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              Add Printer Station
            </button>
          </div>

          {/* Printer List */}
          {printers.length === 0 ? (
            <div className="card bg-white p-10 text-center rounded-2xl border border-slate-200/90 space-y-3">
              <Printer className="w-12 h-12 text-slate-300 mx-auto" aria-hidden="true" />
              <h4 className="font-bold text-slate-800 text-base">No Printer Stations Configured Yet</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Add your local computer or print server station so the website can route print jobs to physical printers.
              </p>
              <button
                type="button"
                onClick={() => setShowAddPrinterModal(true)}
                className="btn btn-primary btn-sm inline-flex items-center gap-1.5"
              >
                <Plus className="w-4 h-4" aria-hidden="true" />
                Add First Printer
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {printers.map((prn) => (
                <div
                  key={prn.id}
                  className={`p-5 rounded-2xl bg-white border shadow-sm transition-all flex flex-col justify-between gap-4 ${
                    prn.is_active ? 'border-slate-200/90 hover:border-blue-400' : 'border-slate-200 opacity-60 bg-slate-50'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Printer className="w-5 h-5 text-blue-600" aria-hidden="true" />
                        <h4 className="font-bold text-slate-900 text-base">{prn.name}</h4>
                      </div>
                      <span
                        className={`badge text-[10px] py-0.5 px-2 ${
                          prn.is_active ? 'badge-paid' : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {prn.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500 font-mono truncate">{prn.api_url}</p>
                    {prn.location && <p className="text-xs text-slate-600">📍 {prn.location}</p>}
                    <p className="text-[11px] text-slate-400">
                      Last Connected: {prn.last_seen ? new Date(prn.last_seen).toLocaleString() : 'Never'}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => handleTogglePrinter(prn.id, prn.is_active)}
                      className="btn btn-secondary btn-sm text-xs py-1.5 px-3 min-h-[34px]"
                    >
                      {prn.is_active ? 'Disable Station' : 'Activate Station'}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeletePrinter(prn.id, prn.name)}
                      className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors min-h-[34px] min-w-[34px] flex items-center justify-center"
                      title="Delete Printer Station"
                      aria-label={`Delete printer ${prn.name}`}
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: PRICING & ACCESS CONTROL */}
      {activeTab === 'pricing' && (
        <div id="panel-pricing" role="tabpanel" aria-labelledby="tab-pricing" className="card bg-white p-6 sm:p-7 rounded-2xl border border-slate-200/90 shadow-sm space-y-6 animate-fade-in">
          <div>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Sliders className="w-5 h-5 text-blue-600" aria-hidden="true" />
              Per-Page Pricing & Customer Access Controls
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Set your page rates and decide whether walk-in customers must login before uploading documents.
            </p>
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="form-group">
                <label className="form-label text-xs uppercase font-bold text-slate-600">
                  Black & White Rate (₹ / Page)
                </label>
                <input
                  type="number"
                  step="0.25"
                  min="0.5"
                  className="form-input text-sm py-2 px-3 rounded-xl border border-slate-300"
                  value={settingsData.bw_price_per_page}
                  onChange={(e) => setSettingsData({ ...settingsData, bw_price_per_page: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label text-xs uppercase font-bold text-slate-600">
                  Full Color Rate (₹ / Page)
                </label>
                <input
                  type="number"
                  step="0.25"
                  min="1"
                  className="form-input text-sm py-2 px-3 rounded-xl border border-slate-300"
                  value={settingsData.color_price_per_page}
                  onChange={(e) => setSettingsData({ ...settingsData, color_price_per_page: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label text-xs uppercase font-bold text-slate-600">
                  Duplex / Double-Sided Discount (%)
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="50"
                  className="form-input text-sm py-2 px-3 rounded-xl border border-slate-300"
                  value={settingsData.duplex_discount_percent}
                  onChange={(e) => setSettingsData({ ...settingsData, duplex_discount_percent: e.target.value })}
                  required
                />
                <p className="form-hint text-[11px] text-slate-400">Discount applied to back-to-back sheet printing.</p>
              </div>

              <div className="form-group">
                <label className="form-label text-xs uppercase font-bold text-slate-600">
                  A3 Paper Price Multiplier
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="1"
                  max="5"
                  className="form-input text-sm py-2 px-3 rounded-xl border border-slate-300"
                  value={settingsData.a3_multiplier}
                  onChange={(e) => setSettingsData({ ...settingsData, a3_multiplier: e.target.value })}
                  required
                />
              </div>
            </div>

            {/* Access Toggles */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
              <h4 className="text-xs uppercase font-bold text-slate-600">Store Access & Security</h4>

              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold text-slate-900">Require Customer Login Before Upload</p>
                  <p className="text-xs text-slate-500">
                    If enabled, visitors must log in to an account before uploading files on the main page.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setSettingsData({
                      ...settingsData,
                      require_login_for_upload: !settingsData.require_login_for_upload,
                    })
                  }
                  className="text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                  aria-pressed={settingsData.require_login_for_upload}
                  aria-label={settingsData.require_login_for_upload ? 'Disable login requirement' : 'Enable login requirement'}
                >
                  {settingsData.require_login_for_upload ? (
                    <ToggleRight className="w-9 h-9" aria-hidden="true" />
                  ) : (
                    <ToggleLeft className="w-9 h-9 text-slate-400" aria-hidden="true" />
                  )}
                </button>
              </div>

              <div className="flex items-center justify-between gap-4 pt-3 border-t border-slate-200/80">
                <div>
                  <p className="text-sm font-bold text-slate-900">Auto-Approve Orders on UTR Entry</p>
                  <p className="text-xs text-slate-500">
                    Immediately mark order as verified and route to printer when customer submits UTR number.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setSettingsData({
                      ...settingsData,
                      auto_verify_payments: !settingsData.auto_verify_payments,
                    })
                  }
                  className="text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                  aria-pressed={settingsData.auto_verify_payments}
                  aria-label={settingsData.auto_verify_payments ? 'Disable auto-approve' : 'Enable auto-approve'}
                >
                  {settingsData.auto_verify_payments ? (
                    <ToggleRight className="w-9 h-9" aria-hidden="true" />
                  ) : (
                    <ToggleLeft className="w-9 h-9 text-slate-400" aria-hidden="true" />
                  )}
                </button>
              </div>
            </div>

            <div>
              <button
                type="submit"
                disabled={saving}
                className="btn btn-primary flex items-center gap-2 px-6 py-2.5 text-sm font-bold shadow-md shadow-blue-500/20"
              >
                <Save className="w-4 h-4" aria-hidden="true" />
                {saving ? 'Updating Rates...' : 'Save Pricing & Access Rules'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 4: LIVE PRINT QUEUE & RECENT ORDERS */}
      {activeTab === 'orders' && (
        <div id="panel-orders" role="tabpanel" aria-labelledby="tab-orders" className="space-y-4 animate-fade-in">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Live Orders & Printing Queue</h3>
              <p className="text-xs text-slate-500">Monitor incoming orders and manually approve or reprint jobs</p>
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0" role="group" aria-label="Filter orders by status">
              {['all', 'pending', 'paid', 'queued', 'printed'].map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setOrderFilter(f)}
                  aria-pressed={orderFilter === f}
                  className={`text-xs font-semibold px-3 py-1.5 rounded-xl capitalize transition-all ${
                    orderFilter === f ? 'bg-blue-600 text-white shadow-xs' : 'bg-white border border-slate-200 text-slate-600'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {filteredOrders.length === 0 ? (
            <div className="card bg-white p-8 text-center rounded-2xl border border-slate-200/90 text-slate-500 text-sm">
              No orders found for this status.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredOrders.map((ord) => (
                <div
                  key={ord.id}
                  className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-slate-900 text-sm sm:text-base truncate">{ord.title}</h4>
                      <span className="text-[11px] bg-slate-100 font-semibold px-2 py-0.5 rounded-full text-slate-700">
                        📄 {ord.total_pages || 1} pgs
                      </span>
                      <span className={`badge badge-${ord.status} text-[10px] font-bold py-0.5 px-2 capitalize`}>
                        {ord.status}
                      </span>
                    </div>

                    <p className="text-xs text-slate-500">
                      {ord.paper_size} • {ord.color_mode === 'bw' ? 'B&W' : 'Color'} • {ord.copies} copy •{' '}
                      {new Date(ord.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    <div className="text-left sm:text-right">
                      <p className="text-[10px] uppercase font-bold text-slate-400">Amount</p>
                      <p className="text-base font-extrabold text-slate-900 tabular-nums">₹{Number(ord.payment_amount || ord.price || 0).toFixed(2)}</p>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {ord.status === 'pending' && (
                        <button
                          type="button"
                          onClick={() => handleManualApprove(ord.id)}
                          className="btn btn-primary btn-sm text-xs py-1.5 px-3 min-h-[34px]"
                          title="Manually verify payment and queue for printing"
                        >
                          Approve & Print
                        </button>
                      )}
                      <Link
                        to={`/share/${ord.share_token}`}
                        className="btn btn-secondary btn-sm text-xs py-1.5 px-2.5 min-h-[34px]"
                        target="_blank"
                        rel="noopener noreferrer"
                        title="View customer payment link"
                      >
                        <ExternalLink className="w-3.5 h-3.5 text-blue-600" aria-hidden="true" />
                      </Link>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODAL: ADD PRINTER STATION */}
      {showAddPrinterModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-xs animate-fade-in" role="dialog" aria-modal="true" aria-labelledby="add-printer-title">
          <div className="max-w-md w-full bg-white rounded-2xl p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <h3 id="add-printer-title" className="font-bold text-slate-900 text-lg flex items-center gap-2">
                <Printer className="w-5 h-5 text-blue-600" aria-hidden="true" />
                Add Printer Station
              </h3>
              <button
                type="button"
                onClick={() => setShowAddPrinterModal(false)}
                className="text-slate-400 hover:text-slate-600 text-lg font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddPrinter} className="space-y-3.5">
              <div className="form-group">
                <label className="form-label text-xs uppercase font-bold text-slate-600">Station Name</label>
                <input
                  type="text"
                  className="form-input text-sm py-2 px-3 rounded-xl border border-slate-300"
                  placeholder="e.g. Counter HP LaserJet M1005"
                  value={newPrinter.name}
                  onChange={(e) => setNewPrinter({ ...newPrinter, name: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label text-xs uppercase font-bold text-slate-600">Local API URL</label>
                <input
                  type="url"
                  className="form-input text-sm py-2 px-3 rounded-xl border border-slate-300 font-mono"
                  placeholder="http://localhost:8001 or http://192.168.1.100:8001"
                  value={newPrinter.api_url}
                  onChange={(e) => setNewPrinter({ ...newPrinter, api_url: e.target.value })}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label text-xs uppercase font-bold text-slate-600">Physical Location</label>
                <input
                  type="text"
                  className="form-input text-sm py-2 px-3 rounded-xl border border-slate-300"
                  placeholder="e.g. Front Cash Counter"
                  value={newPrinter.location}
                  onChange={(e) => setNewPrinter({ ...newPrinter, location: e.target.value })}
                />
              </div>

              <div className="form-group">
                <label className="form-label text-xs uppercase font-bold text-slate-600">API Key (Optional / Auto-generated)</label>
                <input
                  type="text"
                  className="form-input text-sm py-2 px-3 rounded-xl border border-slate-300 font-mono"
                  placeholder="Leave blank to generate automatically"
                  value={newPrinter.api_key}
                  onChange={(e) => setNewPrinter({ ...newPrinter, api_key: e.target.value })}
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddPrinterModal(false)}
                  className="btn btn-secondary btn-sm"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary btn-sm flex items-center gap-1.5">
                  <Plus className="w-4 h-4" aria-hidden="true" />
                  Save Printer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}