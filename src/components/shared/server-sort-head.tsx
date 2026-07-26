import Link from "next/link";
import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";
import { TableHead } from "@/components/ui/table";

/**
 * Sortable headers for SERVER-paginated tables, where sort must run in the DB
 * query (client-side sort would only reorder the current page). The header is a
 * `<Link>` that toggles `?sort=&dir=` via the caller's `hrefFor`; the page reads
 * those params and applies `.order()`. `scroll={false}` keeps the viewport put.
 *
 * `ServerSortHead` wraps a shadcn `<TableHead>`; `ServerSortTh` is the plain
 * `<th>` version for hand-rolled `<table>`s inside `ScrollTable`.
 */

function ariaSort(active: boolean, dir: "asc" | "desc") {
  return active ? (dir === "asc" ? "ascending" : "descending") : "none";
}

/** Just the clickable label + caret — shared by both header shells. */
export function ServerSortLink({
  sortKey,
  sort,
  dir,
  hrefFor,
  children,
}: {
  sortKey: string;
  sort: string | null;
  dir: "asc" | "desc";
  hrefFor: (sort: string, dir: "asc" | "desc") => string;
  children: React.ReactNode;
}) {
  const active = sort === sortKey;
  const nextDir: "asc" | "desc" = active && dir === "asc" ? "desc" : "asc";
  return (
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
  );
}

type HeadProps = {
  sortKey: string;
  sort: string | null;
  dir: "asc" | "desc";
  hrefFor: (sort: string, dir: "asc" | "desc") => string;
  children: React.ReactNode;
  className?: string;
};

/** shadcn `<TableHead>` version (for `<Table>` call sites, e.g. inventory book). */
export function ServerSortHead({ sortKey, sort, dir, hrefFor, children, className }: HeadProps) {
  return (
    <TableHead className={className} aria-sort={ariaSort(sort === sortKey, dir)}>
      <ServerSortLink sortKey={sortKey} sort={sort} dir={dir} hrefFor={hrefFor}>
        {children}
      </ServerSortLink>
    </TableHead>
  );
}

/** Plain `<th>` version (for hand-rolled `<table>`s in `ScrollTable`). */
export function ServerSortTh({ sortKey, sort, dir, hrefFor, children, className }: HeadProps) {
  return (
    <th className={className} aria-sort={ariaSort(sort === sortKey, dir)}>
      <ServerSortLink sortKey={sortKey} sort={sort} dir={dir} hrefFor={hrefFor}>
        {children}
      </ServerSortLink>
    </th>
  );
}
