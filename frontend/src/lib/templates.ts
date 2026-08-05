import type { PartialBlock } from "@blocknote/core";

interface PageTemplate {
  id: string;
  name: string;
  blocks: PartialBlock[];
}

// Starting points for empty pages. Kept as plain BlockNote block arrays so
// applying one is a single editor.replaceBlocks call.
export const PAGE_TEMPLATES: PageTemplate[] = [
  {
    id: "meeting",
    name: "Meeting notes",
    blocks: [
      { type: "heading", props: { level: 2 }, content: "Agenda" },
      { type: "bulletListItem", content: "" },
      { type: "heading", props: { level: 2 }, content: "Notes" },
      { type: "paragraph", content: "" },
      { type: "heading", props: { level: 2 }, content: "Action items" },
      { type: "checkListItem", content: "" },
    ],
  },
  {
    id: "weekly-review",
    name: "Weekly review",
    blocks: [
      { type: "heading", props: { level: 2 }, content: "What went well" },
      { type: "bulletListItem", content: "" },
      { type: "heading", props: { level: 2 }, content: "What didn't" },
      { type: "bulletListItem", content: "" },
      { type: "heading", props: { level: 2 }, content: "Focus for next week" },
      { type: "checkListItem", content: "" },
    ],
  },
  {
    id: "research",
    name: "Research",
    blocks: [
      { type: "heading", props: { level: 2 }, content: "Question" },
      { type: "paragraph", content: "" },
      { type: "heading", props: { level: 2 }, content: "Sources" },
      { type: "bulletListItem", content: "" },
      { type: "heading", props: { level: 2 }, content: "Notes" },
      { type: "paragraph", content: "" },
      { type: "heading", props: { level: 2 }, content: "Summary" },
      { type: "paragraph", content: "" },
    ],
  },
  {
    id: "journal",
    name: "Journal entry",
    blocks: [
      { type: "heading", props: { level: 2 }, content: "Today" },
      { type: "paragraph", content: "" },
      { type: "heading", props: { level: 2 }, content: "On my mind" },
      { type: "paragraph", content: "" },
      { type: "heading", props: { level: 2 }, content: "Grateful for" },
      { type: "bulletListItem", content: "" },
    ],
  },
];
