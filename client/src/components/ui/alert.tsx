import { CircleAlert, CircleCheck, Info, TriangleAlert } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const TONES = {
  info: { box: "border-info-700/25 bg-info-50 text-info-700", Icon: Info },
  ok: { box: "border-ok-700/25 bg-ok-50 text-ok-700", Icon: CircleCheck },
  warn: { box: "border-warn-700/25 bg-warn-50 text-warn-700", Icon: TriangleAlert },
  bad: { box: "border-bad-700/25 bg-bad-50 text-bad-700", Icon: CircleAlert },
} as const;

export function Alert({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: keyof typeof TONES;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const { box, Icon } = TONES[tone];
  return (
    <div
      role={tone === "bad" ? "alert" : "status"}
      className={cn("flex gap-3 rounded-md border p-3 text-sm", box, className)}
    >
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 space-y-0.5">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="break-words">{children}</div>}
      </div>
    </div>
  );
}
