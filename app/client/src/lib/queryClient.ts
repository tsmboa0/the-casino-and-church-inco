import { QueryClient } from "@tanstack/react-query";

// Basic QueryClient instance for future use with react-query
// Currently not used in the application
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
