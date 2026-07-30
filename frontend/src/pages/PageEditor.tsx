import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCreateBlockNote, SuggestionMenuController } from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import type { PartialBlock } from "@blocknote/core";
import { withCollaboration } from "@blocknote/core/yjs";
import { Lock, Maximize2, Minimize2, ShieldCheck, X } from "lucide-react";
import clsx from "clsx";
import "@blocknote/core/fonts/inter.css";
import "@blocknote/mantine/style.css";
import {
  addTagToPage,
  fetchBacklinks,
  fetchNotebooks,
  fetchPage,
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
import { usePageCollab, CollabSession } from "../hooks/usePageCollab";
import { PasswordDialog } from "../components/PasswordDialog";
import { Button } from "../components/ui/button";
import { PAGE_TEMPLATES } from "../lib/templates";

// Deterministic per-user cursor color for collaborative editing.
const CURSOR_COLORS = ["#62d9ae", "#60a5fa", "#c084fc", "#f87171", "#eab308", "#f472b6"];
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
  } = useQuery({
    queryKey: ["page", pageId, password ?? null],
    queryFn: () => fetchPage(pageId, password),
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

  if (isLoading) return <div className="p-7 text-sm text-secondary">Loading…</div>;
  if (error || !page) return <div className="p-7 text-sm text-secondary">Couldn't load this page.</div>;

  return <CollabGate key={`${pageId}:${password ?? ""}`} page={page} notebookId={notebookId} password={password} />;
}

// Editor mounts only once the Yjs session is synced, so the document renders
// from the shared CRDT state rather than a REST snapshot.
function CollabGate({ page, notebookId, password }: { page: Page; notebookId: string; password?: string }) {
  const { session, error } = usePageCollab(page.id, password);
  if (error) return <div className="p-7 text-sm text-secondary">Realtime connection failed: {error}</div>;
  if (!session) return <div className="p-7 text-sm text-secondary">Connecting…</div>;
  return <Editor page={page} notebookId={notebookId} password={password} session={session} />;
}

function Editor({
  page,
  notebookId,
  password,
  session,
}: {
  page: Page;
  notebookId: string;
  password?: string;
  session: CollabSession;
}) {
  const { theme } = useTheme();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const focusMode = useUiStore((s) => s.focusMode);
  const setFocusMode = useUiStore((s) => s.setFocusMode);
  const focusBind = useKeybindsStore((s) => s.binds.focus);
  const escapeBind = useKeybindsStore((s) => s.binds.escape);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "error">("saved");
  const [title, setTitle] = useState(page.title);
  // Offer templates only on brand-new pages (first client, nothing saved yet).
  const [showTemplates, setShowTemplates] = useState(session.seed && !page.content);
  const saveTimer = useRef<number | null>(null);
  const latestContent = useRef<string | null>(null);

  const editor = useCreateBlockNote(
    withCollaboration({
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

  const { data: notebooks } = useQuery({ queryKey: ["notebooks"], queryFn: fetchNotebooks });
  const notebookPages = useMemo(
    () =>
      (notebooks ?? [])
        .filter((nb) => nb.id === notebookId)
        .flatMap((nb) => nb.sections)
        .flatMap((sec) => sec.pages),
    [notebooks, notebookId]
  );

  const { data: backlinks } = useQuery({
    queryKey: ["backlinks", page.id],
    queryFn: () => fetchBacklinks(page.id),
  });

  async function saveNow() {
    if (latestContent.current === null) return;
    const content = latestContent.current;
    latestContent.current = null;
    setSaveState("saving");
    try {
      await savePageContent(page.id, content, password);
      setSaveState("saved");
      queryClient.invalidateQueries({ queryKey: ["backlinks", page.id] });
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
  }

  function applyTemplate(blocks: typeof PAGE_TEMPLATES[number]["blocks"]) {
    editor.replaceBlocks(editor.document, blocks);
    setShowTemplates(false);
  }

  return (
    <div
      className={clsx(
        "mx-auto animate-rise-in",
        focusMode ? "max-w-2xl px-7 pt-14 pb-24 focus-prose" : "max-w-3xl px-7 py-6"
      )}
    >
      <div className="flex items-baseline justify-between gap-4">
        <input
          className="flex-1 bg-transparent text-2xl font-medium focus:outline-none"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
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
        <div className="mt-4 flex flex-wrap items-center gap-1.5 animate-fade-in">
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

      <div className="mt-5">
        <BlockNoteView editor={editor} theme={theme}>
          {/* Wiki-link autocomplete: `[` opens a page search scoped to this
              notebook; picking an entry inserts `[[Page Title]]`. */}
          <SuggestionMenuController
            triggerCharacter="["
            getItems={async (query) => {
              const q = query.replace(/^\[/, "").toLowerCase();
              return notebookPages
                .filter((p) => p.id !== page.id && p.title.toLowerCase().includes(q))
                .slice(0, 8)
                .map((p) => ({
                  title: p.title,
                  onItemClick: () => editor.insertInlineContent(`[[${p.title}]] `),
                }));
            }}
          />
        </BlockNoteView>
      </div>

      {backlinks && backlinks.length > 0 && (
        <div className="mt-8 pt-4 border-t border-border">
          <p className="text-xs text-secondary mb-2">Linked from</p>
          <div className="flex flex-wrap gap-2">
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
