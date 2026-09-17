import Link from "next/link";

import { buttonClass } from "@/shared/ui/button";
import { Card, CardBody, CardHeader } from "@/shared/ui/card";
import { PageHeader } from "@/shared/ui/page-header";

export default function HomePage() {
  return (
    <main className="ui-page ui-stack">
      <PageHeader
        eyebrow="Starter"
        title="Bootstrap App"
        description="A minimal Next.js app laid out feature-first: one vertical slice, one REST namespace, and the ESLint rules that keep the layers apart."
      />

      <Card>
        <CardHeader
          title="Notes"
          description="The example feature. Read it as the template for every new slice."
        />
        <CardBody>
          <Link className={buttonClass("primary")} href="/notes">
            Open notes
          </Link>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title="API"
          description="Every mutation is a REST route handler under /api/v1, described by a generated OpenAPI document."
        />
        <CardBody>
          <Link className={buttonClass("secondary")} href="/api/v1/openapi.json">
            View openapi.json
          </Link>
        </CardBody>
      </Card>
    </main>
  );
}
