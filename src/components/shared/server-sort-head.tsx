import Link from "next/link";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";

/**
 * A sortable `<TableHead>` for SERVER-paginated tables, where sort must run in
 * the DB query (client-side sort would only reorder the current page). The
 * header is a `<Link>` that toggles `?sort=&dir=` via the caller's `hrefFor`;
 * the page reads those params and applies `.order()`. `scroll={false}` keeps
 * the viewport put when re-sorting.
 */
export function ServerSortHead({
  sortKey,
  sort,
  dir,
  hrefFor,
  children,
  className,
}: {
  sortKey: string;
  sort: string | null;
  dir: "asc" | "desc";
  hrefFor: (sort: string, dir: "asc" | "desc") => string;
  children: React.ReactNode;
  className?: string;
}) {
  const active = sort === sortKey;
  const nextDir: "asc" | "desc" = active && dir === "asc" ? "desc" : "asc";
  return (
    <TableHead
      className={className}
      aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <Link
        href={hrefFor(sortKey, nextDir)}
        scroll={false}
        className="hover:text-foreground inline-flex items-center gap-1 select-none"
      >
        {children}
        {active ? (
          dir === "asc" ? (
            <ChevronUp className="size-3 shrink-0" aria-hidden />
          ) : (
            <ChevronDown className="size-3 shrink-0" aria-hidden />
          )
        ) : (
          <ChevronsUpDown className="size-3 shrink-0 opacity-40" aria-hidden />
        )}
      </Link>
    </TableHead>
  );
}
