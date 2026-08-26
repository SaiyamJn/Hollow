import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCreateBlockNote, SuggestionMenuController } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import type { PartialBlock } from "@blocknote/core";
import { withCollaboration } from "@blocknote/core/yjs";
import { Lock, LockOpen, Maximize2, Minimize2, ShieldCheck, ShieldOff, Trash2, X } from "lucide-react";
import clsx from "clsx";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import {
  addTagToPage,
  deletePage,
  fetchBacklinks,
  fetchNotebooks,
  fetchOutlinks,
  fetchPage,
  lockSection,
  removeSectionLock,
  removeTagFromPage,
  renamePage,
  savePageContent,
  unlockSection,
} from "../lib/api";
import type { Page } from "../lib/types";
import { useTheme } from "../theme/ThemeProvider";
import { useAuthStore } from "../stores/auth";
import { useUnlockStore } from "../stores/unlock";
import { useUiStore } from "../stores/ui";
import { formatCombo, useKeybindsStore } from "../lib/keybinds";
import { hollowEditorSchema, newBlockOnShiftEnter } from "../lib/editorSchema";
import { usePageCollab, CollabSession } from "../hooks/usePageCollab";
import { PasswordDialog } from "../components/PasswordDialog";
import { Button } from "../components/ui/button";
import { Dialog, DialogContent } from "../components/ui/dialog";
import { PAGE_TEMPLATES } from "../lib/templates";
import {
  findEditorScrollParent,
  loadPagePosition,
  savePagePosition,
} from "../lib/pagePosition";

// Deterministic per-user cursor color for collaborative editing.
const CURSOR_COLORS = ["#5ee9b5", "#60a5fa", "#c084fc", "#f87171", "#eab308", "#f472b6"];
function colorFor(userId: string | undefined): string {
  let hash = 0;
  for (const ch of userId ?? "") hash = (hash * 31 + ch.charCodeAt(0)) | 0;
  return CURSOR_COLORS[Math.abs(hash) % CURSOR_COLORS.length];
}

function parseContent(raw: string): PartialBlock[] | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    // legacy/plain content: one paragraph per line
  }
  return raw.split("\n").map((line) => ({ type: "paragraph", content: line }) as PartialBlock);
}

export default function PageEditor() {
  const { notebookId, sectionId, pageId } = useParams() as {
    notebookId: string;
    sectionId: string;
    pageId: string;
  };
  const setActiveNotebook = useUiStore((s) => s.setActiveNotebook);
  const password = useUnlockStore((s) => s.sectionPasswords[sectionId]);
  const setSectionPassword = useUnlockStore((s) => s.setSectionPassword);
  const [unlockOpen, setUnlockOpen] = useState(false);

  useEffect(() => setActiveNotebook(notebookId), [notebookId, setActiveNotebook]);

  const {
    data: page,
    error,
    isLoading,
    isFetching,
    refetch,
  } = useQuery({
    queryKey: ["page", pageId, password ?? null],
    queryFn: () => fetchPage(pageId, password),
    retry: 2,
    retryDelay: (n) => Math.min(1000 * 2 ** n, 4000),
    staleTime: 15_000,
  });

  const status = (error as any)?.response?.status;
  const locked = status === 423 || status === 401;

  if (locked) {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-4 animate-rise-in">
        <div className="vault-seal h-16 w-16 rounded-2xl border border-border glass flex items-center justify-center">
          <Lock size={22} className="text-accent" />
        </div>
        <div className="text-center">
          <p className="text-sm font-medium">This section is sealed</p>
          <p className="text-xs text-secondary mt-1">Only your password can open it.</p>
        </div>
        <Button onClick={() => setUnlockOpen(true)}>Unlock</Button>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] text-secondary">
          <ShieldCheck size={12} className="text-accent" /> AES-256-GCM · encrypted at rest
        </span>
        <PasswordDialog
          open={unlockOpen}
          onOpenChange={setUnlockOpen}
          title="Unlock section"
          submitLabel="Unlock"
          onSubmit={async (pw) => {
            try {
              await unlockSection(sectionId, pw);
              setSectionPassword(sectionId, pw);
              return null;
            } catch (err: any) {
              return err.response?.data?.error ?? "Incorrect password";
            }
          }}
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="w-full px-8 md:px-12 lg:px-16 py-10 text-sm text-secondary">
        Loading page…
      </div>
    );
  }
  if (error || !page) {
    return (
      <div className="w-full px-8 md:px-12 lg:px-16 py-10 space-y-3">
        <p className="text-sm text-secondary">Couldn't load this page.</p>
        <Button variant="ghost" disabled={isFetching} onClick={() => void refetch()}>
          {isFetching ? "Retrying…" : "Try again"}
        </Button>
      </div>
    );
  }

  return (
    <CollabGate
      key={`${pageId}:${password ?? ""}`}
      page={page}
      notebookId={notebookId}
      sectionId={sectionId}
      password={password}
    />
  );
}

