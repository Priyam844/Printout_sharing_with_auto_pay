import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  FileText,
  Clock,
  CheckCircle,
  AlertCircle,
  Printer,
  X,
  ExternalLink,
  Copy,
  Trash2,
  Eye,
  SlidersHorizontal,
  CheckSquare,
  Square,
  Plus,
} from 'lucide-react';
import { documentApi } from '../utils/api';
import { useToast } from '../hooks/useToast';
import { PrintReviewPanel } from '../components/PrintReviewPanel';

const STATUS_CONFIG = {
  pending: { label: 'Pending', icon: Clock, badge: 'badge-pending' },
  paid: { label: 'Paid', icon: CheckCircle, badge: 'badge-paid' },
  queued: { label: 'Queued', icon: Clock, badge: 'badge-pending' },
  printing: { label: 'Printing', icon: Printer, badge: 'badge-printing' },
  printed: { label: 'Printed', icon: CheckCircle, badge: 'badge-printed' },
  failed: { label: 'Failed', icon: AlertCircle, badge: 'badge-failed' },
  cancelled: { label: 'Cancelled', icon: X, badge: 'badge-cancelled' },
};

const formatDate = (dateString) => {
  if (!dateString) return '-';
  return new Date(dateString).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
};

export function DocumentsPage() {
  const { success, error, info } = useToast();

  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(null);

  const [selectedIds, setSelectedIds] = useState([]);
  const [reviewDoc, setReviewDoc] = useState(null);
  const [batchUpdating, setBatchUpdating] = useState(false);

  const fetchDocuments = useCallback(async () => {
    try {
      const response = await documentApi.list();
      setDocuments(response.data.results || response.data || []);
    } catch (err) {
      error(err.message || 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [error]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  const handleCopyLink = async (url) => {
    try {
      await navigator.clipboard.writeText(url);
      success('Share link copied!');
    } catch {
      error('Failed to copy link');
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to cancel this document?')) return;

    setDeleting(id);
    try {
      await documentApi.cancel(id);
      success('Document cancelled');
      setDocuments((prev) =>
        prev.map((d) => (d.id === id ? { ...d, status: 'cancelled' } : d))
      );
    } catch (err) {
      error(err.message || 'Failed to cancel document');
    } finally {
      setDeleting(null);
    }
  };

  const toggleSelect = (id) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === documents.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(documents.map((d) => d.id));
    }
  };

  const handleBatchUpdate = async (settingKey, settingVal) => {
    if (selectedIds.length === 0) return;
    setBatchUpdating(true);
    try {
      const res = await documentApi.batchUpdate({
        ids: selectedIds,
        [settingKey]: settingVal,
      });
      success(`Updated ${res.data.updated_count || selectedIds.length} document(s).`);
      fetchDocuments();
    } catch (err) {
      error(err.message || 'Batch update failed');
    } finally {
      setBatchUpdating(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto py-20 text-center">
        <div className="spinner-lg mx-auto mb-4" />
        <p className="text-slate-500 font-medium">Loading documents...</p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5 sm:space-y-6 pb-10 sm:pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="page-title text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Document Management
          </h1>
          <p className="page-subtitle text-xs sm:text-sm text-slate-600 mt-1">
            Review print outputs, batch update print settings, or track orders
          </p>
        </div>
        <Link to="/" className="btn btn-primary flex items-center gap-2 self-start sm:self-auto shadow-md shadow-blue-500/20">
          <Plus className="w-4 h-4" />
          Upload New Documents
        </Link>
      </div>

      {/* BATCH ACTION BAR IF DOCUMENTS SELECTED */}
      {documents.length > 0 && (
        <div className="p-3.5 sm:p-4 bg-white rounded-2xl shadow-sm border border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="flex items-center gap-2 text-xs sm:text-sm font-bold text-slate-800 hover:text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded"
              aria-label={selectedIds.length === documents.length && documents.length > 0 ? 'Deselect all documents' : 'Select all documents'}
            >
              {selectedIds.length === documents.length && documents.length > 0 ? (
                <CheckSquare className="w-5 h-5 text-blue-600" />
              ) : (
                <Square className="w-5 h-5 text-slate-300" />
              )}
              <span>
                {selectedIds.length > 0
                  ? `${selectedIds.length} Selected`
                  : 'Select All Documents'}
              </span>
            </button>
          </div>

          {selectedIds.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
              <span className="text-xs font-semibold text-slate-400 shrink-0 mr-1">Batch:</span>

              <select
                className="form-select text-xs py-1.5 px-2.5 bg-slate-50 border-slate-300 rounded-lg shrink-0 font-semibold"
                onChange={(e) => handleBatchUpdate('paper_size', e.target.value)}
                defaultValue=""
                disabled={batchUpdating}
                aria-label="Change paper size for selected documents"
              >
                <option value="" disabled>Change Paper Size…</option>
                <option value="A4">Set to A4</option>
                <option value="A3">Set to A3</option>
                <option value="Letter">Set to Letter</option>
                <option value="Legal">Set to Legal</option>
              </select>

              <button
                type="button"
                className="btn btn-secondary btn-sm shrink-0 text-xs py-1.5"
                onClick={() => handleBatchUpdate('color_mode', 'bw')}
                disabled={batchUpdating}
              >
                Set B&W
              </button>

              <button
                type="button"
                className="btn btn-secondary btn-sm shrink-0 text-xs py-1.5"
                onClick={() => handleBatchUpdate('color_mode', 'color')}
                disabled={batchUpdating}
              >
                Set Color
              </button>

              <button
                type="button"
                className="btn btn-secondary btn-sm shrink-0 text-xs py-1.5"
                onClick={() => handleBatchUpdate('double_sided', true)}
                disabled={batchUpdating}
              >
                Make Duplex
              </button>
            </div>
          )}
        </div>
      )}

      {/* DOCUMENT LIST */}
      {documents.length === 0 ? (
        <div className="card bg-white border border-slate-200">
          <div className="empty-state py-16 text-center">
            <FileText className="empty-icon text-slate-300 w-16 h-16 mx-auto mb-4" aria-hidden="true" />
            <h2 className="empty-title text-lg font-bold text-slate-900">No Documents Found</h2>
            <p className="empty-description text-slate-500 text-xs sm:text-sm mt-1 mb-6 max-w-md mx-auto">
              Upload PDFs, images, or docs to preview print settings, estimate UPI cost, and queue print jobs.
            </p>
            <Link to="/" className="btn btn-primary inline-flex items-center gap-2">
              <Plus className="w-4 h-4" />
              Upload Now
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3 sm:space-y-4">
          {documents.map((doc) => {
            const statusConfig = STATUS_CONFIG[doc.status] || STATUS_CONFIG.pending;
            const StatusIcon = statusConfig.icon;
            const shareUrl = `${window.location.origin}/share/${doc.share_token}`;
            const isSelected = selectedIds.includes(doc.id);

            return (
              <div
                key={doc.id}
                className={`document-card bg-white p-4 sm:p-5 rounded-2xl shadow-sm border transition-all ${
                  isSelected ? 'border-blue-500 bg-blue-50/20' : 'border-slate-200 hover:border-blue-300'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    {/* Select Checkbox */}
                    <button
                      type="button"
                      onClick={() => toggleSelect(doc.id)}
                      className="mt-0.5 text-slate-400 hover:text-blue-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 rounded shrink-0"
                      aria-label={`Select document ${doc.title}`}
                    >
                      {isSelected ? (
                        <CheckSquare className="w-5 h-5 text-blue-600" />
                      ) : (
                        <Square className="w-5 h-5 text-slate-300" />
                      )}
                    </button>

                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="document-title font-bold text-sm sm:text-base text-slate-900 truncate">
                          {doc.title}
                        </h3>
                        <span className="text-[11px] bg-slate-100 text-slate-700 font-semibold px-2 py-0.5 rounded-full">
                          📄 {doc.total_pages || 1} pgs
                        </span>
                      </div>

                      <div className="document-meta flex flex-wrap gap-2 text-xs text-slate-500">
                        <span className="flex items-center gap-1 truncate max-w-xs">
                          <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                          {doc.original_filename}
                        </span>
                        <span className="flex items-center gap-1 shrink-0">
                          <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" aria-hidden="true" />
                          {formatDate(doc.created_at)}
                        </span>
                        <span className="badge badge-pending text-[10px] py-0.5">{doc.paper_size}</span>
                        <span className="badge badge-paid text-[10px] py-0.5 font-semibold">
                          {doc.color_mode === 'bw' ? 'B&W' : 'Color'}
                        </span>
                        <span className="badge text-[10px] py-0.5 bg-slate-100 text-slate-700">
                          {doc.copies}x {doc.double_sided ? '• Duplex' : ''}
                        </span>
                        {doc.page_range && (
                          <span className="badge text-[10px] py-0.5 bg-emerald-50 text-emerald-700 font-semibold">
                            Pages: {doc.page_range}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Price & Status */}
                  <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                    <div className="text-left sm:text-right">
                      <p className="text-[10px] uppercase font-bold text-slate-400">Price</p>
                      <p className="text-base font-extrabold text-slate-900 tabular-nums">
                        ₹{Number(doc.payment_amount || doc.price || 0).toFixed(2)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <StatusIcon className={`w-4 h-4 ${statusConfig.badge}`} aria-hidden="true" />
                      <span className={`badge ${statusConfig.badge} text-xs py-0.5 font-bold`}>
                        {statusConfig.label}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Actions Row */}
                <div className="document-actions flex items-center gap-2 pt-3 border-t border-slate-100 mt-3">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm text-xs flex items-center gap-1.5 py-1.5 px-3 min-h-[36px]"
                    onClick={() => setReviewDoc(doc)}
                    aria-label={`Review print for ${doc.title}`}
                  >
                    <Eye className="w-3.5 h-3.5 text-blue-600" />
                    Review Print
                  </button>

                  <Link
                    to={doc.order_batch_id ? `/share/batch/${doc.order_batch_id}` : `/share/${doc.share_token}`}
                    className="btn btn-primary btn-sm flex-1 flex items-center justify-center gap-1.5 text-xs py-1.5 px-3 min-h-[36px]"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Order / Pay Link
                  </Link>

                  <button
                    onClick={() => handleCopyLink(shareUrl)}
                    className="btn btn-secondary btn-sm p-2 min-h-[36px] min-w-[36px] flex items-center justify-center"
                    title="Copy share link"
                    aria-label="Copy share link"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>

                  {['pending', 'paid'].includes(doc.status) && (
                    <button
                      onClick={() => handleDelete(doc.id)}
                      disabled={deleting === doc.id}
                      className="btn btn-ghost btn-sm text-red-600 hover:bg-red-50 p-2 min-h-[36px] min-w-[36px] flex items-center justify-center"
                      title="Cancel document"
                      aria-label="Cancel document"
                    >
                      {deleting === doc.id ? (
                        <span className="spinner" aria-hidden="true" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* PRINT SIMULATION REVIEW MODAL */}
      {reviewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/80 backdrop-blur-md animate-fade-in" role="dialog" aria-modal="true" aria-label="Print review">
          <div className="max-w-5xl w-full max-h-[96vh] sm:max-h-[92vh] overflow-hidden rounded-2xl shadow-2xl bg-slate-900">
            <PrintReviewPanel
              document={reviewDoc}
              allDocuments={documents}
              isModal={true}
              onClose={() => setReviewDoc(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}