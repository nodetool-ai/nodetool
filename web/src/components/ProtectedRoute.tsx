import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import useAuth from "../stores/useAuth";
import { CircularProgress } from "@mui/material";

type Props = {
  children: React.ReactNode;
};

const ProtectedRoute: React.FC<Props> = ({ children }) => {
  const navigate = useNavigate();
  const { state } = useAuth((auth) => ({ state: auth.state }));

  useEffect(() => {
    if (state === "logged_out") {
      navigate("/login");
    }
  }, [state, navigate]);

  if (state === "loading" || state === "init") {
    return <CircularProgress />;
  }

  if (state === "logged_in") {
    return <>{children}</>;
  }

  return null;
};

export default ProtectedRoute;