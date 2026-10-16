/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { authAPI, clearAuthState } from '../services/api';

const AuthContext = createContext(null);
function removeLegacyCredential() {
  try { localStorage.removeItem('pedidoprontobot_token'); } catch { /* HttpOnly session remains usable when browser storage is disabled. */ }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [store, setStore] = useState(null);
  const [sessionError, setSessionError] = useState('');
  const sessionOperation = useRef(0);
  const [loading, setLoading] = useState(true);

  const restoreSession = useCallback(async () => {
    // Remove the previous browser-readable credential during migration.
    removeLegacyCredential();
    const operation = ++sessionOperation.current;
    setLoading(true);
    setSessionError('');
    try {
      const data = await authAPI.me();
      if (operation !== sessionOperation.current) return;
      setUser(data.user);
      setStore(data.store);
    } catch (err) {
      if (operation !== sessionOperation.current) return;
      if (err.status === 401) {
          removeLegacyCredential();
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

    await restoreSession();
    return data;
  };

  // Register no longer auto-logs in — requires email verification
  const register = async (name, email, password, accountType = 'business') => {
    const data = await authAPI.register({ name, email, password, accountType });
    // data = { requiresVerification: true, message: '...' }
    return data;
  };

  const logout = async () => {
    try { await authAPI.logout(); } catch (err) {
      if (err.status !== 401) {
        setSessionError('Não foi possível encerrar sua sessão. Confira a conexão e tente novamente.');
        return false;
      }
    }
    clearAuthState();
    sessionOperation.current += 1;
    removeLegacyCredential();
    setUser(null);
    setStore(null);
    setSessionError('');
    setLoading(false);
    return true;
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
