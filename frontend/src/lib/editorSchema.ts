import { BlockNoteSchema, defaultBlockSpecs } from "@blocknote/core";
import { AnnotationBlockSpec } from "../components/editor/AnnotationBlock";

/**
 * Hollow page editor schema:
 * Standard Enter key creates a new block; Shift+Enter creates a soft line break.
 * Includes custom Annotation block for stylus/pen drawing and handwriting.
 */
export const hollowEditorSchema = BlockNoteSchema.create({
  blockSpecs: {
    ...defaultBlockSpecs,
    annotation: AnnotationBlockSpec(),
  },
});
