import React, { useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import useAuth from "../stores/useAuth";

const OAuthCallback: React.FC = () => {
  const location = useLocation();
  const urlParams = new URLSearchParams(location.search);
  const state = urlParams.get("state");
  const { setUser, oauthCallback } = useAuth();
  const navigate = useNavigate();
  const fetchUser = useCallback(async (state: string) => {
    const res = await oauthCallback({
      provider: "google",
      authorization_response: window.location.origin + location.search,
      redirect_uri: window.location.origin + "/oauth/callback",
      state: state || ""
    });
    setUser(res);
    navigate("/editor/start");
  }, [location.search, navigate, oauthCallback, setUser]);

  useQuery({
    queryKey: ["oauth", state], queryFn: async () => {
      if (state) {
        await fetchUser(state);
      }
    }
  });

  return <></>;
};

export default OAuthCallback;
