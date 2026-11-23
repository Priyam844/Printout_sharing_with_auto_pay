import { useState, useMemo } from 'react';
import { X, Settings, Check, FileText, Globe, Printer } from 'lucide-react';
import { parsePageRange } from '../utils/pdfHelper';

export function DocumentSettingsModal({
  document: doc,
  printHosts = [],
  onUpdate,
  onClose,
}) {
  const [formData, setFormData] = useState({
    title: doc.title || '',
    paper_size: doc.paper_size || 'A4',
    color_mode: doc.color_mode || 'bw',
    orientation: doc.orientation || 'portrait',
    copies: doc.copies || 1,
    double_sided: !!doc.double_sided,
    page_range: doc.page_range || '',
    print_host: doc.print_host || '',
  });

  const totalPages = doc.total_pages || 1;

  // Selected pages array
  const selectedPages = useMemo(() => {
    return parsePageRange(formData.page_range, totalPages);
  }, [formData.page_range, totalPages]);

  // Calculate estimated price
  const estimatedPrice = useMemo(() => {
    let base = formData.color_mode === 'bw' ? 3.0 : 9.0;
    if (['A3', 'Tabloid'].includes(formData.paper_size)) base *= 2.0;
    else if (formData.paper_size === 'Legal') base *= 1.4;

    const pageCount = Math.max(1, selectedPages.length);
    let cost = 0;
    if (formData.double_sided) {
      const sheets = Math.ceil(pageCount / 2);
      cost = sheets * 2 * base * 0.85;
    } else {
      cost = pageCount * base;
    }
    return Math.max(Math.round(cost * Math.max(1, formData.copies) * 100) / 100, 3.0);
  }, [formData, selectedPages]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }));
  };

  const handleTogglePage = (pageNum) => {
    let next;
    if (selectedPages.includes(pageNum)) {
      next = selectedPages.filter((p) => p !== pageNum);
    } else {
      next = [...selectedPages, pageNum].sort((a, b) => a - b);
    }
    setFormData((prev) => ({
      ...prev,
      page_range: next.join(', '),
    }));
  };

  const handlePresetPages = (preset) => {
    if (preset === 'all') {
      setFormData((prev) => ({ ...prev, page_range: '' }));
    } else if (preset === 'first') {
      setFormData((prev) => ({ ...prev, page_range: '1' }));
    } else if (preset === 'odd') {
      const odds = Array.from({ length: totalPages }, (_, i) => i + 1).filter((p) => p % 2 !== 0);
      setFormData((prev) => ({ ...prev, page_range: odds.join(', ') }));
    } else if (preset === 'even') {
      const evens = Array.from({ length: totalPages }, (_, i) => i + 1).filter((p) => p % 2 === 0);
      setFormData((prev) => ({ ...prev, page_range: evens.join(', ') }));
    }
  };

  const handleSave = (e) => {
    e.preventDefault();
    onUpdate(doc.id || doc.client_id, formData);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl max-w-2xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-gray-100 overflow-hidden">
        {/* Mobile Pull Handle Indicator */}
        <div className="sm:hidden pt-3 pb-1 flex justify-center bg-gray-50/80">
          <div className="w-12 h-1.5 rounded-full bg-gray-300" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-blue-600" />
            <h2 className="text-base sm:text-lg font-bold text-gray-900">Document Print Settings</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSave} className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {/* Document Title */}
          <div className="form-group">
            <label className="form-label font-bold text-xs uppercase tracking-wider text-gray-500">
              Document Title
            </label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              className="form-input text-sm font-semibold"
              placeholder="Enter document title"
              required
            />
          </div>

          {/* PAGE ASSIGNMENT SECTION */}
          <div className="p-4 bg-blue-50/70 rounded-2xl border border-blue-100 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs sm:text-sm font-bold text-blue-950 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-blue-600" />
                Page Assignment ({selectedPages.length} of {totalPages} pages selected)
              </label>
              <span className="text-xs font-semibold text-blue-700 bg-blue-100 px-2.5 py-0.5 rounded-full">
                {totalPages} {totalPages === 1 ? 'Page' : 'Pages'} Total
              </span>
            </div>

            {/* Quick Preset Buttons */}
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                className={`btn btn-sm ${!formData.page_range ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => handlePresetPages('all')}
              >
                All Pages (1-{totalPages})
              </button>
              <button
                type="button"
                className={`btn btn-sm ${formData.page_range === '1' ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => handlePresetPages('first')}
              >
                Page 1 Only
              </button>
              {totalPages > 2 && (
                <>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={() => handlePresetPages('odd')}
                  >
                    Odd Pages
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-secondary"
                    onClick={() => handlePresetPages('even')}
                  >
                    Even Pages
                  </button>
                </>
              )}
            </div>

            {/* Interactive Page Number Selector Chips */}
            {totalPages > 1 && totalPages <= 60 && (
              <div className="space-y-1.5 pt-1">
                <p className="text-[11px] text-gray-500 font-medium">Tap to include/exclude pages:</p>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto p-1.5 bg-white rounded-xl border border-gray-200">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((num) => {
                    const active = selectedPages.includes(num);
                    return (
                      <button
                        key={num}
                        type="button"
                        onClick={() => handleTogglePage(num)}
                        className={`w-9 h-9 rounded-lg text-xs font-bold transition-all flex items-center justify-center ${
                          active
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'bg-gray-100 text-gray-400 hover:bg-gray-200 line-through'
                        }`}
                        title={active ? `Page ${num} is included` : `Page ${num} is excluded`}
                      >
                        {num}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Manual Range Input */}
            <div className="pt-1">
              <input
                type="text"
                name="page_range"
                value={formData.page_range}
                onChange={handleChange}
                placeholder="Custom range e.g. 1-3, 5, 8-10 (leave empty for all)"
                className="form-input text-xs sm:text-sm bg-white"
              />
              <p className="text-[11px] text-gray-500 mt-1">
                Leave blank to print all pages, or type specific ranges like 1-5, 7.
              </p>
            </div>
          </div>

          {/* PRINT ATTRIBUTES GRID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label font-bold text-xs uppercase tracking-wider text-gray-500">Paper Size</label>
              <select
                name="paper_size"
                value={formData.paper_size}
                onChange={handleChange}
                className="form-select text-sm"
              >
                <option value="A4">A4 (210 × 297 mm)</option>
                <option value="A3">A3 (297 × 420 mm)</option>
                <option value="A5">A5 (148 × 210 mm)</option>
                <option value="Letter">Letter (8.5 × 11 in)</option>
                <option value="Legal">Legal (8.5 × 14 in)</option>
                <option value="Tabloid">Tabloid (11 × 17 in)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label font-bold text-xs uppercase tracking-wider text-gray-500">Color Mode</label>
              <select
                name="color_mode"
                value={formData.color_mode}
                onChange={handleChange}
                className="form-select text-sm"
              >
                <option value="bw">Black & White (Economical ₹3/pg)</option>
                <option value="color">Full Color (High Quality ₹9/pg)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label font-bold text-xs uppercase tracking-wider text-gray-500">Orientation</label>
              <select
                name="orientation"
                value={formData.orientation}
                onChange={handleChange}
                className="form-select text-sm"
              >
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label font-bold text-xs uppercase tracking-wider text-gray-500">Copies</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn btn-secondary px-3.5 py-2 font-bold text-base"
                  onClick={() =>
                    setFormData((prev) => ({ ...prev, copies: Math.max(1, prev.copies - 1) }))
                  }
                >
                  -
                </button>
                <input
                  type="number"
                  name="copies"
                  value={formData.copies}
                  onChange={handleChange}
                  min="1"
                  max="100"
                  className="form-input text-center font-bold text-base"
                />
                <button
                  type="button"
                  className="btn btn-secondary px-3.5 py-2 font-bold text-base"
                  onClick={() =>
                    setFormData((prev) => ({ ...prev, copies: Math.min(100, prev.copies + 1) }))
                  }
                >
                  +
                </button>
              </div>
            </div>
          </div>

          {/* DUPLEX & PRINT HOST */}
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3.5 bg-gray-50 rounded-xl border border-gray-200">
              <input
                type="checkbox"
                id="modal_double_sided"
                name="double_sided"
                checked={formData.double_sided}
                onChange={handleChange}
                className="w-5 h-5 text-blue-600 rounded"
              />
              <label htmlFor="modal_double_sided" className="text-sm font-semibold text-gray-800 cursor-pointer">
                Double-sided (Duplex) printing
                <span className="block text-xs font-normal text-gray-500">
                  Prints on both sides of each sheet (saves paper)
                </span>
              </label>
            </div>

            <div className="form-group">
              <label className="form-label font-bold text-xs uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-gray-400" />
                Target Print Location
              </label>
              <select
                name="print_host"
                value={formData.print_host}
                onChange={handleChange}
                className="form-select text-sm"
              >
                <option value="">Default Available Printer</option>
                {printHosts.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name} {h.location ? `(${h.location})` : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* PRICE ESTIMATE & FOOTER BUTTONS */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-100 bg-white sticky bottom-0">
            <div>
              <p className="text-[11px] text-gray-500 uppercase tracking-wider font-bold">Estimated Cost</p>
              <p className="text-xl sm:text-2xl font-black text-blue-600">₹{estimatedPrice.toFixed(2)}</p>
            </div>

            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="btn btn-secondary btn-sm sm:btn-md">
                Cancel
              </button>
              <button type="submit" className="btn btn-primary btn-sm sm:btn-md flex items-center gap-1.5">
                <Check className="w-4 h-4" />
                Apply Settings
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
