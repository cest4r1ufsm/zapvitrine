/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [store, setStore] = useState(null);
  const [sessionError, setSessionError] = useState('');
  const sessionOperation = useRef(0);
  const [loading, setLoading] = useState(() => Boolean(localStorage.getItem('pedidoprontobot_token')));

  const restoreSession = useCallback(async () => {
    const token = localStorage.getItem('pedidoprontobot_token');
    if (!token) return;
    const operation = ++sessionOperation.current;
    setLoading(true);
    setSessionError('');
    try {
      const data = await authAPI.me();
      if (operation !== sessionOperation.current || localStorage.getItem('pedidoprontobot_token') !== token) return;
      setUser(data.user);
      setStore(data.store);
    } catch (err) {
      if (operation !== sessionOperation.current) return;
      if (err.status === 401) {
          localStorage.removeItem('pedidoprontobot_token');
          setUser(null);
          setStore(null);
      } else {
        setSessionError('Não foi possível acessar sua conta agora. Confira a conexão e tente novamente.');
      }
    } finally {
      if (operation === sessionOperation.current) setLoading(false);
    }
  }, []);

  useEffect(() => { void restoreSession(); }, [restoreSession]);

  const login = async (email, password) => {
    const data = await authAPI.login({ email, password });
    localStorage.setItem('pedidoprontobot_token', data.token);
    await restoreSession();
    return data;
  };

  // Register no longer auto-logs in — requires email verification
  const register = async (name, email, password) => {
    const data = await authAPI.register({ name, email, password });
    // data = { requiresVerification: true, message: '...' }
    return data;
  };

  const logout = () => {
    sessionOperation.current += 1;
    localStorage.removeItem('pedidoprontobot_token');
    setUser(null);
    setStore(null);
    setSessionError('');
    setLoading(false);
  };

  const refreshStore = async () => {
    const meData = await authAPI.me();
    setStore(meData.store);
  };

  return (
    <AuthContext.Provider value={{ user, store, loading, sessionError, restoreSession, login, register, logout, refreshStore }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
