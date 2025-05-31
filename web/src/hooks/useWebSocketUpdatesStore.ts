import { useState, useEffect } from "react";
import {
  createWebSocketUpdatesStore,
  WebSocketUpdatesStore
} from "../stores/WebSocketUpdatesStore";

export const useWebSocketUpdatesStore = (): WebSocketUpdatesStore => {
  const [store] = useState(() => createWebSocketUpdatesStore());

  useEffect(() => {
    store.getState().connect();
    return () => store.getState().disconnect();
  }, [store]);

  return store;
};
