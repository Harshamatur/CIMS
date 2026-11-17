import { Link } from "react-router";
import { ListSkeleton } from "@/components/feedback/states";
import { ErrorState } from "@/components/feedback/states";
import { EmptyState } from "@/components/feedback/states";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentUser } from "@/features/auth/auth";
import { RequestList } from "@/features/requests/request-list";
import { useRequests } from "@/features/requests/requests-api";
import { useDashboardSummary } from "./dashboard-api";
import type { DashboardSummary } from "@/types/api";

type MetricCard = { title: string; description: string; href?: string; value: number };

function Metric({ title, description, href, value }: MetricCard) {
  const contents = (
    <>
      <p className="text-sm font-medium text-muted">{title}</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">{value.toLocaleString()}</p>
      <p className="mt-1 text-xs text-muted">{description}</p>
    </>
  );
  const className = "block min-h-32 rounded-card border border-line bg-surface p-4 shadow-card hover:border-brand-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600";
  return href ? <Link to={href} className={className}>{contents}</Link> : <div className={className}>{contents}</div>;
}

function Metrics({ items }: { items: MetricCard[] }) {
  return (
    <section aria-label="Operational statistics" className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
      {items.map((item) => <Metric key={item.title} {...item} />)}
    </section>
  );
}

function OperationalSections({ summary }: { summary: DashboardSummary }) {
  if (summary.role === "EMPLOYEE") return null;
  const pending = summary.role === "ADMIN" ? summary.pendingRequests : summary.pendingIssueRequests;
  return <section className="mt-6 grid gap-4 lg:grid-cols-2" aria-label="Operational activity">
    <Card><CardHeader><CardTitle>{summary.role === "ADMIN" ? "Pending requests requiring attention" : "Requests awaiting physical issue"}</CardTitle><Link to={summary.role === "ADMIN" ? "/review" : "/issue"} className="text-sm text-brand-700 hover:underline">View queue</Link></CardHeader>{pending.length ? <RequestList items={pending} showRequester/> : <EmptyState title={summary.role === "ADMIN" ? "No requests awaiting a decision" : "No approved requests awaiting issue"}/>}</Card>
    <Card><CardHeader><CardTitle>{summary.role === "ADMIN" ? "Recent system activity" : "Recently completed handovers"}</CardTitle><Link to={summary.role === "ADMIN" ? "/audit-logs" : "/stock-transactions?type=ISSUE"} className="text-sm text-brand-700 hover:underline">{summary.role === "ADMIN" ? "View audit logs" : "Issue history"}</Link></CardHeader>
      {summary.role === "ADMIN" ? summary.recentActivity.length ? <ul className="divide-y divide-line">{summary.recentActivity.map((a) => <li key={a.id} className="flex flex-wrap justify-between gap-2 px-4 py-3 text-sm"><span><strong>{a.action.replaceAll("_", " ")}</strong><span className="text-muted"> · {a.entityType} · {a.actorName ?? "System"}</span></span><time className="text-xs text-muted">{new Date(a.createdAt).toLocaleString()}</time></li>)}</ul> : <EmptyState title="No recorded activity"/> : summary.recentHandovers.length ? <ul className="divide-y divide-line">{summary.recentHandovers.slice(0, 5).map((t) => <li key={t.id} className="flex justify-between gap-3 px-4 py-3 text-sm"><span>{t.chemical.name} · {t.quantity} {t.packSize.label}</span><time className="whitespace-nowrap text-xs text-muted">{new Date(t.createdAt).toLocaleString()}</time></li>)}</ul> : <EmptyState title="No completed handovers yet"/>}
    </Card>
    <Card><CardHeader><CardTitle>Low-stock chemicals</CardTitle><Link to={summary.role === "ADMIN" ? "/inventory?lowOnly=true" : "/reports#low-stock"} className="text-sm text-brand-700 hover:underline">View low stock</Link></CardHeader>{summary.lowStockItems.length ? <ul className="divide-y divide-line">{summary.lowStockItems.map((item) => <li key={`${item.chemicalCode}-${item.packLabel}`} className="flex justify-between gap-3 px-4 py-3 text-sm"><span>{item.chemicalName}<span className="block text-xs text-muted">{item.chemicalCode} · {item.packLabel}</span></span><span className="whitespace-nowrap text-right tabular-nums">{item.availableQuantity} / {item.minimumQuantity}<span className="block text-xs text-muted">available / minimum</span></span></li>)}</ul> : <EmptyState title="No low-stock alerts"/>}</Card>
    <Card><CardHeader><CardTitle>Recent stock movements</CardTitle><Link to="/stock-transactions" className="text-sm text-brand-700 hover:underline">Transaction history</Link></CardHeader>{summary.recentTransactions.length ? <ul className="divide-y divide-line">{summary.recentTransactions.map((t) => <li key={t.id} className="flex justify-between gap-3 px-4 py-3 text-sm"><span>{t.transactionType.replaceAll("_", " ")} · {t.chemical.name} ({t.quantity} packs)</span><time className="whitespace-nowrap text-xs text-muted">{new Date(t.createdAt).toLocaleString()}</time></li>)}</ul> : <EmptyState title="No stock movements recorded"/>}</Card>
    {summary.role === "ADMIN" && <Card><CardBody><p className="text-sm text-muted">Rejected requests in scope: <strong className="tabular-nums text-ink">{summary.rejected.toLocaleString()}</strong></p><Link to="/review?status=REJECTED" className="mt-2 inline-block text-sm text-brand-700 hover:underline">Review rejected requests</Link></CardBody></Card>}
  </section>;
}

