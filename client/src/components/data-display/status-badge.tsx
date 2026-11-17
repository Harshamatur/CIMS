import {
  Ban,
  CircleCheck,
  CircleX,
  Clock,
  FileText,
  PackageCheck,
  PackageOpen,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { RequestStatus } from "@/types/api";

interface StatusMeta {
  label: string;
  /** Plain-language meaning so people never confuse "approved" with "handed over". */
  meaning: string;
  tone: "neutral" | "info" | "ok" | "warn" | "bad";
  Icon: LucideIcon;
}

export const STATUS_META: Record<RequestStatus, StatusMeta> = {
  DRAFT: { label: "Draft", meaning: "Not submitted yet.", tone: "neutral", Icon: FileText },
  SUBMITTED: {
    label: "Awaiting review",
    meaning: "Submitted; waiting for an administrator's decision.",
    tone: "warn",
    Icon: Clock,
  },
  APPROVED: {
    label: "Approved",
    meaning: "Authorised, but the chemicals have not been handed over yet.",
    tone: "info",
    Icon: CircleCheck,
  },
  PARTIALLY_ISSUED: {
    label: "Partially issued",
    meaning: "Some of the approved quantity has been handed over.",
    tone: "info",
    Icon: PackageOpen,
  },
  ISSUED: {
    label: "Issued",
    meaning: "All approved chemicals have been handed over.",
    tone: "ok",
    Icon: PackageCheck,
  },
  REJECTED: { label: "Rejected", meaning: "The request was declined.", tone: "bad", Icon: CircleX },
  CANCELLED: { label: "Cancelled", meaning: "The request was cancelled.", tone: "neutral", Icon: Ban },
};

/** Always text + icon, never colour alone. */
export function StatusBadge({ status }: { status: RequestStatus }) {
  const { label, tone, Icon } = STATUS_META[status];
  return (
    <Badge tone={tone}>
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </Badge>
  );
}
