import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  Upload,
  X,
  Settings,
  CreditCard,
  Printer,
  Plus,
  Eye,
  Layers,
  Sparkles,
  SlidersHorizontal,
  ShieldCheck,
  Maximize2,
} from 'lucide-react';
import { documentApi, printHostApi, storeSettingsApi } from '../utils/api';
import { useToast } from '../hooks/useToast';
import { useAuth } from '../context/AuthContext';
import { loadPdfDocument, parsePageRange } from '../utils/pdfHelper';
import { PrintReviewPanel } from '../components/PrintReviewPanel';
import { DocumentSettingsModal } from '../components/DocumentSettingsModal';

const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
];

const MAX_FILE_SIZE = 50 * 1024 * 1024;

export function UploadPage() {
  const navigate = useNavigate();
  const { success, error, info } = useToast();
  const fileInputRef = useRef(null);

  const [documents, setDocuments] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const [printHosts, setPrintHosts] = useState([]);

  const [reviewDocIndex, setReviewDocIndex] = useState(0);
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [editingDocId, setEditingDocId] = useState(null);

  const [sharedPrintHost, setSharedPrintHost] = useState('');
  const [activePanel, setActivePanel] = useState('queue');
  const [showBatchControls, setShowBatchControls] = useState(false);
  const [storeSettings, setStoreSettings] = useState(null);
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    const fetchHostsAndSettings = async () => {
      try {
        const [hostsRes, settingsRes] = await Promise.all([
          printHostApi.list().catch(() => ({ data: [] })),
          storeSettingsApi.get().catch(() => ({ data: null })),
        ]);
        const hosts = hostsRes.data.results || hostsRes.data || [];
        setPrintHosts(hosts);
        if (hosts.length > 0) {
          setSharedPrintHost(hosts[0].id);
        }
        if (settingsRes?.data) {
          setStoreSettings(settingsRes.data);
          if (settingsRes.data.default_print_host) {
            setSharedPrintHost(settingsRes.data.default_print_host);
          }
        }
      } catch (err) {
        console.warn('Could not load print hosts or store settings:', err);
      }
    };
    fetchHostsAndSettings();
  }, []);

  const processIncomingFile = useCallback(
    async (fileObj) => {
      const isAllowed =
        ALLOWED_TYPES.includes(fileObj.type) ||
        /\.(pdf|jpe?g|png|webp|docx?|txt)$/i.test(fileObj.name);

      if (!isAllowed) {
        error(`"${fileObj.name}" is not a supported file type.`);
        return null;
      }
      if (fileObj.size > MAX_FILE_SIZE) {
        error(`"${fileObj.name}" exceeds the 50MB file size limit.`);
        return null;
      }

      let detectedPages = 1;
      let pageCountUnverified = false;
      if (
        fileObj.type === 'application/pdf' ||
        fileObj.type === 'application/x-pdf' ||
        /\.pdf$/i.test(fileObj.name)
      ) {
        try {
          const pdf = await loadPdfDocument(fileObj);
          detectedPages = pdf.numPages;
        } catch (e) {
          console.warn('Could not read PDF pages in browser:', e);
          pageCountUnverified = true;
        }
      }

      return {
        client_id: `doc_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
        file: fileObj,
        title: fileObj.name.replace(/\.[^/.]+$/, ''),
        total_pages: detectedPages,
        page_count_unverified: pageCountUnverified,
        paper_size: 'A4',
        color_mode: 'bw',
        orientation: 'portrait',
        copies: 1,
        double_sided: false,
        page_range: '',
        print_host: sharedPrintHost || '',
      };
    },
    [error, sharedPrintHost]
  );

  const handleAddFiles = useCallback(
    async (fileList) => {
      if (!fileList || fileList.length === 0) return;
      const fileArr = Array.from(fileList);

      const processed = [];
      for (const f of fileArr) {
        const item = await processIncomingFile(f);
        if (item) processed.push(item);
      }

      if (processed.length > 0) {
        setDocuments((prev) => [...prev, ...processed]);
        success(`Added ${processed.length} document(s) to printing queue.`);
        const unverified = processed.filter((d) => d.page_count_unverified);
        if (unverified.length > 0) {
          info(
            `Could not read page count for ${unverified.length} PDF(s) in the browser. The page count will be verified when the job is uploaded.`
          );
        }
      }
    },
    [processIncomingFile, success, info]
  );

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setDragging(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleAddFiles(e.dataTransfer.files);
      }
    },
    [handleAddFiles]
  );

  const handleFileInputChange = useCallback(
    (e) => {
      if (e.target.files && e.target.files.length > 0) {
        handleAddFiles(e.target.files);
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    },
    [handleAddFiles]
  );

  const removeDocument = useCallback((clientId) => {
    setDocuments((prev) => prev.filter((d) => d.client_id !== clientId));
  }, []);

  const updateDocumentSettings = useCallback((clientId, newSettings) => {
    setDocuments((prev) =>
      prev.map((d) => (d.client_id === clientId ? { ...d, ...newSettings } : d))
    );
  }, []);

  const applyBatchSetting = useCallback((settingKey, settingVal) => {
    setDocuments((prev) =>
      prev.map((d) => ({
        ...d,
        [settingKey]: settingVal,
      }))
    );
  }, []);

  const calculateDocPrice = useCallback((d) => {
    const bwRate = storeSettings ? Number(storeSettings.bw_price_per_page) : 3.0;
    const colorRate = storeSettings ? Number(storeSettings.color_price_per_page) : 9.0;
    const duplexDiscount = storeSettings ? Number(storeSettings.duplex_discount_percent) / 100 : 0.15;
    const a3Mult = storeSettings ? Number(storeSettings.a3_multiplier) : 2.0;
    const legalMult = storeSettings ? Number(storeSettings.legal_multiplier) : 1.4;

    let base = d.color_mode === 'bw' ? bwRate : colorRate;
    if (['A3', 'Tabloid'].includes(d.paper_size)) base *= a3Mult;
    else if (d.paper_size === 'Legal') base *= legalMult;

    const totalPages = d.total_pages || 1;
    const selected = parsePageRange(d.page_range, totalPages);
    const pageCount = Math.max(1, selected.length);

    let cost = 0;
    if (d.double_sided) {
      const sheets = Math.ceil(pageCount / 2);
      cost = sheets * 2 * base * (1 - duplexDiscount);
    } else {
      cost = pageCount * base;
    }
    return Math.max(Math.round(cost * Math.max(1, d.copies || 1) * 100) / 100, 3.0);
  }, [storeSettings]);

  const totalCost = useMemo(() => {
    return Math.round(documents.reduce((acc, d) => acc + calculateDocPrice(d), 0) * 100) / 100;
  }, [documents, calculateDocPrice]);

  const totalSheetsToPrint = useMemo(() => {
    return documents.reduce((acc, d) => {
      const selected = parsePageRange(d.page_range, d.total_pages || 1);
      const pages = selected.length;
      const sheets = d.double_sided ? Math.ceil(pages / 2) : pages;
      return acc + sheets * Math.max(1, d.copies || 1);
    }, 0);
  }, [documents]);

  const totalPagesInQueue = useMemo(() => {
    return documents.reduce((acc, d) => {
      const selected = parsePageRange(d.page_range, d.total_pages || 1);
      return acc + selected.length;
    }, 0);
  }, [documents]);

  const handleBatchSubmit = async (e) => {
    if (e && e.preventDefault) e.preventDefault();
    if (documents.length === 0) {
      error('Please upload at least one document.');
      return;
    }

    setUploading(true);
    setUploadProgress(10);

    try {
      const formData = new FormData();

      const meta = [];
      documents.forEach((docItem) => {
        formData.append('files', docItem.file);
        meta.push({
          filename: docItem.file.name,
          title: docItem.title || docItem.file.name.replace(/\.[^/.]+$/, ''),
          paper_size: docItem.paper_size,
          color_mode: docItem.color_mode,
          orientation: docItem.orientation,
          copies: docItem.copies,
          double_sided: docItem.double_sided,
          page_range: docItem.page_range,
          total_pages: docItem.total_pages,
          print_host: docItem.print_host || sharedPrintHost || '',
        });
      });

      formData.append('metadata', JSON.stringify(meta));
      if (sharedPrintHost) {
        formData.append('print_host', sharedPrintHost);
      }

      setUploadProgress(40);
      const response = await documentApi.batchUpload(formData);
      setUploadProgress(100);

      success('Uploaded successfully! Redirecting to order payment...');
      const batchId = response.data.order_batch_id;
      if (batchId) {
        navigate(`/share/batch/${batchId}`);
      } else if (response.data.documents && response.data.documents.length > 0) {
        navigate(`/share/${response.data.documents[0].share_token}`);
      } else {
        navigate('/documents');
      }
    } catch (err) {
      error(err.message || 'Failed to upload documents. Please try again.');
    } finally {
      setUploading(false);
      setUploadProgress(0);
    }
  };

  const editingDoc = useMemo(() => {
    return documents.find((d) => (d.id || d.client_id) === editingDocId) || null;
  }, [documents, editingDocId]);

  return (
    <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6 pb-10 sm:pb-12">
      {/* Login Required Notice */}
      {storeSettings?.require_login_for_upload && !isAuthenticated && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-3">
            <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0" aria-hidden="true" />
            <div>
              <h4 className="font-bold text-sm">Store Login Required</h4>
              <p className="text-xs text-amber-700">The store owner requires signing in before submitting or queueing print jobs.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate('/login', { state: { from: { pathname: '/' } } })}
            className="btn btn-primary btn-sm text-xs py-2 px-4 font-bold shrink-0 shadow-sm"
          >
            Sign In to Upload
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="page-title text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Printer className="w-7 h-7 sm:w-8 h-8 text-blue-600 shrink-0" aria-hidden="true" />
            Upload & Auto Print
          </h1>
          <p className="page-subtitle text-xs sm:text-sm text-slate-600 mt-1">
            Simultaneous multi-document upload, live print simulation, custom page selection, and instant UPI printing
          </p>
        </div>
      </div>

      {/* Main Upload Dropzone */}
      <div
        className={`file-dropzone group ${dragging ? 'is-dragging' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); }}}
        aria-label="File upload area. Drag and drop files here, or click to browse."
      >
        <input
          ref={fileInputRef}
          type="file"
          id="file-upload"
          className="sr-only"
          accept={ALLOWED_TYPES.join(',')}
          multiple
          onChange={handleFileInputChange}
          disabled={uploading}
        />

        <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-3 sm:mb-4 shadow-sm group-hover:scale-105 group-hover:bg-blue-600 group-hover:text-white transition-all">
          <Upload className="w-6 h-6 sm:w-7 sm:h-7" aria-hidden="true" />
        </div>

        <h3 className="font-bold text-slate-900 text-lg sm:text-xl">
          <span className="hidden sm:inline">Drag & drop files here, or </span>
          <span className="text-blue-600 underline decoration-blue-300 decoration-2 underline-offset-4 cursor-pointer">
            browse from your device
          </span>
        </h3>

        <p className="text-xs sm:text-sm text-slate-500 mt-2 max-w-md mx-auto">
          PDF, JPG, PNG, WebP, Word, or Text • Up to 50MB each • Multiple files supported
        </p>

        <button
          type="button"
          className="btn btn-primary mt-5 sm:hidden inline-flex items-center gap-2 shadow-md shadow-blue-500/20 py-2.5 px-5 text-sm font-bold min-h-[44px]"
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
          aria-label="Choose files from device"
        >
          <Plus className="w-4 h-4" />
          Choose Files / Photos
        </button>
      </div>

      {/* When Empty: Feature Highlights & Transparent Pricing */}
      {documents.length === 0 && (
        <div className="space-y-5 pt-1">
          {/* Feature Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-sm flex flex-col gap-2">
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                <Layers className="w-5 h-5" aria-hidden="true" />
              </div>
              <h4 className="font-bold text-slate-900 text-sm">Batch Multi-Upload</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Add several documents at once. Adjust paper size, duplex, and page ranges individually or across the entire queue.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-sm flex flex-col gap-2">
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center shrink-0">
                <Sparkles className="w-5 h-5" aria-hidden="true" />
              </div>
              <h4 className="font-bold text-slate-900 text-sm">Real Laser Simulator</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Inspect physical aspect ratios and compare B&W vs Full Color output before sending your job to the printer.
              </p>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-sm flex flex-col gap-2">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
                <CreditCard className="w-5 h-5" aria-hidden="true" />
              </div>
              <h4 className="font-bold text-slate-900 text-sm">Instant UPI Pay & Print</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Scan the dynamic QR code with any UPI app. Once verified, the document prints automatically at the print station.
              </p>
            </div>
          </div>

          {/* Pricing Reference Card */}
          <div className="p-5 rounded-2xl bg-white border border-slate-200/90 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                <Printer className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 text-sm">Simple, Transparent Pricing</h4>
                <p className="text-xs text-slate-500">
                  Black & White: <span className="tabular-nums font-semibold">₹3.00/pg</span> • Color: <span className="tabular-nums font-semibold">₹9.00/pg</span> • Duplex discount: <span className="tabular-nums font-semibold">15% off sheet rate</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className="badge badge-paid text-xs py-1 px-3">UPI Enabled</span>
              <span className="badge badge-pending text-xs py-1 px-3">Auto Routing</span>
            </div>
          </div>
        </div>
      )}

      {/* DOCUMENT QUEUE & CHECKOUT SUMMARY */}
      {documents.length > 0 && (
        <div className="space-y-4">
          {/* Queue summary — the single place totals and the primary CTA live */}
          <div className="queue-summary-bar">
            <div className="queue-summary-stats">
              <span className="queue-stat">
                <strong>{documents.length}</strong> {documents.length === 1 ? 'file' : 'files'}
              </span>
              <span className="queue-stat">
                <strong>{totalPagesInQueue}</strong> {totalPagesInQueue === 1 ? 'page' : 'pages'}
              </span>
              <span className="queue-stat">
                <strong>{totalSheetsToPrint}</strong> {totalSheetsToPrint === 1 ? 'sheet' : 'sheets'}
              </span>
              <span className="queue-stat queue-stat-total">
                <span>Total</span>
                <strong>₹{totalCost.toFixed(2)}</strong>
              </span>
            </div>

            <div className="queue-summary-actions">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setReviewDocIndex(0);
                  setShowReviewModal(true);
                }}
              >
                <Eye className="w-4 h-4 text-blue-600" aria-hidden="true" />
                Full Review Simulator
              </button>
              <button
                type="button"
                className="btn btn-primary shadow-md shadow-blue-500/20"
                onClick={handleBatchSubmit}
                disabled={uploading}
              >
                {uploading ? (
                  <>
                    <span className="spinner" aria-hidden="true" />
                    Uploading <span className="tabular-nums">({uploadProgress}%)</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="w-4 h-4" aria-hidden="true" />
                    Pay & Print <span className="tabular-nums">₹{totalCost.toFixed(2)}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Panel switcher — queue and preview never compete for the same space */}
          <div className="panel-tabs" role="tablist" aria-label="Upload workspace">
            <button
              type="button"
              role="tab"
              id="tab-queue"
              aria-selected={activePanel === 'queue'}
              aria-controls="panel-queue"
              className="panel-tab"
              onClick={() => setActivePanel('queue')}
            >
              <FileText className="w-4 h-4" aria-hidden="true" />
              Queue
              <span className="panel-tab-count">{documents.length}</span>
            </button>
            <button
              type="button"
              role="tab"
              id="tab-preview"
              aria-selected={activePanel === 'preview'}
              aria-controls="panel-preview"
              className="panel-tab"
              onClick={() => setActivePanel('preview')}
            >
              <Sparkles className="w-4 h-4" aria-hidden="true" />
              Print Preview
            </button>
          </div>

          {/* QUEUE PANEL */}
          {activePanel === 'queue' && (
            <div id="panel-queue" role="tabpanel" aria-labelledby="tab-queue" className="space-y-3 animate-fade-in">
              <div className="queue-section-head">
                <h2 className="queue-section-title">
                  {documents.length} {documents.length === 1 ? 'document' : 'documents'} queued
                </h2>
                <div className="queue-section-actions">
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() => setShowBatchControls((prev) => !prev)}
                    aria-expanded={showBatchControls}
                    aria-controls="batch-controls"
                  >
                    <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
                    Batch edit
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                    Add file
                  </button>
                </div>
              </div>

              {showBatchControls && (
                <div id="batch-controls" className="queue-batch-panel animate-fade-in">
                  <div className="queue-batch-field">
                    <span>Paper size — all files</span>
                    <select
                      className="form-select text-sm py-1.5 px-3"
                      onChange={(e) => applyBatchSetting('paper_size', e.target.value)}
                      defaultValue=""
                      aria-label="Apply paper size to all documents"
                    >
                      <option value="" disabled>Select paper size…</option>
                      <option value="A4">A4 (210 × 297 mm)</option>
                      <option value="A3">A3 (297 × 420 mm)</option>
                      <option value="A5">A5 (148 × 210 mm)</option>
                      <option value="Letter">Letter (8.5 × 11 in)</option>
                      <option value="Legal">Legal (8.5 × 14 in)</option>
                    </select>
                  </div>

                  <div className="queue-batch-field">
                    <span>Colour — all files</span>
                    <div className="queue-segment">
                      <button
                        type="button"
                        onClick={() => applyBatchSetting('color_mode', 'bw')}
                        aria-pressed={documents.every((d) => d.color_mode === 'bw')}
                      >
                        B&W <span className="tabular-nums">₹3/pg</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => applyBatchSetting('color_mode', 'color')}
                        aria-pressed={documents.every((d) => d.color_mode === 'color')}
                      >
                        Colour <span className="tabular-nums">₹9/pg</span>
                      </button>
                    </div>
                  </div>

                  <div className="queue-batch-field">
                    <span>Sides — all files</span>
                    <div className="queue-segment">
                      <button
                        type="button"
                        onClick={() => applyBatchSetting('double_sided', false)}
                        aria-pressed={documents.every((d) => !d.double_sided)}
                      >
                        Single
                      </button>
                      <button
                        type="button"
                        onClick={() => applyBatchSetting('double_sided', true)}
                        aria-pressed={documents.every((d) => d.double_sided)}
                      >
                        Duplex
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Document rows */}
              <div className="queue-list">
                {documents.map((docItem, idx) => {
                  const docId = docItem.id || docItem.client_id;
                  const price = calculateDocPrice(docItem);
                  const selectedPages = parsePageRange(docItem.page_range, docItem.total_pages || 1);

                  return (
                    <article key={docId} className="queue-item">
                      <span className="queue-index" aria-hidden="true">{idx + 1}</span>

                      <div className="queue-item-main">
                        <div className="queue-item-title">{docItem.title}</div>
                        <div className="queue-item-meta">
                          {docItem.file?.name} · {(docItem.file?.size / (1024 * 1024)).toFixed(2)} MB ·{' '}
                          {docItem.page_count_unverified ? (
                            <span className="spec-chip is-warning">Page count pending</span>
                          ) : (
                            <>
                              {docItem.total_pages} {docItem.total_pages === 1 ? 'page' : 'pages'}
                            </>
                          )}
                        </div>
                        <div className="queue-item-specs">
                          <span className="spec-chip">{docItem.paper_size}</span>
                          <span className="spec-chip">{docItem.color_mode === 'bw' ? 'B&W' : 'Colour'}</span>
                          <span className="spec-chip">{docItem.orientation}</span>
                          <span className="spec-chip">
                            {docItem.copies} {docItem.copies === 1 ? 'copy' : 'copies'}
                          </span>
                          <span className="spec-chip">
                            {docItem.double_sided ? 'Duplex' : 'Single-sided'}
                          </span>
                          <span className="spec-chip">
                            {docItem.page_range ? `Pages ${docItem.page_range}` : 'All pages'}
                          </span>
                          {!docItem.page_count_unverified && (
                            <span className="spec-chip">
                              {selectedPages.length} to print
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="queue-item-price">₹{price.toFixed(2)}</div>

                      <div className="queue-item-actions">
                        <button
                          type="button"
                          className="queue-action"
                          onClick={() => {
                            setReviewDocIndex(idx);
                            setShowReviewModal(true);
                          }}
                          title="Preview print"
                          aria-label={`Preview print for ${docItem.title}`}
                        >
                          <Eye className="w-4 h-4 text-blue-600" aria-hidden="true" />
                          Preview
                        </button>
                        <button
                          type="button"
                          className="queue-action"
                          onClick={() => setEditingDocId(docId)}
                          title="Configure settings and assign pages"
                          aria-label={`Configure settings for ${docItem.title}`}
                        >
                          <Settings className="w-4 h-4" aria-hidden="true" />
                          Settings
                        </button>
                        <button
                          type="button"
                          className="queue-action is-danger"
                          onClick={() => removeDocument(docItem.client_id)}
                          title="Remove document"
                          aria-label={`Remove document ${docItem.title}`}
                        >
                          <X className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}

          {/* PRINT PREVIEW PANEL */}
          {activePanel === 'preview' && (
            <div id="panel-preview" role="tabpanel" aria-labelledby="tab-preview" className="space-y-3 animate-fade-in">
              <div className="queue-section-head">
                <div>
                  <h2 className="queue-section-title">Live Print Simulation</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Real paper aspect ratios, B&W laser output, duplex flipping and page selection.
                  </p>
                </div>
                <div className="queue-section-actions">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => setShowReviewModal(true)}
                  >
                    <Maximize2 className="w-4 h-4" aria-hidden="true" />
                    Fullscreen
                  </button>
                </div>
              </div>

              <PrintReviewPanel
                document={documents[reviewDocIndex] || documents[0]}
                allDocuments={documents}
                onSelectDocument={(idx) => setReviewDocIndex(idx)}
                onUpdateSettings={updateDocumentSettings}
              />
            </div>
          )}

          {/* Extra bottom scroll clearance for mobile view */}
          <div className="h-10 sm:h-0" aria-hidden="true" />
        </div>
      )}

      {/* SETTINGS & PAGE ASSIGNMENT MODAL */}
      {editingDoc && (
        <DocumentSettingsModal
          document={editingDoc}
          printHosts={printHosts}
          onUpdate={updateDocumentSettings}
          onClose={() => setEditingDocId(null)}
        />
      )}

      {/* FULLSCREEN REVIEW MODAL */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in" role="dialog" aria-modal="true" aria-label="Print review">
          <div className="max-w-5xl w-full max-h-[96vh] sm:max-h-[92vh] overflow-hidden rounded-2xl shadow-2xl bg-slate-900">
            <PrintReviewPanel
              document={documents[reviewDocIndex] || documents[0]}
              allDocuments={documents}
              onSelectDocument={(idx) => setReviewDocIndex(idx)}
              onUpdateSettings={updateDocumentSettings}
              isModal={true}
              onClose={() => setShowReviewModal(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}