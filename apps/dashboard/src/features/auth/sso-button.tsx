import { useQuery } from "@tanstack/react-query";
import { LogInIcon } from "lucide-react";
import type { AuthStatus } from "yunidesk";
import { copy } from "@/lib/copy";
import { endpoints } from "@/lib/endpoints";
import { Button } from "@/components/ui/button";

/** Whether single sign-on is on (and required), for the sign-in and invite pages. */
export function useAuthStatus(): AuthStatus["sso"] {
  const status = useQuery({ queryKey: ["auth-status"], queryFn: endpoints.authStatus, staleTime: 30_000 });
  return status.data?.sso ?? { enabled: false, required: false };
}

/** A full-page navigation: the provider's sign-in, then back to the dashboard. */
export function SsoButton({ label = copy.auth.continueWithSso }: { label?: string }) {
  return (
    <Button asChild variant="outline" className="w-full">
      <a href={endpoints.ssoStartUrl}>
        <LogInIcon /> {label}
      </a>
    </Button>
  );
}

export function OrDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      {label}
      <span className="h-px flex-1 bg-border" />
    </div>
  );
}

const SSO_ERRORS = copy.auth.ssoErrors;

export function ssoErrorMessage(code: string): string {
  return code in SSO_ERRORS ? SSO_ERRORS[code as keyof typeof SSO_ERRORS] : SSO_ERRORS.unknown;
}
