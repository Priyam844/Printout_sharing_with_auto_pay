import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import {
  FileText,
  Copy,
  Check,
  AlertCircle,
  Clock,
  CreditCard,
  Share2,
  ExternalLink,
  Printer,
  RefreshCw,
  Eye,
  Layers,
  Sparkles,
  ChevronLeft,
} from 'lucide-react';
import { documentApi } from '../utils/api';
import { useToast } from '../hooks/useToast';
import { PrintReviewPanel } from '../components/PrintReviewPanel';

const STATUS_CONFIG = {
  pending: { label: 'Pending Payment', icon: Clock, color: 'text-amber-600', bg: 'badge-pending' },
  paid: { label: 'Paid - Ready to Print', icon: Check, color: 'text-emerald-600', bg: 'badge-paid' },
  queued: { label: 'Queued for Printing', icon: Clock, color: 'text-purple-600', bg: 'badge-pending' },
  printing: { label: 'Printing...', icon: Printer, color: 'text-blue-600', bg: 'badge-printing' },
  printed: { label: 'Printed Successfully', icon: Check, color: 'text-emerald-600', bg: 'badge-printed' },
  failed: { label: 'Failed', icon: AlertCircle, color: 'text-red-600', bg: 'badge-failed' },
  cancelled: { label: 'Cancelled', icon: AlertCircle, color: 'text-slate-500', bg: 'badge-cancelled' },
};

