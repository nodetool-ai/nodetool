import { renderHook } from "@testing-library/react";

const invalidateVersions = jest.fn();
const invalidateReleased = jest.fn();
const invalidateDocument = jest.fn();
const publishMutation = jest.fn((options) => options);
const releaseMutation = jest.fn((options) => options);

jest.mock("../../trpc/client", () => ({
  trpc: {
    useUtils: () => ({
      applications: {
        versions: { invalidate: invalidateVersions },
        released: { invalidate: invalidateReleased },
        releasedDocument: { invalidate: invalidateDocument }
      }
    }),
    applications: {
      publish: { useMutation: (options: unknown) => publishMutation(options) },
      release: { useMutation: (options: unknown) => releaseMutation(options) }
    }
  }
}));

import {
  usePublishApplication,
  useReleaseApplicationVersion
} from "../useApplications";

beforeEach(() => jest.clearAllMocks());

describe("application release mutations", () => {
  it.each([usePublishApplication, useReleaseApplicationVersion])(
    "%p refreshes the runtime document after the release changes",
    (useMutation) => {
      renderHook(() => useMutation());
      const mutation =
        useMutation === usePublishApplication
          ? publishMutation
          : releaseMutation;
      mutation.mock.calls[0][0].onSuccess({ applicationId: "app-1" });
      expect(invalidateDocument).toHaveBeenCalledWith({ id: "app-1" });
    }
  );
});
