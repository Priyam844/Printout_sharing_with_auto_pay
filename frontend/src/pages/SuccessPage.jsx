import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { CheckCircle, Printer, FileText, CreditCard, ExternalLink } from 'lucide-react';
import { documentApi } from '../utils/api';
import { useToast } from '../hooks/useToast';

export function SuccessPage() {
  const { id } = useParams();
  const { error } = useToast();

  const [document, setDocument] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDocument = async () => {
      try {
        const response = await documentApi.get(id);
        setDocument(response.data);
      } catch (err) {
        error(err.message || 'Failed to load document');
      } finally {
        setLoading(false);
      }
    };

    fetchDocument();
  }, [id, error]);

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="card" style={{ minHeight: '300px' }}>
          <div className="card-body flex flex-col items-center justify-center">
            <div className="spinner-lg" aria-hidden="true" />
            <p className="mt-4 text-gray-500">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!document) {
    return (
      <div className="max-w-2xl mx-auto text-center">
        <div className="card">
          <div className="card-body py-12">
            <FileText className="w-12 h-12 text-red-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Document Not Found</h2>
            <Link to="/" className="btn btn-primary mt-4">
              <ExternalLink className="w-4 h-4 mr-2" />
              Upload New Document
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const isPrinted = document.status === 'printed';

  return (
    <div className="max-w-2xl mx-auto">
      <div className="card mb-6">
        <div className="card-body text-center py-10">
          <div className={`w-20 h-20 mx-auto mb-6 rounded-full flex items-center justify-center ${isPrinted ? 'bg-green-50' : 'bg-blue-50'}`}>
            {isPrinted ? (
              <CheckCircle className="w-10 h-10 text-green-600" aria-hidden="true" />
            ) : (
              <Printer className="w-10 h-10 text-blue-600 animate-pulse" aria-hidden="true" />
            )}
          </div>

          <h1 className="text-3xl font-bold text-gray-900 mb-3">
            {isPrinted ? 'Document Printed!' : 'Payment Verified!'}
          </h1>

          <p className="text-lg text-gray-500 mb-6">
            {isPrinted
              ? 'Your document has been successfully printed and is ready for collection.'
              : 'Your payment has been confirmed. The document is now being sent to the printer.'}
          </p>

          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-50 border border-gray-300">
            <FileText className="w-5 h-5 text-blue-600" aria-hidden="true" />
            <span className="font-medium text-gray-900">{document.title}</span>
          </div>
        </div>
      </div>

      <div className="card mb-6">
        <div className="card-header">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <Printer className="w-5 h-5" aria-hidden="true" />
            Print Details
          </h2>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500">Paper Size</p>
              <p className="font-medium text-gray-900">{document.paper_size}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500">Color Mode</p>
              <p className="font-medium text-gray-900 capitalize">{document.color_mode === 'bw' ? 'Black & White' : 'Color'}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500">Orientation</p>
              <p className="font-medium text-gray-900 capitalize">{document.orientation}</p>
            </div>
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-500">Copies</p>
              <p className="font-medium text-gray-900">{document.copies}</p>
            </div>
          </div>

          {document.double_sided && (
            <div className="mt-4 p-4 bg-green-50 rounded-lg flex items-center gap-2 text-sm">
              <CheckCircle className="w-4 h-4 text-green-600" aria-hidden="true" />
              <span className="text-green-600">Double-sided printing enabled</span>
            </div>
          )}

          {document.page_range && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg flex items-center gap-2 text-sm text-gray-500">
              <FileText className="w-4 h-4" aria-hidden="true" />
              Page range: {document.page_range}
            </div>
          )}

          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-blue-600" aria-hidden="true" />
                <span className="font-medium text-blue-600">Amount Paid</span>
              </div>
              <span className="text-xl font-bold text-blue-600">₹{document.payment_amount}</span>
            </div>
            {document.payment_transaction_id && (
              <p className="mt-2 text-sm text-gray-500">
                Transaction ID: <code className="font-mono">{document.payment_transaction_id}</code>
              </p>
            )}
            {document.payment_verified_at && (
              <p className="mt-1 text-sm text-gray-500">
                Verified: {new Date(document.payment_verified_at).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      </div>

      {isPrinted && document.printed_at && (
        <div className="card mb-6">
          <div className="card-body">
            <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-600 flex-shrink-0" aria-hidden="true" />
              <div>
                <p className="font-medium text-green-600">Print Completed</p>
                <p className="text-sm text-gray-500">
                  Printed on {new Date(document.printed_at).toLocaleString()}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="action-row">
        <Link to={`/share/${document.share_token}`} className="btn btn-secondary">
          <ExternalLink className="w-4 h-4 mr-2" />
          View Share Page
        </Link>
        <Link to="/" className="btn btn-primary">
          <FileText className="w-4 h-4 mr-2" />
          Upload Another
        </Link>
      </div>
    </div>
  );
}