import { QueryClient } from "@tanstack/react-query";
import { ApiError } from "../api/client";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: true,
      retry: (count, error) => {
        if (error instanceof ApiError && [401, 403, 404, 409, 422].includes(error.status)) return false;
        return count < 1;
      },
    },
  },
});
