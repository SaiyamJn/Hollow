/** Strip lock secrets so password hashes / salts never leave the API. */

type AnyRec = Record<string, unknown>;

export function publicNotebook<T extends AnyRec>(notebook: T): Omit<T, "passwordHash" | "salt"> {
  const { passwordHash: _h, salt: _s, ...rest } = notebook;
  if (Array.isArray(rest.sections)) {
    return { ...rest, sections: rest.sections.map((s) => publicSection(s as AnyRec)) } as Omit<
      T,
      "passwordHash" | "salt"
    >;
  }
  return rest as Omit<T, "passwordHash" | "salt">;
}

export function publicSection<T extends AnyRec>(section: T): Omit<T, "passwordHash" | "salt"> {
  const { passwordHash: _h, salt: _s, ...rest } = section;
  if (rest.notebook && typeof rest.notebook === "object") {
    return { ...rest, notebook: publicNotebook(rest.notebook as AnyRec) } as Omit<T, "passwordHash" | "salt">;
  }
  return rest as Omit<T, "passwordHash" | "salt">;
}

export function publicPage<T extends AnyRec>(page: T): T {
  if (page.section && typeof page.section === "object") {
    return { ...page, section: publicSection(page.section as AnyRec) };
  }
  return page;
}
