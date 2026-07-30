// Plain-text starting points for empty pages. The mobile editor saves plain
// text, so templates are markdown-flavoured strings (the web app renders each
// line as a paragraph).
export interface PageTemplate {
  id: string;
  name: string;
  text: string;
}

export const PAGE_TEMPLATES: PageTemplate[] = [
  {
    id: "meeting",
    name: "Meeting notes",
    text: "## Agenda\n- \n\n## Notes\n\n\n## Action items\n- [ ] ",
  },
  {
    id: "weekly-review",
    name: "Weekly review",
    text: "## What went well\n- \n\n## What didn't\n- \n\n## Focus for next week\n- [ ] ",
  },
  {
    id: "research",
    name: "Research",
    text: "## Question\n\n\n## Sources\n- \n\n## Notes\n\n\n## Summary\n",
  },
  {
    id: "journal",
    name: "Journal entry",
    text: "## Today\n\n\n## On my mind\n\n\n## Grateful for\n- ",
  },
];
