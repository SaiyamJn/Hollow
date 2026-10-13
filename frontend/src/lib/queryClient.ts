import { QueryClient } from "@tanstack/react-query";

// retry:false matters here — a 423 (locked section) or 401 must surface
// immediately so the unlock dialog can open, not be retried.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
      // Avoid refetch storms when navigating between screens that share keys.
      staleTime: 30_000,
    },
  },
});
