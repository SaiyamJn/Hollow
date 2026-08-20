/** True when a key event would edit text instead of acting on a list item. */
export function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

function hasOpenDialog() {
  return !!(
    document.querySelector("[data-hollow-dialog]") ||
    document.querySelector('[role="dialog"][data-state="open"]') ||
    document.querySelector('[role="alertdialog"][data-state="open"]') ||
    document.querySelector('[aria-modal="true"]')
  );
}

/** Delete / Backspace on a focused or hovered item — never while typing. */
export function shouldHandleItemDelete(e: KeyboardEvent): boolean {
  if (e.key !== "Delete" && e.key !== "Backspace") return false;
  if (e.ctrlKey || e.metaKey || e.altKey) return false;
  if (e.repeat) return false;
  if (document.body.dataset.recordingKeybind === "1") return false;
  if (isTypingTarget(e.target)) return false;
  if (hasOpenDialog()) return false;
  return true;
}
