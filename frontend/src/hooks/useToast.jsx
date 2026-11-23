import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { CheckCircle, AlertCircle, Info } from 'lucide-react';

const ToastContext = createContext(null);

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const addToast = useCallback((message, type = 'info', duration = 5000) => {
    const id = Date.now();
    const toast = { id, message, type };
    setToasts((prev) => [...prev, toast]);

    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, duration);
    }

    return id;
  }, []);

  const removeToast = useCallback((id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useMemo(() => ({
    success: (message, duration) => addToast(message, 'success', duration),
    error: (message, duration) => addToast(message, 'error', duration),
    info: (message, duration) => addToast(message, 'info', duration),
  }), [addToast]);

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="fixed bottom-1.5 right-1.5 left-1.5 z-50 flex flex-col gap-3" aria-live="polite">
        {toasts.map(({ id, message, type }) => (
          <div
            key={id}
            className={`toast toast-${type} flex items-center gap-3 px-4 py-3`}
            role="alert"
          >
            {type === 'success' && <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />}
            {type === 'error' && <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0" />}
            {type === 'info' && <Info className="w-5 h-5 text-blue-600 flex-shrink-0" />}
            <p className="text-sm text-gray-900 flex-1">{message}</p>
            <button
              onClick={() => removeToast(id)}
              className="text-gray-500 hover:text-gray-900 p-1 flex-shrink-0"
              aria-label="Dismiss"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}