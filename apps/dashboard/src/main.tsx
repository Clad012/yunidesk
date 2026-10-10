import "./index.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { setUnauthorizedHandler } from "@/lib/api";
import { queryClient } from "@/lib/query-client";
import { router } from "@/router";

setUnauthorizedHandler(() => {
  queryClient.clear();
  const path = router.state.location.pathname;
  if (!["/login", "/setup"].includes(path) && !path.startsWith("/invite/")) void router.navigate({ to: "/login" });
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
