import { withBase } from "@/lib/base";
import type { ComponentProps } from "react";

/** A plain anchor. The docs site is static HTML, so there is no client router. */
export function Link({ href, ...rest }: ComponentProps<"a">) {
  return <a href={href === undefined ? href : withBase(href)} {...rest} />;
}
