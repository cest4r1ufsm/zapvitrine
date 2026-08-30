const isDev = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
export const API_URL = import.meta.env.VITE_API_URL || (isDev ? 'http://localhost:3001/api' : '/api');

function getToken() {
  return localStorage.getItem('pedidoprontobot_token');
}

function authHeaders() {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(endpoint, options = {}) {
  const res = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders(),
      ...options.headers,
    },
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Erro ${res.status}`);
  }

  return res.json();
}

async function uploadFile(endpoint, formData) {
  const res = await fetch(`${API_URL}${endpoint}`, {
    method: 'POST',
    headers: { ...authHeaders() },
    body: formData,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Erro ${res.status}`);
  }

  return res.json();
}

// Auth
export const authAPI = {
  register: (data) => request('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
  login: (data) => request('/auth/login', { method: 'POST', body: JSON.stringify(data) }),
  me: () => request('/auth/me'),
  verifyEmail: (token) => request(`/auth/verify-email?token=${token}`),
  resendVerification: (email) => request('/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email }) }),
  forgotPassword: (email) => request('/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) }),
  resetPassword: (token, password) => request('/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) }),
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
  connect: () => request('/whatsapp/connect', { method: 'POST' }),
  status: () => request('/whatsapp/status'),
  disconnect: () => request('/whatsapp/disconnect', { method: 'POST' }),
};

export const UPLOADS_URL = import.meta.env.VITE_UPLOADS_URL || (isDev ? API_URL.replace(/\/api\/?$/, '') : '');

const api = {
  get: (endpoint) => request(endpoint),
  post: (endpoint, body) => request(endpoint, { method: 'POST', body: JSON.stringify(body) }),
  patch: (endpoint, body) => request(endpoint, { method: 'PATCH', body: JSON.stringify(body) }),
  delete: (endpoint) => request(endpoint, { method: 'DELETE' }),
};

export default api;
