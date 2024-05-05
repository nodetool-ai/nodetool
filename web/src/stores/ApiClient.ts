import createClient from "openapi-fetch";
import { paths } from "../api.js"; // (generated from openapi-typescript)
import { useLoginStore } from "./LoginStore";

export const useRemoteAuth =
  import.meta.env.MODE === "production" ||
  import.meta.env.VITE_REMOTE_AUTH === "true";
export const isDevelopment = import.meta.env.MODE === "development";
export const isProduction = import.meta.env.MODE === "production";

export const BASE_URL =
  import.meta.env.MODE === "development"
    ? "http://" + window.location.hostname + ":8000"
    : "https://api.nodetool.ai";

export const WORKER_URL =
  import.meta.env.MODE === "development"
    ? "http://" + window.location.hostname + ":8000/api/jobs/"
    : "https://api.nodetool.ai/api/jobs/";

export const client = createClient<paths>({
  baseUrl: BASE_URL
});

export const authHeader = () => {
  const user = useLoginStore.getState().readFromStorage();
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
