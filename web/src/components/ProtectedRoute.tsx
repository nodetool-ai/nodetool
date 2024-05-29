import React, { useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../providers/AuthProvider";
import { useLoginStore } from "../stores/LoginStore";
import { client } from "../stores/ApiClient";

type Props = {
  children: React.ReactNode;
};

const ProtectedRoute: React.FC<Props> = ({ children }) => {
  const navigate = useNavigate();
  const auth = useAuth();
  const readFromStorage = useLoginStore((state) => state.readFromStorage);
  const signout = useLoginStore((state) => state.signout);

  const verify = useCallback(async () => {
    const user = readFromStorage();
    if (!user || !user.auth_token) {
      return false;
    }
    const { data, error } = await client.POST("/api/auth/verify", {
      body: {
        token: user?.auth_token
      }
    });
    if (error) {
      return false;
    }
    return data.valid;
  }, [readFromStorage]);

  const checkUser = useCallback(async () => {
    const valid = await verify();
    if (!valid) {
      signout();
    }
  }, [signout, verify]);

  useEffect(() => {
    return () => {
      window.addEventListener("focus", checkUser);
    };
  }, [checkUser]);

  useEffect(() => {
    if (!auth.user) {
      navigate("/login");
    }
  }, [navigate, auth.user]);

  return <>{children}</>;
};

export default ProtectedRoute;
