import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeProvider } from "@mui/material/styles";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import mockTheme from "../../../__mocks__/themeMock";
import { trpcClient } from "../../../trpc/client";

jest.mock("../../../trpc/client", () => ({
  trpcClient: {
    customProviders: {
      list: { query: jest.fn() },
      save: { mutate: jest.fn() },
      delete: { mutate: jest.fn() },
      test: { mutate: jest.fn() }
    }
  }
}));

jest.mock("../../../stores/NotificationStore", () => ({
  useNotificationStore: <T,>(
    selector: (state: { addNotification: jest.Mock }) => T
  ) => selector({ addNotification: jest.fn() })
}));

import CustomProvidersSection from "../CustomProvidersSection";

const api = trpcClient.customProviders as unknown as {
  list: { query: jest.Mock };
  save: { mutate: jest.Mock };
  test: { mutate: jest.Mock };
};

const AGNES = {
  slug: "agnes",
  name: "Agnes",
  models: [],
  image_models: ["agnes-pro"],
  video_models: [],
  base_url: "https://agnes.example.com/v1",
  has_api_key: true,
  provider_id: "custom_agnes"
};

function renderSection(): void {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } }
  });
  render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider theme={mockTheme}>
        <CustomProvidersSection />
      </ThemeProvider>
    </QueryClientProvider>
  );
}

describe("CustomProvidersSection", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    api.list.query.mockResolvedValue([AGNES]);
    api.save.mutate.mockResolvedValue(AGNES);
    api.test.mutate.mockResolvedValue({
      ok: true,
      message: "9 chat models, 2 image models and 1 video model available.",
      counts: { language: 9, image: 2, video: 1 }
    });
  });

  it("saves image and video model ids and tests the endpoint afterwards", async () => {
    renderSection();
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));

    expect(screen.getByLabelText("Image models")).toHaveValue("agnes-pro");
    fireEvent.change(screen.getByLabelText("Video models"), {
      target: { value: "agnes-motion, agnes-clip" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(api.save.mutate).toHaveBeenCalledWith(
        expect.objectContaining({
          slug: "agnes",
          image_models: ["agnes-pro"],
          video_models: ["agnes-motion", "agnes-clip"]
        })
      )
    );
    await waitFor(() =>
      expect(api.test.mutate).toHaveBeenCalledWith({ slug: "agnes" })
    );
    expect(await screen.findByText("Image 2")).toBeInTheDocument();
    expect(screen.getByText("Video 1")).toBeInTheDocument();
    expect(screen.getByText("Chat 9")).toBeInTheDocument();
  });
});
