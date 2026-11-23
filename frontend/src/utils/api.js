import axios from 'axios';

const API_BASE = '/api';

const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const message = error.response?.data?.detail || error.response?.data?.error || error.message || 'An error occurred';
    return Promise.reject(new Error(message));
  }
);

export const documentApi = {
  create: (formData) => api.post('/documents/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),

  batchUpload: (formData) => api.post('/documents/batch_upload/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  }),

  batchUpdate: (data) => api.post('/documents/batch_update/', data),

  getBatch: (batchId) => api.get(`/documents/batch/${batchId}/`),

  verifyBatchPayment: (batchId, transactionId) => api.post(`/documents/batch/${batchId}/verify_payment/`, { transaction_id: transactionId }),

  list: (params) => api.get('/documents/', { params }),

  get: (id) => api.get(`/documents/${id}/`),

  getByToken: (token) => api.get(`/share/${token}/`),

  verifyPayment: (id, transactionId) => api.post(`/documents/${id}/verify_payment/`, { transaction_id: transactionId }),

  getQR: (id) => api.get(`/documents/${id}/qr_code/`),

  cancel: (id) => api.post(`/documents/${id}/cancel/`),
};

export const printJobApi = {
  list: (documentId) => api.get('/print-jobs/', { params: { document: documentId } }),
  get: (id) => api.get(`/print-jobs/${id}/`),
};

export const printHostApi = {
  list: () => api.get('/print-hosts/'),
  create: (data) => api.post('/print-hosts/', data),
  get: (id) => api.get(`/print-hosts/${id}/`),
  update: (id, data) => api.patch(`/print-hosts/${id}/`, data),
  delete: (id) => api.delete(`/print-hosts/${id}/`),
};

export const authApi = {
  login: (username, password) => api.post('/auth/login/', { username, password }),
  logout: () => api.post('/auth/logout/'),
  me: () => api.get('/auth/me/'),
};

export const storeSettingsApi = {
  get: () => api.get('/store-settings/'),
  update: (data) => api.patch('/store-settings/', data),
};

export const adminApi = {
  getDashboardStats: () => api.get('/admin/dashboard-stats/'),
};

export default api;