export function SharePage() {
  const { token, batchId } = useParams();
  const navigate = useNavigate();
  const { success, error, info } = useToast();

  const [document, setDocument] = useState(null);
  const [batchData, setBatchData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [copied, setCopied] = useState(false);

  // Review Modal state
  const [reviewModalDoc, setReviewModalDoc] = useState(null);

  const isBatchMode = !!batchId;

  const fetchData = useCallback(async () => {
    try {
      if (isBatchMode) {
        const response = await documentApi.getBatch(batchId);
        setBatchData(response.data);
      } else {
        const response = await documentApi.getByToken(token);
        setDocument(response.data);
      }
    } catch (err) {
      error(err.message || 'Failed to load order');
    } finally {
      setLoading(false);
    }
  }, [batchId, token, isBatchMode, error]);

  useEffect(() => {
    fetchData();

    // Auto poll status every 5 seconds if pending/queued/printing
    const interval = setInterval(() => {
      fetchData();
    }, 5000);

    return () => clearInterval(interval);
  }, [fetchData]);

  const handleVerifyPayment = async () => {
    const transactionId = prompt('Enter your UPI Transaction ID (UTR / Reference Number):');
    if (!transactionId) return;

    setVerifying(true);
    try {
      if (isBatchMode) {
        const res = await documentApi.verifyBatchPayment(batchId, transactionId);
        success(res.data.message || 'Payment verified! All documents queued for printing.');
        fetchData();
      } else if (document) {
        const res = await documentApi.verifyPayment(document.id, transactionId);
        success('Payment verified! Document queued for printing.');
        setDocument(res.data.document);
        navigate(`/success/${document.id}`);
      }
    } catch (err) {
      error(err.message || 'Payment verification failed. Please check the UTR.');
    } finally {
      setVerifying(false);
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      success('Link copied to clipboard!');
    } catch {
      error('Failed to copy link');
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'PrintShare Order',
          text: `Document print order payment and tracking`,
          url: window.location.href,
        });
        return;
      } catch (e) {
        if (e.name !== 'AbortError') handleCopyLink();
      }
    } else {
      handleCopyLink();
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto py-20 text-center">
        <div className="spinner-lg mx-auto mb-4" />
        <p className="text-slate-500 font-medium">Loading document order details...</p>
      </div>
    );
  }

  // Active status & amounts
  const currentStatus = isBatchMode
    ? batchData?.status || 'pending'
    : document?.status || 'pending';

  const statusConfig = STATUS_CONFIG[currentStatus] || STATUS_CONFIG.pending;
  const StatusIcon = statusConfig.icon;

  const totalAmount = isBatchMode
    ? batchData?.total_amount || 0
    : document?.payment_amount || document?.price || 0;

  const upiQrData = isBatchMode
    ? batchData?.qr_code?.upi_string
    : document?.upi_qr_data;

  const docList = isBatchMode ? batchData?.documents || [] : document ? [document] : [];

  return (
    <div className="max-w-4xl mx-auto space-y-5 sm:space-y-6 pb-10 sm:pb-12">
      {/* Top Navigation & Share Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <Link to="/" className="btn btn-ghost btn-sm mb-1 inline-flex items-center gap-1 text-slate-500 hover:text-slate-900">
            <ChevronLeft className="w-4 h-4" />
            Upload More Documents
          </Link>
          <h1 className="page-title text-xl sm:text-2xl font-extrabold text-slate-900">
            {isBatchMode
              ? `Print Order Batch (${docList.length} Documents)`
              : document?.title || 'Document Print Order'}
          </h1>
          <p className="page-subtitle text-xs sm:text-sm text-slate-500">
            Track print status, pay with UPI, or share this link with anyone
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleShare}
            className="btn btn-secondary btn-sm flex items-center gap-1.5 min-h-[38px] px-3.5"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Share2 className="w-4 h-4" />}
            <span>{copied ? 'Copied Link!' : 'Share Order'}</span>
          </button>
        </div>
      </div>

      {/* STATUS & PAYMENT OVERVIEW (DESKTOP: 2 COLS | PHONE: STACKED) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Left 2 Cols: Order Status & Document Details */}
        <div className="md:col-span-2 space-y-4">
          <div className="card bg-white shadow-xs border border-slate-200">
            <div className="card-body p-5 sm:p-6 space-y-5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <StatusIcon className={`${statusConfig.color} w-6 h-6 shrink-0`} />
                  <span className={`badge ${statusConfig.bg} text-xs sm:text-sm font-bold`}>
                    {statusConfig.label}
                  </span>
                </div>
                <span className="text-xs text-slate-400 font-mono">
                  {isBatchMode ? `Batch: ${batchId.substring(0, 8)}...` : `ID: ${document?.id?.substring(0, 8)}...`}
                </span>
              </div>

              {/* Document List In Order */}
              <div className="space-y-3 pt-2">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Documents Included ({docList.length})
                </h3>

                <div className="divide-y divide-slate-100">
                  {docList.map((doc, idx) => (
                    <div
                      key={doc.id || idx}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-md bg-blue-50 text-blue-700 font-bold text-xs flex items-center justify-center shrink-0">
                            {idx + 1}
                          </span>
                          <span className="font-bold text-slate-900 text-sm truncate">{doc.title}</span>
                          <span className="text-[11px] text-slate-500 font-semibold shrink-0">
                            (📄 {doc.total_pages || 1} pgs)
                          </span>
                        </div>

                        <div className="flex flex-wrap gap-1 text-xs text-slate-500">
                          <span className="badge badge-pending text-[10px] py-0.5">{doc.paper_size}</span>
                          <span className="badge badge-paid text-[10px] py-0.5">
                            {doc.color_mode === 'bw' ? 'B&W' : 'Color'}
                          </span>
                          <span className="badge text-[10px] py-0.5 bg-slate-100 text-slate-700">
                            {doc.copies} copy
                          </span>
                          {doc.double_sided && (
                            <span className="badge text-[10px] py-0.5 bg-indigo-50 text-indigo-700">
                              Duplex
                            </span>
                          )}
                          <span className="badge text-[10px] py-0.5 bg-emerald-50 text-emerald-700 font-semibold">
                            Pages: {doc.page_range || 'All'}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 pt-1 sm:pt-0">
                        <span className="font-extrabold text-slate-900 text-sm">
                          ₹{Number(doc.payment_amount || doc.price || 0).toFixed(2)}
                        </span>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm text-xs flex items-center gap-1 min-h-[34px] py-1 px-2.5"
                          onClick={() => setReviewModalDoc(doc)}
                        >
                          <Eye className="w-3.5 h-3.5 text-blue-600" />
                          Review Print
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Col: Dynamic UPI QR Code & Instant Mobile Pay Button (Order First on Mobile) */}
        <div className="space-y-4 order-first md:order-last">
          <div className="card bg-white text-center shadow-md border-2 border-blue-50 overflow-hidden">
            <div className="card-body p-6 space-y-4">
              <div>
                <p className="text-[11px] uppercase font-bold text-slate-400 tracking-wider">
                  Total Payable Amount
                </p>
                <p className="text-3xl sm:text-4xl font-black text-blue-600 mt-0.5 tracking-tight">
                  ₹{Number(totalAmount).toFixed(2)}
                </p>
              </div>

              {/* Dynamic QR Code & Mobile Buttons */}
              {currentStatus === 'pending' ? (
                <div className="space-y-4">
                  {/* QR Code Container */}
                  <div className="p-3 bg-white border border-slate-200 rounded-2xl shadow-inner inline-block">
                    <QRCodeSVG
                      value={upiQrData || 'upi://pay'}
                      size={180}
                      level="M"
                      includeMargin={true}
                    />
                  </div>

                  <p className="text-xs text-slate-500">
                    Scan with any UPI app (GPay, PhonePe, Paytm, BHIM)
                  </p>

                  <div className="flex items-center justify-center gap-1.5 bg-slate-50 border border-slate-200/80 rounded-xl py-1.5 px-3 max-w-xs mx-auto">
                    <span className="text-[11px] text-slate-400 font-medium">UPI ID:</span>
                    <span className="text-xs font-mono font-bold text-slate-800">8617883252@okbizaxis</span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText('8617883252@okbizaxis');
                        success('UPI ID copied to clipboard!');
                      }}
                      className="p-1 text-slate-400 hover:text-blue-600 transition-colors ml-0.5"
                      title="Copy UPI ID"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Primary Pay Button on Phone */}
                  <a
                    href={upiQrData}
                    className="btn btn-primary w-full flex items-center justify-center gap-2 py-3 font-bold text-sm shadow-md shadow-blue-500/25 min-h-[46px]"
                  >
                    <CreditCard className="w-4 h-4" />
                    Pay via UPI App Directly
                  </a>

                  <button
                    type="button"
                    onClick={handleVerifyPayment}
                    disabled={verifying}
                    className="btn btn-secondary w-full text-xs font-semibold py-2.5 min-h-[40px]"
                  >
                    {verifying ? 'Verifying...' : 'Already paid? Enter UTR / Txn ID'}
                  </button>
                </div>
              ) : (
                <div className="py-6 space-y-2">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                    <Check className="w-6 h-6" />
                  </div>
                  <h4 className="font-bold text-slate-900 text-base">Payment Verified!</h4>
                  <p className="text-xs text-slate-500">
                    Your documents have been queued and sent to the physical print shop.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Extra bottom scroll clearance for mobile view */}
      <div className="h-10 sm:h-0" aria-hidden="true" />

      {/* PRINT SIMULATION REVIEW MODAL */}
      {reviewModalDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in">
          <div className="max-w-5xl w-full max-h-[96vh] sm:max-h-[92vh] overflow-hidden rounded-2xl shadow-2xl bg-slate-900">
            <PrintReviewPanel
              document={reviewModalDoc}
              allDocuments={docList}
              isModal={true}
              onClose={() => setReviewModalDoc(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
