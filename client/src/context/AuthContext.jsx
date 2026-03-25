import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [store, setStore] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('zapvitrine_token');
    if (token) {
      authAPI.me()
        .then((data) => {
          setUser(data.user);
          setStore(data.store);
        })
        .catch(() => {
          localStorage.removeItem('zapvitrine_token');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const data = await authAPI.login({ email, password });
    localStorage.setItem('zapvitrine_token', data.token);
    setUser(data.user);
    const meData = await authAPI.me();
    setStore(meData.store);
    return data;
  };

  const register = async (name, email, password) => {
    const data = await authAPI.register({ name, email, password });
    localStorage.setItem('zapvitrine_token', data.token);
    setUser(data.user);
    const meData = await authAPI.me();
    setStore(meData.store);
    return data;
  };

  const logout = () => {
    localStorage.removeItem('zapvitrine_token');
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
