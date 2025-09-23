import { useQuery } from "@tanstack/react-query";
import { client } from "../stores/ApiClient";

export const useHuggingFaceModels = () => {
  const {
    data: hfModels,
    isLoading: hfLoading,
    isFetching: hfIsFetching,
    error: hfError
  } = useQuery({
    queryKey: ["huggingFaceModels"],
    queryFn: async () => {
      const { data, error } = await client.GET("/api/models/huggingface", {});
      if (error) throw error;
      return data;
    },
    refetchOnWindowFocus: false
  });

  return {
    hfModels,
    hfLoading,
    hfIsFetching,
    hfError
  };
};
