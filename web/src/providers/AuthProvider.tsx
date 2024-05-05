import { createContext, useContext, ReactNode, useState } from "react";
import { User } from "../stores/ApiTypes";
import { OAuthProvider, useLoginStore } from "../stores/LoginStore";

interface AuthContextType {
  user: User | null;
  setUser: (user: User) => void;
  login: (provider: OAuthProvider) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  setUser: (_: User) => {},
  login: async (_: OAuthProvider) => {},
  logout: async () => {}
});

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider = ({ children }: AuthProviderProps) => {
  const readFromStorage = useLoginStore((state) => state.readFromStorage);
  const [user, setUser] = useState(readFromStorage());
  const oauthLogin = useLoginStore((state) => state.oauthLogin);
  const redirect_uri = window.location.origin + "/oauth/callback";
  const signout = useLoginStore((state) => state.signout);

  const login = async (provider: OAuthProvider) => {
    await oauthLogin(provider, redirect_uri);
  };

  const logout = async () => {
    await signout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
