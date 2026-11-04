import React, { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import useAuth from "../stores/useAuth";
import { LoadingSpinner } from "./ui_primitives";
import { rememberPostLoginReturn } from "../utils/postLoginReturn";

type Props = {
  children: React.ReactNode;
};

const ProtectedRoute: React.FC<Props> = ({ children }) => {
  const navigate = useNavigate();
  const { pathname, search } = useLocation();
  const state = useAuth((auth) => auth.state);

  useEffect(() => {
    if (state === "logged_out") {
      // Only allow-listed pages are kept, such as the OAuth consent page.
      rememberPostLoginReturn(`${pathname}${search}`);
      navigate("/login");
    }
  }, [state, navigate, pathname, search]);

  if (state === "loading" || state === "init") {
    return <LoadingSpinner />;
  }

  if (state === "logged_in") {
    return <>{children}</>;
  }

  return null;
};

export default ProtectedRoute;