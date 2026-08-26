import { useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ReactFlow, Background, Controls, Panel, type Node, type Edge } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { fetchGraph, fetchNotebooks } from "../lib/api";
import { useTheme } from "../theme/ThemeProvider";
import { useUiStore } from "../stores/ui";

// One hue per section so clusters read at a glance; works on light and dark.
const SECTION_COLORS = ["#6edcb6", "#60a5fa", "#c084fc", "#f59e0b", "#f472b6", "#34d399", "#f87171", "#a3e635"];

export default function GraphView() {
  const { notebookId } = useParams() as { notebookId: string };
  const navigate = useNavigate();
  const { theme } = useTheme();
  const setActiveNotebook = useUiStore((s) => s.setActiveNotebook);

  const { data: graph, isLoading } = useQuery({
    queryKey: ["graph", notebookId],
    queryFn: () => fetchGraph(notebookId),
  });
  const { data: notebooks } = useQuery({ queryKey: ["notebooks"], queryFn: fetchNotebooks });

  const notebook = notebooks?.find((nb) => nb.id === notebookId);

  // pageId -> section, needed for routing and cluster colors
  const sectionByPage = useMemo(() => {
    const map = new Map<string, { id: string; index: number; title: string }>();
    (notebook?.sections ?? []).forEach((sec, index) => {
      for (const page of sec.pages) map.set(page.id, { id: sec.id, index, title: sec.title });
    });
    return map;
  }, [notebook]);

  const degree = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of graph?.edges ?? []) {
      map.set(e.source, (map.get(e.source) ?? 0) + 1);
      map.set(e.target, (map.get(e.target) ?? 0) + 1);
    }
    return map;
  }, [graph]);

  const nodes: Node[] = useMemo(() => {
    // Sort by section so each cluster occupies a contiguous arc of the circle.
    const items = [...(graph?.nodes ?? [])].sort(
      (a, b) => (sectionByPage.get(a.id)?.index ?? 0) - (sectionByPage.get(b.id)?.index ?? 0)
    );
    const radius = Math.max(180, items.length * 42);
    return items.map((n, i) => {
      const angle = (2 * Math.PI * i) / Math.max(items.length, 1);
      const sec = sectionByPage.get(n.id);
      const color = SECTION_COLORS[(sec?.index ?? 0) % SECTION_COLORS.length];
      const deg = degree.get(n.id) ?? 0;
      const orphan = deg === 0;
      return {
        id: n.id,
        data: { label: n.title },
        position: { x: radius * Math.cos(angle), y: radius * Math.sin(angle) },
        style: {
          background: "var(--surface-1)",
          color: "var(--text-primary)",
          border: orphan ? "1px dashed var(--border)" : "1px solid var(--border)",
          borderLeft: orphan ? `3px dashed ${color}` : `3px solid ${color}`,
          borderRadius: 8,
          fontSize: 12,
          fontWeight: deg >= 3 ? 500 : 400,
          padding: "6px 12px",
          width: "auto" as const,
          opacity: orphan ? 0.55 : 1,
        },
      };
    });
  }, [graph, sectionByPage, degree]);

  const edges: Edge[] = useMemo(
    () =>
      (graph?.edges ?? []).map((e, i) => ({
        id: `${e.source}-${e.target}-${i}`,
        source: e.source,
        target: e.target,
        style: { stroke: "var(--text-secondary)", strokeWidth: 1, opacity: 0.6 },
      })),
    [graph]
  );

  const edgeCount = graph?.edges.length ?? 0;
  const orphanCount = (graph?.nodes ?? []).filter((n) => (degree.get(n.id) ?? 0) === 0).length;

  if (isLoading) return <div className="p-7 text-sm text-secondary text-center">Loading…</div>;
  if (!graph || graph.nodes.length === 0)
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-sm font-medium">This notebook's still blank — write a page to grow the graph.</p>
        <p className="text-xs text-secondary max-w-sm">
          Create pages, then type <span className="text-primary">[[</span> in the editor to link them. Linked pages
          appear here as a graph.
        </p>
        {(notebooks ?? []).length > 1 && (
          <NotebookSwitcher
            notebooks={notebooks ?? []}
            activeId={notebookId}
            onPick={(id) => {
              setActiveNotebook(id);
              navigate(`/notebooks/${id}/graph`);
            }}
          />
        )}
      </div>
    );

  return (
    <div className="h-full animate-fade-in">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        colorMode={theme}
        fitView
        nodesConnectable={false}
        onNodeClick={(_, node) => {
          const sec = sectionByPage.get(node.id);
          if (sec) navigate(`/notebooks/${notebookId}/sections/${sec.id}/pages/${node.id}`);
        }}
      >
        <Background gap={24} color="var(--border)" />
        <Controls showInteractive={false} />
        <Panel
          position="top-left"
          className="rounded-xl border border-border glass px-3 py-2.5 text-xs space-y-1.5 shadow-card max-w-[220px]"
        >
          <p className="font-medium text-primary text-center">{notebook?.title ?? "Notebook"}</p>
          <NotebookSwitcher
            notebooks={notebooks ?? []}
            activeId={notebookId}
            onPick={(id) => {
              setActiveNotebook(id);
              navigate(`/notebooks/${id}/graph`);
            }}
          />
          {(notebook?.sections ?? []).map((sec, i) => (
            <div key={sec.id} className="flex items-center gap-1.5 text-secondary">
              <span
                className="h-2 w-2 rounded-full shrink-0"
                style={{ background: SECTION_COLORS[i % SECTION_COLORS.length] }}
              />
              {sec.title}
            </div>
          ))}
          <p className="text-secondary pt-1 border-t border-border">
            {edgeCount} {edgeCount === 1 ? "link" : "links"}
            {orphanCount > 0 ? ` · ${orphanCount} unlinked` : ""}
          </p>
          {edgeCount === 0 && (
            <p className="text-secondary">
              Open a page and type <span className="text-primary">[[</span> to link another page.
            </p>
          )}
        </Panel>
      </ReactFlow>
    </div>
  );
}

function NotebookSwitcher({
  notebooks,
  activeId,
  onPick,
}: {
  notebooks: { id: string; title: string }[];
  activeId: string;
  onPick: (id: string) => void;
}) {
  if (notebooks.length <= 1) return null;
  return (
    <select
      className="w-full rounded-lg border border-border glass-input px-2 py-1 text-xs text-primary focus:outline-none focus:border-accent"
      value={activeId}
      onChange={(e) => onPick(e.target.value)}
      aria-label="Notebook"
    >
      {notebooks.map((nb) => (
        <option key={nb.id} value={nb.id}>
          {nb.title}
        </option>
      ))}
    </select>
  );
}
