import { Head } from "@inertiajs/react";

import { LinksTable } from "../../components/LinksTable";
import type { Page } from "../../page-props";

export default function LinksIndex({ links, projects }: Page<"Links/Index">) {
  return (
    <>
      <Head title="Links" />
      <h1 className="text-xl font-semibold">Links</h1>
      <LinksTable links={links} projects={projects} />
    </>
  );
}
