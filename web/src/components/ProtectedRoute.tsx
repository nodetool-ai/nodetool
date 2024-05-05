import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../providers/AuthProvider";

type Props = {
  children: React.ReactNode;
};

const ProtectedRoute: React.FC<Props> = ({ children }) => {
  const navigate = useNavigate();
  const auth = useAuth();

  useEffect(() => {
    if (!auth.user) {
      navigate("/login");
    }
  }, [navigate, auth.user]);

  return <>{children}</>;
};

export default ProtectedRoute;
