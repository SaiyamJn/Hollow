import { BlockNoteSchema, createExtension, defaultBlockSpecs } from "@blocknote/core";

/** Enter inserts a soft line break instead of a new block. */
function withSoftEnter<T>(spec: T): T {
  const s = spec as {
    implementation: { meta?: Record<string, unknown> };
  };
  return {
    ...s,
    implementation: {
      ...s.implementation,
      meta: {
        ...s.implementation.meta,
        hardBreakShortcut: "enter",
      },
    },
  } as T;
}

/**
 * Hollow page editor schema: paragraphs (and quotes) behave like a normal
 * document — Enter = new line inside the same block. Headings / lists keep
 * BlockNote's default Enter = new block, since that's how those structures work.
 */
export const hollowEditorSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    paragraph: withSoftEnter(defaultBlockSpecs.paragraph),
    quote: withSoftEnter(defaultBlockSpecs.quote),
  },
});

/** Shift+Enter starts a new paragraph block when you intentionally want a split. */
export const newBlockOnShiftEnter = createExtension({
  key: "hollow-shift-enter-new-block",
  keyboardShortcuts: {
    "Shift-Enter": ({ editor }) => {
      const { block } = editor.getTextCursorPosition();
      // Only override soft-enter blocks; lists/headings keep native Shift+Enter.
      if (block.type !== "paragraph" && block.type !== "quote") return false;
      const inserted = editor.insertBlocks([{ type: "paragraph" }], block, "after");
      if (inserted[0]) {
        editor.setTextCursorPosition(inserted[0], "start");
        return true;
      }
      return false;
    },
  },
});
