import React from "react";
import { useQuery } from "react-query";
import { Navigate, useLocation } from "react-router-dom";
import { client } from "../stores/ApiClient";
import { OAuthAuthorizeRequest } from "../stores/ApiTypes";
import { useLoginStore } from "../stores/LoginStore";
import { useAuth } from "../providers/AuthProvider";

const oauthCallback = async (req: OAuthAuthorizeRequest) => {
  const saveToStorage = useLoginStore.getState().saveToStorage;
  if (req.state !== localStorage.getItem("oauth_state")) {
    throw new Error("Invalid OAuth state");
  }
  const { error, data } = await client.POST("/api/auth/oauth/callback", {
    body: req
  });
  if (data) {
    saveToStorage(data);
  }
  if (error) {
    throw error;
  }
  localStorage.removeItem("oauth_state");
  return { data, error };
};

const OAuthCallback: React.FC = () => {
  const location = useLocation();
  const urlParams = new URLSearchParams(location.search);
  const state = urlParams.get("state");
  const saveToStorage = useLoginStore.getState().saveToStorage;
  const { setUser } = useAuth();

  const { data } = useQuery(
    ["oauthCallback", state],
    async () => {
      const res = await oauthCallback({
        provider: "google",
        authorization_response: window.location.origin + location.search,
        redirect_uri: window.location.origin + "/oauth/callback",
        state: state || ""
      });
      saveToStorage(res.data);
      setUser(res.data);
      return res;
    },
    {
      useErrorBoundary: true
    }
  );
  return <Navigate to={"/editor"} replace={true} />;
};

export default OAuthCallback;
