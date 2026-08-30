/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem('pedidoprontobot_token')));

  useEffect(() => {
    const token = localStorage.getItem('pedidoprontobot_token');
    if (token) {
      authAPI.me()
        .then((data) => {
          setUser(data.user);
          setStore(data.store);
        })
        .catch(() => {
          localStorage.removeItem('pedidoprontobot_token');
        })
        .finally(() => setLoading(false));
    }
  }, []);

  const login = async (email, password) => {
    const data = await authAPI.login({ email, password });
    localStorage.setItem('pedidoprontobot_token', data.token);
    setUser(data.user);
    const meData = await authAPI.me();
    setStore(meData.store);
    return data;
  };

  // Register no longer auto-logs in — requires email verification
  const register = async (name, email, password) => {
    const data = await authAPI.register({ name, email, password });
    // data = { requiresVerification: true, message: '...' }
    return data;
  };

  const logout = () => {
    localStorage.removeItem('pedidoprontobot_token');
    setUser(null);
    setStore(null);
  };

  const refreshStore = async () => {
    const meData = await authAPI.me();
    setStore(meData.store);
  };

  return (
    <AuthContext.Provider value={{ user, store, loading, login, register, logout, refreshStore }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
