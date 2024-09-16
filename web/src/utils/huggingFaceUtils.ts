import axios from "axios";

export async function fetchModelInfo(repoId: string): Promise<any> {
  try {
    const response = await axios.get(
      `https://huggingface.co/api/models/${repoId}`
    );
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        throw new Error(
          `Failed to fetch model info: ${error.response.status} ${error.response.statusText}`
        );
      } else if (error.request) {
        throw new Error("No response received from Hugging Face API");
      } else {
        throw new Error(`Error setting up the request: ${error.message}`);
      }
    } else {
      throw new Error(
        `Unexpected error: ${error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}
