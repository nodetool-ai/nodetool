import createClient, { type Middleware } from "openapi-fetch";
import { paths } from "../api.js"; // (generated from openapi-typescript)
import { useAuth } from "./useAuth.js";

export const useRemoteAuth =
  import.meta.env.MODE === "production" ||
  import.meta.env.MODE === "staging" ||
  import.meta.env.VITE_REMOTE_AUTH === "true";
export const isDevelopment = import.meta.env.MODE === "development";
export const isProduction = import.meta.env.MODE === "production";

export const BASE_URL =
  import.meta.env.MODE === "development"
    ? "http://" + window.location.hostname + ":8000"
    : import.meta.env.MODE === "staging"
    ? "https://bqcu2fdqq5.eu-central-1.awsapprunner.com"
    : "https://api.nodetool.ai";

export const WORKER_URL = BASE_URL + "/api/jobs/";

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
