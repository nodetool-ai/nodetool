import { useQuery } from "@tanstack/react-query";
import { client } from "../stores/ApiClient";

export const useOllamaModels = () => {
  const {
    data: ollamaModels,
    isLoading: ollamaLoading,
    isFetching: ollamaIsFetching,
    error: ollamaError
  } = useQuery({
    queryKey: ["ollamaModels"],
    queryFn: async () => {
      const { data, error } = await client.GET("/api/models/ollama", {});
      if (error) {throw error;}
      return data;
    },
    refetchOnWindowFocus: false
  });

  return {
    ollamaModels,
    ollamaLoading,
    ollamaIsFetching,
    ollamaError
  };
};