// Editor mounts only once the Yjs session is synced, so the document renders
// from the shared CRDT state rather than a REST snapshot.
function CollabGate({
  page,
  notebookId,
  sectionId,
  password,
}: {
  page: Page;
  notebookId: string;
  sectionId: string;
  password?: string;
}) {
  const { session, error } = usePageCollab(page.id, password);
  if (error && !session) {
    return (
      <div className="w-full px-8 md:px-12 lg:px-16 py-10 text-sm text-secondary">
        Couldn't open editor: {error}
      </div>
    );
  }
  if (!session) {
    return (
      <div className="w-full px-8 md:px-12 lg:px-16 py-10 text-sm text-secondary">
        Opening editor…
      </div>
    );
  }
  return (
    <Editor
      page={page}
      notebookId={notebookId}
      sectionId={sectionId}
      password={password}
      session={session}
    />
  );
}

function Editor({
  page,
  notebookId,
  sectionId,
  password,
  session,
}: {
  page: Page;
  notebookId: string;
  sectionId: string;
  password?: string;
  session: CollabSession;
}) {
  const { theme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const shouldAutoFocus = Boolean((location.state as { autoFocus?: boolean } | null)?.autoFocus);
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const focusMode = useUiStore((s) => s.focusMode);
  const setFocusMode = useUiStore((s) => s.setFocusMode);
  const setSectionPassword = useUnlockStore((s) => s.setSectionPassword);
  const relockSection = useUnlockStore((s) => s.relockSection);
  const focusBind = useKeybindsStore((s) => s.binds.focus);
  const escapeBind = useKeybindsStore((s) => s.binds.escape);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [title, setTitle] = useState(page.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  const [removeLockOpen, setRemoveLockOpen] = useState(false);
  // Offer templates only on brand-new pages (first client, nothing saved yet).
  const [showTemplates, setShowTemplates] = useState(session.seed && !page.content);
  const saveTimer = useRef<number | null>(null);
  const latestContent = useRef<string | null>(null);
  const editorShellRef = useRef<HTMLDivElement>(null);
  const restoredRef = useRef(false);
  const [deleting, setDeleting] = useState(false);

  const editor = useCreateBlockNote(
    withCollaboration({
      schema: hollowEditorSchema,
      extensions: [newBlockOnShiftEnter],
      // Focus after we restore the last caret/scroll — autofocus would jump to top.
      autofocus: false,
      collaboration: {
        provider: { awareness: session.awareness },
        fragment: session.doc.getXmlFragment("document-store"),
        user: { name: user?.name ?? "Anonymous", color: colorFor(user?.id) },
      },
    }),
    [session]
  );

  // First client on a page with no CRDT state yet: seed the shared doc from
  // the content column saved by the REST autosave path.
  useEffect(() => {
    if (session.seed && page.content) {
      const blocks = parseContent(page.content);
      if (blocks) editor.replaceBlocks(editor.document, blocks);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  function persistPosition() {
    const scrollParent = findEditorScrollParent(editorShellRef.current);
    let blockId: string | undefined;
    try {
      blockId = editor.getTextCursorPosition().block.id;
    } catch {
      // No cursor yet
    }
    savePagePosition(page.id, {
      scrollTop: scrollParent?.scrollTop ?? 0,
      blockId,
      placement: "end",
    });
  }

  // Remember scroll + caret while editing; flush on leave.
  useEffect(() => {
    const scrollParent = findEditorScrollParent(editorShellRef.current);
    let scrollTimer: number | null = null;
    const onScroll = () => {
      if (scrollTimer) window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(persistPosition, 200);
    };
    scrollParent?.addEventListener("scroll", onScroll, { passive: true });

    const unsubSel = editor.onSelectionChange(() => {
      if (scrollTimer) window.clearTimeout(scrollTimer);
      scrollTimer = window.setTimeout(persistPosition, 250);
    });

    return () => {
      scrollParent?.removeEventListener("scroll", onScroll);
      unsubSel();
      if (scrollTimer) window.clearTimeout(scrollTimer);
      persistPosition();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, page.id]);

  // Open at the last spot in this page (scroll + caret), then focus.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    const saved = loadPagePosition(page.id);

    const restore = () => {
      const scrollParent = findEditorScrollParent(editorShellRef.current);
      if (saved && scrollParent) {
        scrollParent.scrollTop = saved.scrollTop;
      }
      try {
        if (saved?.blockId && editor.document.some((b) => b.id === saved.blockId)) {
          editor.setTextCursorPosition(saved.blockId, saved.placement ?? "end");
        }
        // Only open the keyboard/caret focus for newly created pages.
        if (shouldAutoFocus) editor.focus();
      } catch {
        try {
          if (shouldAutoFocus) editor.focus();
        } catch {
          // Editor surface may not be mounted yet.
        }
      }
      // Re-apply scroll after focus (focus can nudge the viewport).
      if (saved && scrollParent) {
        scrollParent.scrollTop = saved.scrollTop;
      }
    };

    const t0 = window.setTimeout(restore, 0);
    const t1 = window.setTimeout(restore, 150);
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, page.id]);

  // SPA navigation for in-editor wiki links (BlockNote renders plain <a>).
  useEffect(() => {
    const root = editorShellRef.current;
    if (!root) return;
    const onClick = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || !href.startsWith("/notebooks/")) return;
      e.preventDefault();
      e.stopPropagation();
      navigate(href);
    };
    root.addEventListener("click", onClick);
    return () => root.removeEventListener("click", onClick);
  }, [navigate, editor]);

  // ProseMirror often swallows wheel events even when it has nothing to
  // scroll — forward them to the page scroller so hovering text still moves
  // the page.
  useEffect(() => {
    const root = editorShellRef.current;
    if (!root) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey) return;
      const main = findEditorScrollParent(root);
      if (!main) return;
      let node = e.target as HTMLElement | null;
      while (node && node !== main) {
        const style = getComputedStyle(node);
        if (
          /(auto|scroll)/.test(style.overflowY) &&
          node.scrollHeight > node.clientHeight + 1
        ) {
          return;
        }
        node = node.parentElement;
      }
      main.scrollTop += e.deltaY;
      e.preventDefault();
    };
    root.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => root.removeEventListener("wheel", onWheel, true);
  }, [editor]);

  const { data: notebooks } = useQuery({ queryKey: ["notebooks"], queryFn: fetchNotebooks });
  const notebookPages = useMemo(
    () =>
      (notebooks ?? [])
        .filter((nb) => nb.id === notebookId)
        .flatMap((nb) => nb.sections)
        .flatMap((sec) => sec.pages.map((p) => ({ ...p, sectionId: sec.id }))),
    [notebooks, notebookId]
  );

  const { data: backlinks } = useQuery({
    queryKey: ["backlinks", page.id],
    queryFn: () => fetchBacklinks(page.id),
  });
  const { data: outlinks } = useQuery({
    queryKey: ["outlinks", page.id],
    queryFn: () => fetchOutlinks(page.id),
  });

  async function saveNow() {
    if (latestContent.current === null) return;
    const content = latestContent.current;
    latestContent.current = null;
    setSaveState("saving");
    try {
      await savePageContent(page.id, content, password);
      setSaveState("saved");
      queryClient.invalidateQueries({ queryKey: ["backlinks"] });
      queryClient.invalidateQueries({ queryKey: ["outlinks", page.id] });
      queryClient.invalidateQueries({ queryKey: ["graph", notebookId] });
    } catch {
      setSaveState("error");
    }
  }

  // Autosave: debounce 800ms after the last local keystroke. Triggered from
  // Yjs doc updates so remote edits (origin "remote") don't cause every
  // client to re-save the same content; the content column + [[link]] rows
  // stay in sync via the REST path while the CRDT handles realtime merging.
  useEffect(() => {
    const onDocUpdate = (_update: Uint8Array, origin: unknown) => {
      if (origin === "remote") return;
      setShowTemplates(false); // typing dismisses the template chips
      latestContent.current = JSON.stringify(editor.document);
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      saveTimer.current = window.setTimeout(saveNow, 800);
    };
    session.doc.on("update", onDocUpdate);
    return () => session.doc.off("update", onDocUpdate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, editor]);

  // Flush any pending edit when navigating away.
  useEffect(
    () => () => {
      if (saveTimer.current) window.clearTimeout(saveTimer.current);
      void saveNow();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  async function commitTitle() {
    const next = title.trim();
    if (!next || next === page.title) return;
    await renamePage(page.id, next);
    queryClient.invalidateQueries({ queryKey: ["notebooks"] });
    queryClient.invalidateQueries({ queryKey: ["page", page.id] });
    queryClient.invalidateQueries({ queryKey: ["graph", notebookId] });
    queryClient.invalidateQueries({ queryKey: ["backlinks"] });
    queryClient.invalidateQueries({ queryKey: ["outlinks"] });
  }

  async function removePage() {
    if (deleting) return;
    setDeleting(true);
    try {
      await deletePage(page.id);
      queryClient.invalidateQueries({ queryKey: ["notebooks"] });
      navigate(`/notebooks/${notebookId}`);
    } catch {
      setDeleting(false);
    }
  }

  function applyTemplate(blocks: typeof PAGE_TEMPLATES[number]["blocks"]) {
    editor.replaceBlocks(editor.document, blocks);
    setShowTemplates(false);
  }

  return (
    <div
      ref={editorShellRef}
      className={clsx(
        "w-full mx-auto page-editor",
        focusMode
          ? "max-w-5xl px-8 md:px-12 pt-3 pb-24 focus-prose"
          : "max-w-[1600px] px-6 sm:px-10 lg:px-14 xl:px-16 pb-8"
      )}
    >
      {session.localOnly && (
        <p className="mb-2 text-[11px] text-secondary">
          Editing offline from saved content — realtime sync will resume when connected.
        </p>
      )}
      <div className="page-sticky-title sticky top-0 z-10 flex items-baseline justify-between gap-4 pt-3 pb-2.5 mb-1 border-b border-border/50">
        <input
          className="flex-1 min-w-0 bg-transparent text-lg sm:text-xl font-medium focus:outline-none"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          aria-label="Page title"
        />
        <span className="flex items-center gap-2 shrink-0">
          <span
            key={saveState}
            className={clsx(
              "flex items-center gap-1.5 text-xs animate-fade-in",
              saveState === "error" ? "text-danger" : "text-secondary",
              saveState === "saving" && "animate-pulse-soft"
            )}
          >
            <span
              className={clsx(
                "h-1.5 w-1.5 rounded-full",
                saveState === "saved" ? "bg-accent" : saveState === "error" ? "bg-danger" : "bg-secondary"
              )}
            />
            {saveState === "saving" ? "Saving…" : saveState === "error" ? "Couldn't save" : "Saved"}
          </span>
          {!focusMode && !password && (
            <button
              title="Lock this section (encrypts all pages in it)"
              className="text-secondary hover:text-primary transition-colors"
              onClick={() => setLockOpen(true)}
            >
              <LockOpen size={14} />
            </button>
          )}
          {!focusMode && password && (
            <button
              title="Remove password from this section"
              className="text-secondary hover:text-primary transition-colors"
              onClick={() => setRemoveLockOpen(true)}
            >
              <ShieldOff size={14} />
            </button>
          )}
          {!focusMode && (
            <button
              title="Delete page"
              className="text-secondary hover:text-danger transition-colors"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 size={14} />
            </button>
          )}
          <button
            title={
              focusMode
                ? `Exit focus mode (${formatCombo(escapeBind)})`
                : `Focus mode (${formatCombo(focusBind)})`
            }
            className="text-secondary hover:text-primary transition-colors"
            onClick={() => setFocusMode(!focusMode)}
          >
            {focusMode ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </span>
      </div>

      {!focusMode && <PageTags page={page} password={password} />}

      {showTemplates && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 animate-fade-in">
          <span className="text-xs text-secondary mr-1">Start with</span>
          {PAGE_TEMPLATES.map((t) => (
            <button
              key={t.id}
              className="rounded-full border border-border px-2.5 py-1 text-xs text-secondary
                         hover:text-accent hover:border-accent transition-colors"
              onClick={() => applyTemplate(t.blocks)}
            >
              {t.name}
            </button>
          ))}
          <button
            className="rounded-full px-2 py-1 text-xs text-secondary hover:text-primary transition-colors"
            onClick={() => setShowTemplates(false)}
          >
            Blank
          </button>
        </div>
      )}

      <div className="mt-3">
        <BlockNoteView editor={editor} theme={theme}>
          {/* Wiki-link autocomplete: type `[[` to search pages in this notebook.
              Picking one inserts a clickable `[[Title]]` link. */}
          <SuggestionMenuController
            triggerCharacter="["
            getItems={async (query) => {
              // Require the second `[` so a single bracket doesn't open the menu.
              if (!query.startsWith("[")) return [];
              const q = query.slice(1).toLowerCase();
              return notebookPages
                .filter((p) => p.id !== page.id && p.title.toLowerCase().includes(q))
                .slice(0, 8)
                .map((p) => ({
                  title: p.title,
                  onItemClick: () =>
                    editor.insertInlineContent([
                      {
                        type: "link",
                        href: `/notebooks/${notebookId}/sections/${p.sectionId}/pages/${p.id}`,
                        content: `[[${p.title}]]`,
                      },
                      " ",
                    ]),
                }));
            }}
          />
        </BlockNoteView>
        {!focusMode && (
          <p className="mt-3 text-xs text-secondary text-center">
            Enter for a new line · Shift+Enter for a new block ·{" "}
            <span className="text-primary">/</span> for headings & lists ·{" "}
            <span className="text-primary">[[</span> to link pages
          </p>
        )}
      </div>

      {!focusMode && ((outlinks && outlinks.length > 0) || (backlinks && backlinks.length > 0)) && (
        <div className="mt-8 pt-4 border-t border-border space-y-4 text-center">
          {outlinks && outlinks.length > 0 && (
            <div>
              <p className="text-xs text-secondary mb-2">Links to</p>
              <div className="flex flex-wrap justify-center gap-2">
                {outlinks.map((ol) => (
                  <Link
                    key={ol.id}
                    to={`/notebooks/${notebookId}/sections/${ol.sectionId}/pages/${ol.id}`}
                    className="text-sm text-accent hover:underline"
                  >
                    {ol.title}
                  </Link>
                ))}
              </div>
            </div>
          )}
          {backlinks && backlinks.length > 0 && (
            <div>
              <p className="text-xs text-secondary mb-2">Linked from</p>
              <div className="flex flex-wrap justify-center gap-2">
                {backlinks.map((bl) => (
                  <Link
                    key={bl.id}
                    to={`/notebooks/${notebookId}/sections/${bl.sectionId}/pages/${bl.id}`}
                    className="text-sm text-accent hover:underline"
                  >
                    {bl.title}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent title="Delete page">
          <div className="space-y-3">
            <p className="text-sm text-secondary">
              Delete “{page.title}”? This cannot be undone.
            </p>
            <div className="flex gap-2">
              <Button className="flex-1" variant="ghost" onClick={() => setConfirmDelete(false)}>
                Cancel
              </Button>
              <Button className="flex-1" disabled={deleting} onClick={() => void removePage()}>
                <span className="text-danger">{deleting ? "Deleting…" : "Delete"}</span>
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <PasswordDialog
        open={lockOpen}
        onOpenChange={setLockOpen}
        title="Lock section"
        submitLabel="Lock"
        minLength={8}
        onSubmit={async (pw) => {
          try {
            await lockSection(sectionId, pw);
            setSectionPassword(sectionId, pw);
            queryClient.invalidateQueries({ queryKey: ["notebooks"] });
            return null;
          } catch (err: any) {
            return err.response?.data?.error ?? "Couldn't lock section";
          }
        }}
      />

      <PasswordDialog
        open={removeLockOpen}
        onOpenChange={setRemoveLockOpen}
        title="Remove password from this section"
        submitLabel="Remove"
        onSubmit={async (pw) => {
          try {
            await removeSectionLock(sectionId, pw);
            relockSection(sectionId);
            queryClient.invalidateQueries({ queryKey: ["notebooks"] });
            return null;
          } catch (err: any) {
            return err.response?.data?.error ?? "Couldn't remove password";
          }
        }}
      />
    </div>
  );
}

function PageTags({ page, password }: { page: Page; password?: string }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState("");

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["page", page.id, password ?? null] });

  async function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && value.trim()) {
      await addTagToPage(page.id, value.trim());
      setValue("");
      invalidate();
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mt-2">
      {(page.tags ?? []).map((tag) => (
        <span
          key={tag.id}
          className="inline-flex items-center gap-1 rounded-full border border-accent/40 text-accent px-2.5 py-0.5 text-xs"
        >
          {tag.name}
          <button
            className="hover:opacity-70"
            onClick={async () => {
              await removeTagFromPage(page.id, tag.id);
              invalidate();
            }}
          >
            <X size={11} />
          </button>
        </span>
      ))}
      <input
        className="bg-transparent text-xs text-secondary focus:text-primary focus:outline-none w-24"
        placeholder="+ tag"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
