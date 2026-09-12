import { createContext, useContext, useEffect, useState } from 'react';
import { apiRequest } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      apiRequest('/api/auth/me')
        .then(response => {
          if (response?.data) {
            setUser(response.data);
          }
        })
        .catch(() => {
          localStorage.removeItem('auth_token');
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (username, password) => {
    const response = await apiRequest('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    
    if (response?.token) {
      localStorage.setItem('auth_token', response.token);
      setUser(response.data);
    }
    return response.data;
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
