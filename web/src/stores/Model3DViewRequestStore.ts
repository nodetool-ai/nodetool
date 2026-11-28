/**
 * Model3DViewRequestStore — where a 3D model editor should look when it opens.
 *
 * "Edit set" on a timeline 3D clip asks the set's editor to start at the
 * shot's camera, so the user stages the set from the framing the reference is
 * drawn through. The request is keyed by asset id and is in memory only: a
 * tab restored after a reload opens framed on the whole scene as usual.
 */
import { create } from "zustand";

export interface Model3DViewRequest {
  position: [number, number, number];
  target: [number, number, number];
  /** Changes on every request, so asking for the same pose again moves the view. */
  nonce: number;
}

interface Model3DViewRequestState {
  requests: Record<string, Model3DViewRequest>;
  /** Ask the editor of `assetId` to look from `position` at `target`. */
  request: (
    assetId: string,
    pose: { position: [number, number, number]; target: [number, number, number] }
  ) => void;
}

let nextNonce = 0;

export const useModel3DViewRequestStore = create<Model3DViewRequestState>(
  (set) => ({
    requests: {},
    request: (assetId, pose) => {
      nextNonce += 1;
      set((state) => ({
        requests: {
          ...state.requests,
          [assetId]: {
            position: [...pose.position],
            target: [...pose.target],
            nonce: nextNonce
          }
        }
      }));
    }
  })
);
