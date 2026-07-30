/** Mark navigations that should return to /search on back. */
export const FROM_SEARCH_QUERY = "from=search";

export function pathWithFromSearch(path: string): string {
  const [base, existing] = path.split("?");
  if (existing?.includes("from=search")) return path;
  return existing ? `${base}?${existing}&from=search` : `${base}?from=search`;
}

export function isFromSearchParam(
  value: string | null | undefined,
): boolean {
  return value === "search";
}
