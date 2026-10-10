import { Outlet } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useApplyTheme } from "@/hooks/use-theme";

export function RootLayout() {
  useApplyTheme();
  return (
    <TooltipProvider delayDuration={300}>
      <Outlet />
      <Toaster />
    </TooltipProvider>
  );
}
