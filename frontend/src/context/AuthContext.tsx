import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import api from "../services/api";

interface User {
  id: number;
  email: string;
  name: string | null;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  loading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
  updateUser: (updatedUser: User) => void;

}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const TOKEN_KEY = "finance_advisor_token";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    sessionStorage.getItem(TOKEN_KEY)
  );

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadCurrentUser = async () => {
      if (!token) {
        setUser(null);
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const response = await api.get<User>("/auth/me");

        if (!cancelled) {
          setUser(response.data);
        }
      } catch {
        if (!cancelled) {
          sessionStorage.removeItem(TOKEN_KEY);
          setToken(null);
          setUser(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadCurrentUser();

    return () => {
      cancelled = true;
    };
  }, [token]);

  const login = async (email: string, password: string) => {
    setLoading(true);

    try {
      const response = await api.post("/auth/login", {
        email,
        password,
      });

      const accessToken = response.data.access_token;

      if (!accessToken) {
        throw new Error("Login response did not contain an access token.");
      }

      // Store token before requesting the current user.
      sessionStorage.setItem(TOKEN_KEY, accessToken);

      const meResponse = await api.get<User>("/auth/me");

      setUser(meResponse.data);
      setToken(accessToken);
    } catch (error) {
      sessionStorage.removeItem(TOKEN_KEY);
      setToken(null);
      setUser(null);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const register = async (email: string, password: string) => {
    await api.post("/auth/register", {
      email,
      password,
    });

    await login(email, password);
  };

  const logout = () => {
    sessionStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  };

  const updateUser = (updatedUser: User) => {
  setUser(updatedUser);
};

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        isAuthenticated: Boolean(token && user),
        login,
        register,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }

  return context;
}