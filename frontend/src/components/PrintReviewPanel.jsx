import { useState, useEffect, useRef, useMemo } from 'react';
import {
  Printer,
  Grid,
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCw,
  Eye,
  Layers,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  AlertCircle,
  FileText,
  Sliders,
  Palette,
  ExternalLink,
  BookOpen,
  Split,
  FileCheck,
  Check,
  Loader2,
  Maximize,
  Minimize2,
} from 'lucide-react';
import { loadPdfDocument, renderPdfPageToCanvas, parsePageRange } from '../utils/pdfHelper';
import './PrintReviewPanel.css';

export function PrintReviewPanel({
  document: activeDoc,
  allDocuments = [],
  onSelectDocument,
  onUpdateSettings,
  isModal = false,
  onClose,
}) {
  const [currentDocIndex, setCurrentDocIndex] = useState(0);
  const [pdfDoc, setPdfDoc] = useState(null);
  const [totalPages, setTotalPages] = useState(1);
  const [loadingDoc, setLoadingDoc] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [textContent, setTextContent] = useState('');

  // Primary View Mode: 'print' (Print Simulation) | 'compare' (Side-by-Side Color vs B&W) | 'reader' (Open Document View)
  const [primaryViewMode, setPrimaryViewMode] = useState('print');

  // Sub-view in Print Simulator: 'grid' (All pages) | 'focus' (Single page stepper) | 'sheet' (Duplex Front/Back)
  const [subViewMode, setSubViewMode] = useState('grid');
  const [activePageIndex, setActivePageIndex] = useState(1);
  const [zoomLevel, setZoomLevel] = useState(1.0);

  // Print simulation guides
  const [showSafeMargin, setShowSafeMargin] = useState(true);
  const [showHolePunch, setShowHolePunch] = useState(false);
  const [showStaple, setShowStaple] = useState(false);
  const [isFlipped, setIsFlipped] = useState(false);

  // The active document to display
  const doc = useMemo(() => {
    if (allDocuments && allDocuments.length > 0) {
      return allDocuments[currentDocIndex] || allDocuments[0];
    }
    return activeDoc || {};
  }, [allDocuments, currentDocIndex, activeDoc]);

  // Document ID for settings updates
  const docId = doc.id || doc.client_id;

  // Selected pages array (1-indexed)
  const selectedPages = useMemo(() => {
    return parsePageRange(doc.page_range, totalPages);
  }, [doc.page_range, totalPages]);

  // Document file URL or Object URL
  const docUrl = useMemo(() => {
    if (doc.file instanceof File || doc.file instanceof Blob) {
      return URL.createObjectURL(doc.file);
    }
    return doc.file_url || null;
  }, [doc.file, doc.file_url]);

  // Clean up object URL on change
  useEffect(() => {
    return () => {
      if (docUrl && docUrl.startsWith('blob:')) {
        URL.revokeObjectURL(docUrl);
      }
    };
  }, [docUrl]);

  const isPdf = useMemo(() => {
    return (
      (doc.file && (doc.file.type === 'application/pdf' || doc.file.type === 'application/x-pdf' || /\.pdf$/i.test(doc.file.name))) ||
      (doc.mime_type && doc.mime_type.includes('pdf')) ||
      (doc.original_filename && /\.pdf$/i.test(doc.original_filename)) ||
      (typeof doc.file_url === 'string' && /\.pdf(\?|$)/i.test(doc.file_url))
    );
  }, [doc.file, doc.mime_type, doc.original_filename, doc.file_url]);

  const isText = useMemo(() => {
    return (
      (doc.file && (doc.file.type === 'text/plain' || /\.txt$/i.test(doc.file.name))) ||
      (doc.original_filename && /\.txt$/i.test(doc.original_filename))
    );
  }, [doc.file, doc.original_filename]);

  const isImage = useMemo(() => {
    return (
      (doc.file && doc.file.type && doc.file.type.startsWith('image/')) ||
      (doc.mime_type && doc.mime_type.startsWith('image/')) ||
      (doc.original_filename && /\.(jpe?g|png|webp|svg)$/i.test(doc.original_filename))
    );
  }, [doc.file, doc.mime_type, doc.original_filename]);

  // Load document content whenever file or url changes
  useEffect(() => {
    let isCancelled = false;
    setLoadingDoc(true);
    setLoadError(null);
    setPdfDoc(null);
    setTextContent('');

    const source = doc.file || doc.file_url;
    if (!source) {
      setTotalPages(doc.total_pages || 1);
      setLoadingDoc(false);
      return;
    }

    if (isPdf) {
      loadPdfDocument(source)
        .then((pdf) => {
          if (!isCancelled) {
            setPdfDoc(pdf);
            setTotalPages(pdf.numPages);
            if (onUpdateSettings && (!doc.total_pages || doc.total_pages !== pdf.numPages)) {
              onUpdateSettings(docId, { total_pages: pdf.numPages });
            }
          }
        })
        .catch((err) => {
          console.warn('PDF load error:', err);
          if (!isCancelled) {
            setLoadError('PDF rendered via fallback viewer.');
            setTotalPages(doc.total_pages || 1);
          }
        })
        .finally(() => {
          if (!isCancelled) setLoadingDoc(false);
        });
    } else if (isText && doc.file instanceof File) {
      doc.file
        .text()
        .then((txt) => {
          if (!isCancelled) setTextContent(txt);
        })
        .catch(() => {})
        .finally(() => {
          if (!isCancelled) {
            setTotalPages(1);
            setLoadingDoc(false);
          }
        });
    } else {
      setTotalPages(1);
      setLoadingDoc(false);
    }

    return () => {
      isCancelled = true;
    };
  }, [doc.file, doc.file_url, isPdf, isText, docId]);

  // Handler to update setting directly from preview panel
  const handleSettingChange = (key, val) => {
    if (onUpdateSettings) {
      onUpdateSettings(docId, { [key]: val });
    }
  };

  // Open native document in new tab
  const handleOpenRawDocument = () => {
    if (docUrl) {
      window.open(docUrl, '_blank');
    }
  };

  // Quick page presets
  const handlePagePreset = (preset) => {
    if (!onUpdateSettings) return;
    if (preset === 'all') {
      onUpdateSettings(docId, { page_range: '' });
    } else if (preset === 'first') {
      onUpdateSettings(docId, { page_range: '1' });
    } else if (preset === 'odd') {
      const odds = Array.from({ length: totalPages }, (_, i) => i + 1).filter((p) => p % 2 !== 0);
      onUpdateSettings(docId, { page_range: odds.join(', ') });
    } else if (preset === 'even') {
      const evens = Array.from({ length: totalPages }, (_, i) => i + 1).filter((p) => p % 2 === 0);
      onUpdateSettings(docId, { page_range: evens.join(', ') });
    }
  };

  // Paper dimensions and styles
  const paperSize = doc.paper_size || 'A4';
  const colorMode = doc.color_mode || 'bw';
  const orientation = doc.orientation || 'portrait';
  const isDoubleSided = !!doc.double_sided;

  // Base sheet width scaled by zoom
  const baseWidth = (orientation === 'landscape' ? 360 : 260) * zoomLevel;

  return (
    <div className={`print-review-wrapper ${isModal ? 'modal-mode' : ''}`}>
      {/* 1. TOP TOOLBAR: Mode Switchers */}
      <div className="review-toolbar">
        <div className="review-toolbar-group review-toolbar-modes" role="group" aria-label="View modes">
          <button
            type="button"
            className={`toolbar-btn ${primaryViewMode === 'print' ? 'active' : ''}`}
            onClick={() => setPrimaryViewMode('print')}
            title="See how it will look printed on physical paper"
            aria-pressed={primaryViewMode === 'print'}
          >
            <Printer className="w-4 h-4" aria-hidden="true" />
            Print Simulator
          </button>
          <button
            type="button"
            className={`toolbar-btn ${primaryViewMode === 'compare' ? 'active' : ''}`}
            onClick={() => setPrimaryViewMode('compare')}
            title="Compare Original Color vs Black & White Print"
            aria-pressed={primaryViewMode === 'compare'}
          >
            <Split className="w-4 h-4" aria-hidden="true" />
            Compare B&W vs Color
          </button>
          <button
            type="button"
            className={`toolbar-btn ${primaryViewMode === 'reader' ? 'active' : ''}`}
            onClick={() => setPrimaryViewMode('reader')}
            title="Open the real document to read it"
            aria-pressed={primaryViewMode === 'reader'}
          >
            <BookOpen className="w-4 h-4" aria-hidden="true" />
            Open Document
          </button>
        </div>

        <div className="toolbar-divider" aria-hidden="true" />

        <div className="review-toolbar-group review-toolbar-views" role="group" aria-label="Print simulator views and overlays">
          {primaryViewMode === 'print' && (
            <>
              <button
                type="button"
                className={`toolbar-btn ${subViewMode === 'grid' ? 'active' : ''}`}
                onClick={() => setSubViewMode('grid')}
                title="Grid View (All Pages)"
                aria-pressed={subViewMode === 'grid'}
              >
                <Grid className="w-4 h-4" aria-hidden="true" />
                Grid
              </button>
              <button
                type="button"
                className={`toolbar-btn ${subViewMode === 'focus' ? 'active' : ''}`}
                onClick={() => setSubViewMode('focus')}
                title="Single Page Stepper"
                aria-pressed={subViewMode === 'focus'}
              >
                <Layers className="w-4 h-4" aria-hidden="true" />
                Focus
              </button>
              {isDoubleSided && (
                <button
                  type="button"
                  className={`toolbar-btn ${subViewMode === 'sheet' ? 'active' : ''}`}
                  onClick={() => setSubViewMode('sheet')}
                  title="Duplex Front & Back Sheet"
                  aria-pressed={subViewMode === 'sheet'}
                >
                  <RotateCw className="w-4 h-4" aria-hidden="true" />
                  Duplex Sheet
                </button>
              )}

              <div className="toolbar-divider" aria-hidden="true" />

              {/* Overlay Toggles - use dark surface with pressed state */}
              <button
                type="button"
                className={`toolbar-btn toggle-btn ${showSafeMargin ? 'pressed' : ''}`}
                onClick={() => setShowSafeMargin(!showSafeMargin)}
                title="Toggle 5mm Printable Safe Margin Guide"
                aria-pressed={showSafeMargin}
              >
                <Maximize2 className="w-4 h-4" aria-hidden="true" />
                Safe Zone
              </button>
              <button
                type="button"
                className={`toolbar-btn toggle-btn ${showHolePunch ? 'pressed' : ''}`}
                onClick={() => setShowHolePunch(!showHolePunch)}
                title="Toggle Hole Punch Guide"
                aria-pressed={showHolePunch}
              >
                <FileCheck className="w-4 h-4" aria-hidden="true" />
                Punch
              </button>
              <button
                type="button"
                className={`toolbar-btn toggle-btn ${showStaple ? 'pressed' : ''}`}
                onClick={() => setShowStaple(!showStaple)}
                title="Toggle Staple Marker"
                aria-pressed={showStaple}
              >
                <Check className="w-4 h-4" aria-hidden="true" />
                Staple
              </button>
            </>
          )}

          <div className="toolbar-divider" aria-hidden="true" />

          {/* Zoom Controls */}
          <div className="zoom-control" role="group" aria-label="Zoom controls">
            <button
              type="button"
              className="toolbar-btn icon-btn"
              onClick={() => setZoomLevel((z) => Math.max(0.6, z - 0.15))}
              disabled={zoomLevel <= 0.6}
              title="Zoom Out"
              aria-label="Zoom out"
            >
              <ZoomOut className="w-4 h-4" aria-hidden="true" />
            </button>
            <span className="zoom-level" aria-live="polite">
              {Math.round(zoomLevel * 100)}%
            </span>
            <button
              type="button"
              className="toolbar-btn icon-btn"
              onClick={() => setZoomLevel((z) => Math.min(1.8, z + 0.15))}
              disabled={zoomLevel >= 1.8}
              title="Zoom In"
              aria-label="Zoom in"
            >
              <ZoomIn className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <div className="toolbar-divider" aria-hidden="true" />

          {/* Document Actions */}
          {docUrl && (
            <button
              type="button"
              className="toolbar-btn secondary-btn"
              onClick={handleOpenRawDocument}
              title="Open original document in browser tab"
            >
              <ExternalLink className="w-4 h-4" aria-hidden="true" />
              Open in Tab
            </button>
          )}

          {isModal && onClose && (
            <button
              type="button"
              className="toolbar-btn danger-btn"
              onClick={onClose}
              aria-label="Close simulator"
            >
              <Minimize2 className="w-4 h-4" aria-hidden="true" />
              Close
            </button>
          )}
        </div>
      </div>

      {/* 2. LIVE SETTINGS DOCK (Instant options for B&W, Paper Size, Orientation, Duplex, Pages) */}
      <div className="review-settings-dock">
        {/* Color Mode Option */}
        <div className="dock-section">
          <span className="dock-label">
            <Palette className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
            Color Option:
          </span>
          <div className="dock-pill-group">
            <button
              type="button"
              className={`dock-pill-btn ${colorMode === 'bw' ? 'active' : ''}`}
              onClick={() => handleSettingChange('color_mode', 'bw')}
              title="See how it looks printed in Black & White"
              aria-pressed={colorMode === 'bw'}
            >
              🖤 Black & White <span className="price-tag">(₹3/pg)</span>
            </button>
            <button
              type="button"
              className={`dock-pill-btn ${colorMode === 'color' ? 'active' : ''}`}
              onClick={() => handleSettingChange('color_mode', 'color')}
              title="See how it looks printed in Color"
              aria-pressed={colorMode === 'color'}
            >
              🎨 Full Color <span className="price-tag">(₹9/pg)</span>
            </button>
          </div>
        </div>

        {/* Paper Size Option */}
        <div className="dock-section">
          <span className="dock-label">Paper Size:</span>
          <select
            className="dock-select"
            value={paperSize}
            onChange={(e) => handleSettingChange('paper_size', e.target.value)}
            aria-label="Select paper size"
          >
            <option value="A4">A4 (210 × 297 mm)</option>
            <option value="A3">A3 (297 × 420 mm)</option>
            <option value="A5">A5 (148 × 210 mm)</option>
            <option value="Letter">Letter (8.5 × 11 in)</option>
            <option value="Legal">Legal (8.5 × 14 in)</option>
            <option value="Tabloid">Tabloid (11 × 17 in)</option>
          </select>
        </div>

        {/* Orientation Option */}
        <div className="dock-section">
          <span className="dock-label">Orientation:</span>
          <div className="dock-pill-group">
            <button
              type="button"
              className={`dock-pill-btn ${orientation === 'portrait' ? 'active' : ''}`}
              onClick={() => handleSettingChange('orientation', 'portrait')}
              title="Portrait Mode"
              aria-pressed={orientation === 'portrait'}
            >
              <Maximize className="w-3.5 h-3.5" aria-hidden="true" />
              Portrait
            </button>
            <button
              type="button"
              className={`dock-pill-btn ${orientation === 'landscape' ? 'active' : ''}`}
              onClick={() => handleSettingChange('orientation', 'landscape')}
              title="Landscape Mode"
              aria-pressed={orientation === 'landscape'}
            >
              <Minimize2 className="w-3.5 h-3.5" aria-hidden="true" />
              Landscape
            </button>
          </div>
        </div>

        {/* Duplex Option */}
        <div className="dock-section">
          <span className="dock-label">Sides:</span>
          <div className="dock-pill-group">
            <button
              type="button"
              className={`dock-pill-btn ${!isDoubleSided ? 'active' : ''}`}
              onClick={() => handleSettingChange('double_sided', false)}
              aria-pressed={!isDoubleSided}
            >
              Single-Sided
            </button>
            <button
              type="button"
              className={`dock-pill-btn ${isDoubleSided ? 'active' : ''}`}
              onClick={() => handleSettingChange('double_sided', true)}
              aria-pressed={isDoubleSided}
            >
              Double-Sided
            </button>
          </div>
        </div>

        {/* Page Range Quick Presets */}
        <div className="dock-section dock-pages-section">
          <span className="dock-label">Pages:</span>
          <div className="dock-pill-group dock-pill-presets">
            <button
              type="button"
              className={`dock-pill-btn ${!doc.page_range ? 'active' : ''}`}
              onClick={() => handlePagePreset('all')}
              aria-pressed={!doc.page_range}
            >
              All ({totalPages})
            </button>
            <button
              type="button"
              className={`dock-pill-btn ${doc.page_range === '1' ? 'active' : ''}`}
              onClick={() => handlePagePreset('first')}
              aria-pressed={doc.page_range === '1'}
            >
              Page 1 Only
            </button>
            {totalPages > 2 && (
              <>
                <button
                  type="button"
                  className="dock-pill-btn"
                  onClick={() => handlePagePreset('odd')}
                >
                  Odd
                </button>
                <button
                  type="button"
                  className="dock-pill-btn"
                  onClick={() => handlePagePreset('even')}
                >
                  Even
                </button>
              </>
            )}
          </div>
          <input
            type="text"
            className="dock-select dock-range-input"
            placeholder="e.g. 1-3, 5"
            value={doc.page_range || ''}
            onChange={(e) => handleSettingChange('page_range', e.target.value)}
            title="Type custom page range"
            aria-label="Custom page range"
          />
        </div>
      </div>

      {/* Multiple Document Selector Tabs */}
      {allDocuments && allDocuments.length > 1 && (
        <div className="review-doc-tabs" role="tablist" aria-label="Documents">
          {allDocuments.map((d, idx) => (
            <button
              key={d.id || d.client_id || idx}
              type="button"
              role="tab"
              aria-selected={idx === currentDocIndex}
              className={`doc-tab-pill ${idx === currentDocIndex ? 'active' : ''}`}
              onClick={() => {
                setCurrentDocIndex(idx);
                if (onSelectDocument) onSelectDocument(idx);
              }}
            >
              <FileText className="w-3 h-3" aria-hidden="true" />
              <span>{d.title || d.file?.name || `Document #${idx + 1}`}</span>
              <span className="text-[10px] opacity-75 font-semibold">
                ({d.paper_size || 'A4'} • {d.color_mode === 'bw' ? 'B&W' : 'Color'})
              </span>
            </button>
          ))}
        </div>
      )}

      {/* 3. MAIN CANVAS STAGE */}
      <div className="review-canvas-stage">
        {loadingDoc ? (
          <div className="flex flex-col items-center justify-center p-12 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500 mb-3" aria-hidden="true" />
            <p className="text-sm font-semibold">Rendering high-fidelity document preview...</p>
          </div>
        ) : primaryViewMode === 'reader' ? (
          /* EMBEDDED REAL DOCUMENT READER MODE */
          <div className="embedded-doc-container">
            <div className="p-3 bg-slate-800 border-b border-slate-700 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-blue-400" aria-hidden="true" />
                Reading: {doc.title || doc.file?.name} ({totalPages} {totalPages === 1 ? 'page' : 'pages'})
              </span>
              {docUrl && (
                <button
                  type="button"
                  onClick={handleOpenRawDocument}
                  className="review-btn text-xs"
                >
                  <ExternalLink className="w-3 h-3 mr-1" aria-hidden="true" />
                  Open in New Window
                </button>
              )}
            </div>

            {textContent ? (
              <div className="embedded-text-viewer">{textContent}</div>
            ) : isPdf && docUrl ? (
              <object
                data={docUrl}
                type="application/pdf"
                className="embedded-doc-frame"
              >
                <iframe
                  src={docUrl}
                  title="PDF Document Reader"
                  className="embedded-doc-frame"
                />
              </object>
            ) : isImage && docUrl ? (
              <div className="flex items-center justify-center h-full p-4 bg-slate-900 overflow-auto">
                <img src={docUrl} alt={doc.title} className="max-w-full max-h-full object-contain" />
              </div>
            ) : docUrl ? (
              <iframe
                src={docUrl}
                title="Document Reader View"
                className="embedded-doc-frame"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                No preview stream available.
              </div>
            )}
          </div>
        ) : primaryViewMode === 'compare' ? (
          /* SIDE-BY-SIDE COLOR VS BLACK & WHITE COMPARISON */
          <div className="review-compare-stage">
            <div className="text-center space-y-1 w-full max-w-4xl">
              <h4 className="font-bold text-white text-base">Color vs Black & White Print Comparison</h4>
              <p className="text-xs text-slate-400">
                Compare how Page {activePageIndex} looks in full color versus monochrome laser print
              </p>
            </div>

            <div className="compare-cards-container">
              {/* Left Column: Original Full Color */}
              <div className="compare-card-column">
                <span className="compare-header-badge badge-original">
                  Original / Full Color
                </span>
                <VirtualSheet
                  pageNum={activePageIndex}
                  totalPages={totalPages}
                  pdfDoc={pdfDoc}
                  doc={doc}
                  docUrl={docUrl}
                  textContent={textContent}
                  isPdf={isPdf}
                  isImage={isImage}
                  isSelected={true}
                  paperSize={paperSize}
                  colorMode="color"
                  orientation={orientation}
                  baseWidth={baseWidth * 1.15}
                  showSafeMargin={showSafeMargin}
                  showHolePunch={showHolePunch}
                  showStaple={showStaple}
                  sideLabel="Original Color"
                />
              </div>

              {/* Right Column: Black & White Print Simulation */}
              <div className="compare-card-column">
                <span className="compare-header-badge badge-bw">
                  🖤 Black & White Print Output
                </span>
                <VirtualSheet
                  pageNum={activePageIndex}
                  totalPages={totalPages}
                  pdfDoc={pdfDoc}
                  doc={doc}
                  docUrl={docUrl}
                  textContent={textContent}
                  isPdf={isPdf}
                  isImage={isImage}
                  isSelected={true}
                  paperSize={paperSize}
                  colorMode="bw"
                  orientation={orientation}
                  baseWidth={baseWidth * 1.15}
                  showSafeMargin={showSafeMargin}
                  showHolePunch={showHolePunch}
                  showStaple={showStaple}
                  sideLabel="Simulated B&W Print"
                />
              </div>
            </div>

            {/* Stepper Controls if multi-page */}
            {totalPages > 1 && (
              <div className="flex items-center gap-3 mt-2 bg-slate-800/80 px-4 py-2 rounded-full border border-slate-700">
                <button
                  type="button"
                  className="toolbar-btn icon-btn"
                  onClick={() => setActivePageIndex((p) => Math.max(1, p - 1))}
                  disabled={activePageIndex <= 1}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" aria-hidden="true" />
                </button>
                <span className="text-xs font-semibold text-slate-200">
                  Page {activePageIndex} of {totalPages}
                </span>
                <button
                  type="button"
                  className="toolbar-btn icon-btn"
                  onClick={() => setActivePageIndex((p) => Math.min(totalPages, p + 1))}
                  disabled={activePageIndex >= totalPages}
                  aria-label="Next page"
                >
                  <ChevronRight className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        ) : subViewMode === 'grid' ? (
          /* STANDARD PRINT SIMULATION: Grid View of all pages */
          <div className="review-grid">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
              const isSelected = selectedPages.includes(pageNum);
              return (
                <VirtualSheet
                  key={pageNum}
                  pageNum={pageNum}
                  totalPages={totalPages}
                  pdfDoc={pdfDoc}
                  doc={doc}
                  docUrl={docUrl}
                  textContent={textContent}
                  isPdf={isPdf}
                  isImage={isImage}
                  isSelected={isSelected}
                  paperSize={paperSize}
                  colorMode={colorMode}
                  orientation={orientation}
                  baseWidth={baseWidth}
                  showSafeMargin={showSafeMargin}
                  showHolePunch={showHolePunch}
                  showStaple={showStaple}
                  onTogglePage={() => {
                    if (!onUpdateSettings) return;
                    let nextSelected;
                    if (isSelected) {
                      nextSelected = selectedPages.filter((p) => p !== pageNum);
                    } else {
                      nextSelected = [...selectedPages, pageNum].sort((a, b) => a - b);
                    }
                    const newRangeStr = nextSelected.join(', ');
                    onUpdateSettings(docId, { page_range: newRangeStr });
                  }}
                />
              );
            })}
          </div>
        ) : subViewMode === 'focus' ? (
          /* STANDARD PRINT SIMULATION: Focus Stepper Mode */
          <div className="review-focus-stage">
            <VirtualSheet
              pageNum={activePageIndex}
              totalPages={totalPages}
              pdfDoc={pdfDoc}
              doc={doc}
              docUrl={docUrl}
              textContent={textContent}
              isPdf={isPdf}
              isImage={isImage}
              isSelected={selectedPages.includes(activePageIndex)}
              paperSize={paperSize}
              colorMode={colorMode}
              orientation={orientation}
              baseWidth={baseWidth * 1.3}
              showSafeMargin={showSafeMargin}
              showHolePunch={showHolePunch}
              showStaple={showStaple}
            />

            {/* Stepper Controls */}
            <div className="flex items-center gap-3 mt-3 bg-slate-800/80 px-4 py-2 rounded-full border border-slate-700">
              <button
                type="button"
                className="toolbar-btn icon-btn"
                onClick={() => setActivePageIndex((p) => Math.max(1, p - 1))}
                disabled={activePageIndex <= 1}
                aria-label="Previous page"
              >
                <ChevronLeft className="w-4 h-4" aria-hidden="true" />
              </button>
              <span className="text-xs font-semibold text-slate-200">
                Page {activePageIndex} of {totalPages}
                {selectedPages.includes(activePageIndex) ? (
                  <span className="ml-2 text-emerald-400 font-bold">• In Print Job</span>
                ) : (
                  <span className="ml-2 text-rose-400 font-bold">• Skipped</span>
                )}
              </span>
              <button
                type="button"
                className="toolbar-btn icon-btn"
                onClick={() => setActivePageIndex((p) => Math.min(totalPages, p + 1))}
                disabled={activePageIndex >= totalPages}
                aria-label="Next page"
              >
                <ChevronRight className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : (
          /* STANDARD PRINT SIMULATION: Duplex Sheet View (Front & Back) */
          <div className="review-focus-stage">
            <div className="flex items-center gap-2 mb-2 text-xs text-slate-300">
              <span>Duplex Physical Sheet Simulation:</span>
              <button
                type="button"
                className="toolbar-btn secondary-btn"
                onClick={() => setIsFlipped(!isFlipped)}
              >
                <RotateCw className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                {isFlipped ? 'Flip to Front Side (Page 1)' : 'Flip to Back Side (Page 2)'}
              </button>
            </div>

            <div
              className={`duplex-card ${isFlipped ? 'flipped' : ''}`}
              style={{
                width: `${baseWidth * 1.3}px`,
                height: `${baseWidth * 1.3 * 1.414}px`,
              }}
            >
              <div className="duplex-card-inner">
                {/* Front Side */}
                <div className="duplex-card-front">
                  <VirtualSheet
                    pageNum={activePageIndex}
                    totalPages={totalPages}
                    pdfDoc={pdfDoc}
                    doc={doc}
                    docUrl={docUrl}
                    textContent={textContent}
                    isPdf={isPdf}
                    isImage={isImage}
                    isSelected={selectedPages.includes(activePageIndex)}
                    paperSize={paperSize}
                    colorMode={colorMode}
                    orientation={orientation}
                    baseWidth={baseWidth * 1.3}
                    showSafeMargin={showSafeMargin}
                    showHolePunch={showHolePunch}
                    showStaple={showStaple}
                    sideLabel="FRONT (Side A)"
                  />
                </div>
                {/* Back Side */}
                <div className="duplex-card-back">
                  <VirtualSheet
                    pageNum={Math.min(totalPages, activePageIndex + 1)}
                    totalPages={totalPages}
                    pdfDoc={pdfDoc}
                    doc={doc}
                    docUrl={docUrl}
                    textContent={textContent}
                    isPdf={isPdf}
                    isImage={isImage}
                    isSelected={selectedPages.includes(Math.min(totalPages, activePageIndex + 1))}
                    paperSize={paperSize}
                    colorMode={colorMode}
                    orientation={orientation}
                    baseWidth={baseWidth * 1.3}
                    showSafeMargin={showSafeMargin}
                    showHolePunch={showHolePunch}
                    showStaple={showStaple}
                    sideLabel="BACK (Side B)"
                  />
                </div>
              </div>
            </div>

            <div className="text-xs text-slate-400 mt-2">
              Showing Sheet {Math.ceil(activePageIndex / 2)}: Pages {activePageIndex} &{' '}
              {Math.min(totalPages, activePageIndex + 1)}
            </div>
          </div>
        )}
      </div>

      {/* 4. SPECS FOOTER BAR */}
      <div className="review-specs-bar">
        <div className="specs-chip">
          <span>Selected Pages:</span>
          <strong>
            {selectedPages.length} of {totalPages} pages
          </strong>
        </div>

        <div className="specs-chip">
          <span>Physical Sheets:</span>
          <strong>
            {isDoubleSided ? Math.ceil(selectedPages.length / 2) : selectedPages.length} sheet(s)
          </strong>
        </div>

        <div className="specs-chip">
          <span>Print Format:</span>
          <strong>
            {paperSize} • {colorMode === 'bw' ? '🖤 Black & White' : '🎨 Full Color'} •{' '}
            {orientation}
          </strong>
        </div>

        <div className="specs-chip">
          <span>Copies:</span>
          <div className="inline-flex items-center gap-1.5 ml-1">
            <button
              type="button"
              className="w-5 h-5 rounded bg-slate-700 text-white font-bold flex items-center justify-center hover:bg-slate-600"
              onClick={() => handleSettingChange('copies', Math.max(1, (doc.copies || 1) - 1))}
              aria-label="Decrease copies"
            >
              -
            </button>
            <strong className="px-1">{doc.copies || 1}</strong>
            <button
              type="button"
              className="w-5 h-5 rounded bg-slate-700 text-white font-bold flex items-center justify-center hover:bg-slate-600"
              onClick={() => handleSettingChange('copies', (doc.copies || 1) + 1)}
              aria-label="Increase copies"
            >
              +
            </button>
          </div>
        </div>

        {loadError && (
          <div className="w-full text-xs text-amber-300 mt-1 flex items-center gap-1">
            <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" />
            {loadError}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Single Virtual Printed Sheet Component
 */
function VirtualSheet({
  pageNum,
  totalPages,
  pdfDoc,
  doc,
  docUrl,
  textContent,
  isPdf,
  isImage,
  isSelected,
  paperSize,
  colorMode,
  orientation,
  baseWidth,
  showSafeMargin,
  showHolePunch,
  showStaple,
  sideLabel,
  onTogglePage,
}) {
  const canvasRef = useRef(null);
  const [rendered, setRendered] = useState(false);
  const [renderError, setRenderError] = useState(false);

  useEffect(() => {
    let active = true;
    let renderTask = null;

    if (pdfDoc && canvasRef.current) {
      setRenderError(false);
      pdfDoc
        .getPage(pageNum)
        .then((page) => {
          if (!active || !canvasRef.current) return;
          const targetWidth = baseWidth || 280;
          const unscaledViewport = page.getViewport({ scale: 1.0 });
          const scale = targetWidth / unscaledViewport.width;
          const viewport = page.getViewport({ scale });

          const outputScale = Math.min(window.devicePixelRatio || 1, 2);
          const canvas = canvasRef.current;
          canvas.width = Math.floor(viewport.width * outputScale);
          canvas.height = Math.floor(viewport.height * outputScale);
          canvas.style.width = `${Math.floor(viewport.width)}px`;
          canvas.style.height = `${Math.floor(viewport.height)}px`;

          const ctx = canvas.getContext('2d');
          ctx.save();
          ctx.scale(outputScale, outputScale);

          renderTask = page.render({
            canvasContext: ctx,
            viewport: viewport,
          });

          renderTask.promise
            .then(() => {
              if (active) setRendered(true);
              ctx.restore();
            })
            .catch((err) => {
              if (err?.name !== 'RenderingCancelledException') {
                console.warn('PDF page render error:', err);
                if (active) setRenderError(true);
              }
            });
        })
        .catch((err) => {
          console.warn('PDF getPage error:', err);
          if (active) setRenderError(true);
        });
    }

    return () => {
      active = false;
      if (renderTask) {
        try {
          renderTask.cancel();
        } catch (e) {}
      }
    };
  }, [pdfDoc, pageNum, baseWidth]);

  return (
    <div className="virtual-sheet-wrapper">
      <div
        className={`virtual-sheet sheet-ratio-${paperSize} orientation-${orientation} color-${colorMode}`}
        style={{ '--sheet-width': `${baseWidth}px` }}
        onClick={onTogglePage}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onTogglePage?.(); }}}
      >
        {/* Safe Margin Guide */}
        {showSafeMargin && <div className="print-safe-margin" title="5mm Printable Safe Area" aria-hidden="true" />}

        {/* Staple & Hole Punch */}
        {showStaple && <div className="sheet-staple" title="Staple Pin" aria-hidden="true" />}
        {showHolePunch && (
          <>
            <div className="sheet-hole-punch sheet-hole-top" aria-hidden="true" />
            <div className="sheet-hole-punch sheet-hole-middle" aria-hidden="true" />
            <div className="sheet-hole-punch sheet-hole-bottom" aria-hidden="true" />
          </>
        )}

        {/* Sheet Content */}
        <div className="sheet-content">
          {pdfDoc && !renderError ? (
            <>
              {!rendered && (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-slate-400 bg-white">
                  <Loader2 className="w-5 h-5 animate-spin text-blue-500 mb-1" aria-hidden="true" />
                </div>
              )}
              <canvas ref={canvasRef} className="sheet-canvas" aria-hidden="true" />
            </>
          ) : isPdf && docUrl ? (
            /* Fallback embedded PDF if canvas fails or worker blocked */
            <object
              data={`${docUrl}#page=${pageNum}&toolbar=0&navpanes=0`}
              type="application/pdf"
              className="w-full h-full pointer-events-none"
              title={`PDF Page ${pageNum}`}
            >
              <iframe
                src={`${docUrl}#page=${pageNum}&toolbar=0`}
                className="w-full h-full pointer-events-none"
                title={`PDF Page ${pageNum}`}
              />
            </object>
          ) : isImage && docUrl ? (
            <img src={docUrl} alt={`Page ${pageNum}`} className="sheet-image" />
          ) : textContent ? (
            <div className="sheet-mock text-left font-mono text-[10px] leading-relaxed p-2 text-slate-800 overflow-hidden select-text">
              {textContent.slice((pageNum - 1) * 800, pageNum * 800) || textContent.slice(0, 800)}
            </div>
          ) : (
            /* Mock document representation for non-PDF/image */
            <div className="sheet-mock">
              <div className="mock-title" />
              <div className="mock-line long" />
              <div className="mock-line med" />
              <div className="mock-line long" />
              <div className="mock-line short" />
              <div className="mock-line med" />
              <div className="mock-line long" />
              <div className="mock-line long" />
              <div className="mock-line med" />
              <div className="mt-auto text-[9px] text-slate-400 font-mono text-center">
                {doc.title || 'Document File'} • Page {pageNum} of {totalPages}
              </div>
            </div>
          )}
        </div>

        {/* Excluded Page Overlay */}
        {!isSelected && (
          <div className="sheet-excluded-overlay">
            <AlertCircle className="w-6 h-6 mb-1 text-rose-400" aria-hidden="true" />
            <span>EXCLUDED FROM PRINT</span>
            <span className="text-[10px] text-slate-300 mt-1">Click to include this page</span>
          </div>
        )}
      </div>

      {/* Sheet Badge & Caption - centered below sheet */}
      <div className="sheet-caption">
        <span className={`sheet-badge ${isSelected ? 'printed' : 'excluded'}`}>
          {sideLabel
            ? sideLabel
            : isSelected
            ? `Page ${pageNum} • ${colorMode === 'bw' ? 'B&W' : 'Color'}`
            : `Page ${pageNum} • Skipped`}
        </span>
      </div>
    </div>
  );
}