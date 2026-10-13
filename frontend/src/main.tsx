import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { queryClient } from "./lib/queryClient";
import { ThemeProvider } from "./theme/ThemeProvider";
import { FontProvider } from "./theme/FontProvider";
import { FocusColorsProvider } from "./theme/FocusColorsProvider";
import "./styles/globals.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <FontProvider>
          <FocusColorsProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </FocusColorsProvider>
        </FontProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </React.StrictMode>
);