function cards(summary: DashboardSummary): MetricCard[] {
  if (summary.role === "EMPLOYEE") return [
    { title: "Awaiting Review", description: "Your submitted requests awaiting an administrator's decision.", href: "/requests?status=SUBMITTED", value: summary.awaitingReview },
    { title: "Approved", description: "Approved requests awaiting physical issue.", href: "/requests?status=APPROVED", value: summary.approved },
    { title: "Partially Issued", description: "Requests with approved quantities still to be handed over.", href: "/requests?status=PARTIALLY_ISSUED", value: summary.partiallyIssued },
    { title: "Fully Issued", description: "Requests whose approved quantities have all been handed over.", href: "/requests?status=ISSUED", value: summary.fullyIssued },
  ];
  if (summary.role === "ADMIN") return [
    { title: "Total Requests", description: "Requests visible in your authorized administration scope.", href: "/review?status=DRAFT,SUBMITTED,APPROVED,REJECTED,PARTIALLY_ISSUED,ISSUED,CANCELLED", value: summary.totalRequests },
    { title: "Awaiting Decision", description: "Submitted requests waiting for review.", href: "/review?status=SUBMITTED", value: summary.awaitingDecision },
    { title: "Approved", description: "Approved requests awaiting physical issue.", href: "/review?status=APPROVED", value: summary.approved },
    { title: "Partially Issued", description: "Requests with approved quantities remaining to issue.", href: "/review?status=PARTIALLY_ISSUED", value: summary.partiallyIssued },
    { title: "Fully Issued", description: "Requests whose approved quantities have all been issued.", href: "/review?status=ISSUED", value: summary.fullyIssued },
    { title: "Low Stock Alerts", description: "Active inventory balances at or below their configured threshold.", href: "/inventory?lowOnly=true", value: summary.lowStockAlerts },
  ];
  return [
    { title: "Ready to Issue", description: "Approved requests awaiting physical handover.", href: "/issue?status=APPROVED", value: summary.readyToIssue },
    { title: "Partially Issued", description: "Requests with remaining approved quantities.", href: "/issue?status=PARTIALLY_ISSUED", value: summary.partiallyIssued },
    { title: "Issued Today", description: "Requests with a stock handover recorded today.", href: "/issue?status=ISSUED", value: summary.issuedToday },
    { title: "Low Stock Alerts", description: "Active inventory balances at or below their configured threshold.", href: "/reports#low-stock", value: summary.lowStockAlerts },
  ];
}

export function DashboardPage() {
  const me = useCurrentUser();
  const summary = useDashboardSummary();
  const recent = useRequests({ requestedBy: me.id, page: 1, pageSize: 5 }, me.role === "EMPLOYEE");
  const firstName = me.fullName.split(" ")[0] ?? me.fullName;
  const description = me.role === "EMPLOYEE"
    ? "Your chemical requests at a glance."
    : me.role === "ADMIN"
      ? "Monitor requests, inventory and departmental operations."
      : "Manage approved chemical requests and stock handovers.";

  return (
    <>
      <PageHeader
        title={`Welcome, ${firstName}`}
        description={description}
        actions={<Link to={me.role === "EMPLOYEE" ? "/requests/new" : me.role === "ADMIN" ? "/review" : "/issue"}><Button>{me.role === "EMPLOYEE" ? "New request" : me.role === "ADMIN" ? "Review pending requests" : "Open issue desk"}</Button></Link>}
      />
      {summary.isPending ? (
        <section aria-label="Operational statistics" className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: me.role === "ADMIN" ? 6 : 4 }, (_, i) => <div key={i} className="min-h-32 rounded-card border border-line bg-surface p-4 shadow-card"><Skeleton className="h-4 w-32" /><Skeleton className="mt-3 h-9 w-14" /><Skeleton className="mt-3 h-3 w-4/5" /></div>)}
        </section>
      ) : summary.isError ? (
        <div className="rounded-card border border-line bg-surface p-4"><ErrorState error={summary.error} onRetry={() => void summary.refetch()} /></div>
      ) : (
        <Metrics items={cards(summary.data)} />
      )}

      {!summary.isPending && !summary.isError && <OperationalSections summary={summary.data} />}

      {me.role === "EMPLOYEE" && <Card className="mt-6">
        <CardHeader>
          <CardTitle>Recent requests</CardTitle>
          <Link to="/requests" className="text-sm text-brand-700 hover:underline">View all</Link>
        </CardHeader>
        {recent.isPending ? <ListSkeleton rows={3} /> : recent.isError || recent.data.data.length === 0 ? (
          <CardBody><p className="text-sm text-muted">{recent.isError ? "Recent requests could not be loaded." : "No requests yet. Create your first request to get started."}</p></CardBody>
        ) : <RequestList items={recent.data.data} />}
      </Card>}
    </>
  );
}
