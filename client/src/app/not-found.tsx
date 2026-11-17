import { Link } from "react-router";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Page not found" description="The page you are looking for does not exist." />
      <Link to="/">
        <Button>Back to dashboard</Button>
      </Link>
    </>
  );
}
