import axios from "axios";

export async function fetchHuggingFaceRepoInfo(repoId: string): Promise<any> {
  const response = await axios.get(
    `https://huggingface.co/api/models/${repoId}`
  );
  return response.data;
}
