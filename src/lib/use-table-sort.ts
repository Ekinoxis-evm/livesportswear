"use client";

import { useMemo, useState } from "react";

/**
 * Headless click-to-sort for any table. The caller supplies an `accessors` map
 * — one comparable value per sortable column key (the RAW number/string, never
 * the formatted display like "$118.40") — and gets back sorted rows plus the
 * current sort state and a toggler. Clicking a column sorts ascending, clicking
 * again flips to descending. Empty/null values always sort last, in both
 * directions; ties keep input order (stable).
 *
 * The comparator is exported separately so it's unit-tested without React.
 */

export type SortDir = "asc" | "desc";
export type SortState = { key: string; dir: SortDir } | null;
export type SortValue = string | number | null | undefined;
export type Accessors<T> = Record<string, (row: T) => SortValue>;

function compareValues(a: SortValue, b: SortValue): number {
  const aEmpty = a == null || a === "";
  const bEmpty = b == null || b === "";
  if (aEmpty || bEmpty) return aEmpty ? (bEmpty ? 0 : 1) : -1; // empties last
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

/** Pure, stable sort. Empties sink to the bottom regardless of direction. */
export function sortRows<T>(
  rows: T[],
  accessor: (row: T) => SortValue,
  dir: SortDir,
): T[] {
  return rows
    .map((row, i) => [row, i] as const)
    .sort(([a, ia], [b, ib]) => {
      const va = accessor(a);
      const vb = accessor(b);
      const aEmpty = va == null || va === "";
      const bEmpty = vb == null || vb === "";
      // Empties always last, never flipped by direction.
      if (aEmpty || bEmpty) return aEmpty && bEmpty ? ia - ib : aEmpty ? 1 : -1;
      const c = compareValues(va, vb);
      if (c === 0) return ia - ib; // stable
      return dir === "asc" ? c : -c;
    })
    .map(([row]) => row);
}

export function useTableSort<T>(
  rows: T[],
  accessors: Accessors<T>,
  initial: SortState = null,
) {
  const [sort, setSort] = useState<SortState>(initial);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const accessor = accessors[sort.key];
    if (!accessor) return rows;
    return sortRows(rows, accessor, sort.dir);
    // accessors is a fresh literal each render but behaviourally stable; keying
    // on sort + rows is what actually changes the result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, sort]);

  const onSort = (key: string) =>
    setSort((cur) =>
      cur?.key === key
        ? { key, dir: cur.dir === "asc" ? "desc" : "asc" }
        : { key, dir: "asc" },
    );

  return { rows: sorted, sort, onSort };
}
