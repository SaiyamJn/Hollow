import { focusManager, QueryClient } from "@tanstack/react-query";
import { AppState, AppStateStatus } from "react-native";

focusManager.setEventListener((handleFocus) => {
  const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
    handleFocus(state === "active");
  });
  return () => sub.remove();
});

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: true,
      staleTime: 5000,
    },
  },
});
