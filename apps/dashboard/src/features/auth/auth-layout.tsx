import type { ReactNode } from "react";
import { ShieldCheckIcon } from "lucide-react";
import { copy } from "@/lib/copy";
import { BlurFade } from "@/components/magicui/blur-fade";
import { BorderBeam } from "@/components/magicui/border-beam";
import { DotPattern } from "@/components/magicui/dot-pattern";

export function AuthLayout({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="relative flex min-h-full items-center justify-center overflow-hidden bg-background p-6">
      <DotPattern className="[mask-image:radial-gradient(520px_circle_at_center,white,transparent)]" />
      <BlurFade className="relative w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <img src="/favicon.svg" alt="" className="size-11 rounded-2xl shadow-lg shadow-black/20" />
          <div className="space-y-1">
            <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
            {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
          </div>
        </div>
        <div className="relative overflow-hidden rounded-2xl border bg-card p-6 shadow-xl shadow-black/5">
          {children}
          <BorderBeam duration={10} size={120} />
        </div>
        <p className="mt-5 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheckIcon className="size-3.5" /> {copy.auth.eu}
        </p>
      </BlurFade>
    </div>
  );
}
