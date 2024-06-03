import React, { useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { client, useRemoteAuth } from "../stores/ApiClient";
import useAuth from "../stores/useAuth";

type Props = {
  children: React.ReactNode;
};

const ProtectedRoute: React.FC<Props> = ({ children }) => {
  const navigate = useNavigate();
  const { user, signout } = useAuth();

  const verify = useCallback(async () => {
    if (!useRemoteAuth) {
      return true;
    }
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
  }, [user]);

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
    if (!user) {
      navigate("/login");
    }
  }, [navigate, user]);

  return <>{children}</>;
};

export default ProtectedRoute;
