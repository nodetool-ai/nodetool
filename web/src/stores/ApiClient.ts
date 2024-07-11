import createClient, { type Middleware } from "openapi-fetch";
import { paths } from "../api.js"; // (generated from openapi-typescript)
import { useAuth } from "./useAuth.js";

const mode: string = import.meta.env.MODE;

export const useRemoteAuth =
  mode === "production" ||
  mode === "staging" ||
  import.meta.env.VITE_REMOTE_AUTH === "true";

export const isDevelopment = mode === "development";
export const isStaging = mode === "staging";
export const isProduction = mode === "production";

export const BASE_URL =
  isDevelopment
    ? "http://" + window.location.hostname + ":8000"
    : isStaging
    ? "https://bqcu2fdqq5.eu-central-1.awsapprunner.com"
    : "https://api.nodetool.ai";

export const WORKER_URL = 
  isDevelopment
    ? "http://" + window.location.hostname + ":8000/api/jobs/"
    : "https://georgi--worker-app-worker-app.modal.run/predict"
    

export const pingWorker = () => {
  if (isDevelopment) {
    return;
  }
  const ts = new Date().getTime();
  const url = WORKER_URL.replace("predict", "?" + ts);
  fetch(url, {
    method: "GET",
  });
}


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
