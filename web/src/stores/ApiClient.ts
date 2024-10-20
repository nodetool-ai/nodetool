import createClient, { type Middleware } from "openapi-fetch";
import { paths } from "../api.js"; // (generated from openapi-typescript)
import { useAuth } from "./useAuth.js";

export const isLocalhost =
  window.location.hostname.includes("dev.") ||
  window.location.hostname === "127.0.0.1" ||
  window.location.hostname === "localhost" ||
  window.location.hostname === "192.168.50.225";

export const useRemoteAuth = !isLocalhost;
export const isDevelopment = isLocalhost;
export const isProduction = !isLocalhost;

(window as any)["isProduction"] = isProduction;

// TODO: make it configurable via env vars
export const BASE_URL = isLocalhost
  ? window.location.protocol + "//" + window.location.hostname + ":8000"
  : "https://api.nodetool.ai";

export const WORKER_URL =
  BASE_URL.replace("http://", "ws://").replace("https://", "wss://") +
  "/predict";

export const CHAT_URL =
  BASE_URL.replace("http://", "ws://").replace("https://", "wss://") + "/chat";

export const DOWNLOAD_URL =
  BASE_URL.replace("http://", "ws://").replace("https://", "wss://") +
  "/hf/download";

export const pingWorker = () => {
  if (isDevelopment) {
    return;
  }
  // only needed for the modal worker to wake up
  // const ts = new Date().getTime();
  // const url = WORKER_URL.replace("predict", "?" + ts);
  // fetch(url, {
  //   method: "GET",
  // });
};

const authMiddleware: Middleware = {
  async onRequest(req: Request) {
    const user = useAuth.getState().user;

    if (user) {
      req.headers.set("Authorization", `Bearer ${user.auth_token}`);
    }
    return req;
  },
  async onResponse(res: Response) {
    if (res.status == 401) {
      console.log("Unauthorized, signing out");
      useAuth.getState().signout();
      window.location.href = "/login";
    }
    return res;
  }
};

export const client = createClient<paths>({
  baseUrl: BASE_URL
});

client.use(authMiddleware);

export const authHeader = () => {
  const user = useAuth.getState().user;
  if (user) {
    return {
      authorization: "Bearer " + user.auth_token
    };
  } else {
    return {
      authorization: undefined
    };
  }
};
