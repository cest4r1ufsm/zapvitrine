const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
export const API_URL = import.meta.env.VITE_API_URL || (isDev ? 'http://localhost:3001/api' : '/api');

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

let csrfToken = null;
export function clearAuthState() { csrfToken = null; }

export async function request(endpoint, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  const unsafe = !['GET', 'HEAD', 'OPTIONS'].includes(method);
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(unsafe && csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      ...options.headers,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) clearAuthState();
    throw new ApiError(data.error || `Erro ${res.status}`, res.status, data.code);
  }
  if (data.csrfToken) csrfToken = data.csrfToken;
  return data;
}

async function uploadFile(endpoint, formData) {
  return request(endpoint, { method: 'POST', body: formData });
}

// Auth
export const authAPI = {
  register: (data) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data) => request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  me: () => request('/auth/me'),
  logout: () => request('/auth/logout', { method: 'POST' }),
  verifyEmail: (token) => request(`/auth/verify-email?token=${token}`),
  resendVerification: (email) => request('/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email }) }),
  forgotPassword: (email) => request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token, password) => request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) }),
  deleteAccount: (password) => request('/auth/account', { method: 'DELETE', body: JSON.stringify({ password }) }),
};

// Store
export const storeAPI = {
  get: () => request('/store'),
  update: (data) => request('/store', { method: 'PUT', body: JSON.stringify(data) }),
  uploadLogo: (formData) => uploadFile('/store/logo', formData),
  uploadBanner: (formData) => uploadFile('/store/banner', formData),
  getChatbot: () => request('/store/chatbot'),
  updateChatbot: (data) => request('/store/chatbot', { method: 'PUT', body: JSON.stringify(data) }),
};

// Categories
export const categoriesAPI = {
  list: () => request('/categories'),
  create: (data) => request('/categories', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/categories/${id}`, { method: 'DELETE' }),
};

// Products
export const productsAPI = {
  list: () => request('/products'),
  create: (data) => request('/products', { method: 'POST', body: JSON.stringify(data) }),
  update: (id, data) => request(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  delete: (id) => request(`/products/${id}`, { method: 'DELETE' }),
  uploadImage: (id, formData) => uploadFile(`/products/${id}/image`, formData),
};

// Public
export const publicAPI = {
  getStore: (slug) => request(`/public/store/${slug}`),
};

// Admin
export const adminAPI = {
  getUsers: () => request('/admin/users'),
  getStores: () => request('/admin/stores'),
  toggleStore: (id) => request(`/admin/stores/${id}/toggle`, { method: 'PATCH' }),
};

// Orders
export const ordersAPI = {
  list: (status = 'all', page = 1) => request(`/orders?status=${status}&page=${page}`),
  stats: () => request('/orders/stats'),
  updateStatus: (id, status) => request(`/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  delete: (id) => request(`/orders/${id}`, { method: 'DELETE' }),
};

// WhatsApp
export const whatsappAPI = {
  connect: (options = {}) => request('/whatsapp/connect', { method: 'POST', body: JSON.stringify(options) }),
  status: () => request('/whatsapp/status'),
  disconnect: () => request('/whatsapp/disconnect', { method: 'POST' }),
};

export const UPLOADS_URL = import.meta.env.VITE_UPLOADS_URL || (isDev ? API_URL.replace(/\/api\/?$/, '') : '');

const api = {
  get: (endpoint) => request(endpoint),
  post: (endpoint, body) => request(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  put: (endpoint, body) => request(endpoint, { method: 'PUT', body: JSON.stringify(body) }),
  patch: (endpoint, body) => request(endpoint, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (endpoint) => request(endpoint, { method: 'DELETE' }),
};

export default api;
