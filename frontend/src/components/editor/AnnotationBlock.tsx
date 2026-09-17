import { useState, useRef, useEffect, useCallback } from "react";
import { defaultProps } from "@blocknote/core";
import { createReactBlockSpec } from "@blocknote/react";
import {
  Edit3,
  Eraser,
  Highlighter,
  RotateCcw,
  RotateCw,
  Trash2,
  Maximize2,
  Minimize2,
} from "lucide-react";

export interface Point {
  x: number;
  y: number;
  pressure?: number;
}

export interface Stroke {
  points: Point[];
  color: string;
  width: number;
  isHighlighter?: boolean;
}

const PEN_COLORS = [
  { id: "dark", light: "#18181b", dark: "#f4f4f5", label: "Ink" },
  { id: "emerald", light: "#0cb879", dark: "#5ee9b5", label: "Emerald" },
  { id: "rose", light: "#f43f5e", dark: "#fb7185", label: "Rose" },
  { id: "sky", light: "#0284c7", dark: "#38bdf8", label: "Sky" },
  { id: "amber", light: "#d97706", dark: "#fbbf24", label: "Amber" },
  { id: "violet", light: "#7c3aed", dark: "#a78bfa", label: "Violet" },
];

const PEN_WIDTHS = [
  { id: "fine", label: "Fine", width: 2 },
  { id: "medium", label: "Medium", width: 4 },
  { id: "bold", label: "Bold", width: 8 },
];

export const AnnotationBlockSpec = createReactBlockSpec(
  {
    type: "annotation",
    propSchema: {
      ...defaultProps,
      drawing: {
        default: "",
      },
      caption: {
        default: "",
      },
      canvasHeight: {
        default: 360,
      },
    },
    content: "none",
  },
  {
    render: function AnnotationComponent({ block, editor }) {
      const isDark = document.documentElement.classList.contains("dark");
      const [strokes, setStrokes] = useState<Stroke[]>(() => {
        try {
          if (!block.props.drawing) return [];
          const parsed = JSON.parse(block.props.drawing);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      });

      const [redoStack, setRedoStack] = useState<Stroke[]>([]);
      const [tool, setTool] = useState<"pen" | "highlighter" | "eraser">("pen");
      const [selectedColorIndex, setSelectedColorIndex] = useState(0);
      const [selectedWidthIndex, setSelectedWidthIndex] = useState(1);
      const [isExpanded, setIsExpanded] = useState(false);

      const canvasRef = useRef<HTMLCanvasElement>(null);
      const currentStroke = useRef<Stroke | null>(null);
      const isDrawing = useRef(false);

      const canvasHeight = isExpanded ? 560 : Number(block.props.canvasHeight || 360);

      const activeColor =
        PEN_COLORS[selectedColorIndex]?.[isDark ? "dark" : "light"] ??
        (isDark ? "#f4f4f5" : "#18181b");
      const activeWidth = PEN_WIDTHS[selectedWidthIndex]?.width ?? 4;

      const renderAllStrokes = useCallback(
        (canvas: HTMLCanvasElement, strokeList: Stroke[]) => {
          const ctx = canvas.getContext("2d");
          if (!ctx) return;

          const rect = canvas.getBoundingClientRect();
          const dpr = window.devicePixelRatio || 1;
          const displayWidth = Math.max(rect.width, 300);
          const displayHeight = canvasHeight;

          if (canvas.width !== displayWidth * dpr || canvas.height !== displayHeight * dpr) {
            canvas.width = displayWidth * dpr;
            canvas.height = displayHeight * dpr;
          }

          ctx.save();
          ctx.scale(dpr, dpr);
          ctx.clearRect(0, 0, displayWidth, displayHeight);

          // Subtle dot grid background for notebook feel
          ctx.fillStyle = isDark ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)";
          const dotSpacing = 24;
          for (let x = dotSpacing; x < displayWidth; x += dotSpacing) {
            for (let y = dotSpacing; y < displayHeight; y += dotSpacing) {
              ctx.beginPath();
              ctx.arc(x, y, 1, 0, Math.PI * 2);
              ctx.fill();
            }
          }

          // Draw strokes
          for (const stroke of strokeList) {
            if (stroke.points.length === 0) continue;

            ctx.beginPath();
            ctx.lineCap = "round";
            ctx.lineJoin = "round";

            if (stroke.isHighlighter) {
              ctx.strokeStyle = stroke.color;
              ctx.globalAlpha = isDark ? 0.35 : 0.28;
              ctx.lineWidth = stroke.width * 2.8;
            } else {
              ctx.strokeStyle = stroke.color;
              ctx.globalAlpha = 1.0;
              ctx.lineWidth = stroke.width;
            }

            if (stroke.points.length === 1) {
              const pt = stroke.points[0];
              ctx.arc(pt.x, pt.y, (stroke.width * (pt.pressure ?? 1)) / 2, 0, Math.PI * 2);
              ctx.fillStyle = stroke.color;
              ctx.fill();
            } else {
              ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
              for (let i = 1; i < stroke.points.length - 1; i++) {
                const xc = (stroke.points[i].x + stroke.points[i + 1].x) / 2;
                const yc = (stroke.points[i].y + stroke.points[i + 1].y) / 2;
                ctx.quadraticCurveTo(stroke.points[i].x, stroke.points[i].y, xc, yc);
              }
              const last = stroke.points[stroke.points.length - 1];
              ctx.lineTo(last.x, last.y);
              ctx.stroke();
            }
            ctx.globalAlpha = 1.0;
          }

          ctx.restore();
        },
        [canvasHeight, isDark]
      );

      // Redraw whenever strokes change or canvas re-renders
      useEffect(() => {
        if (canvasRef.current) {
          renderAllStrokes(canvasRef.current, strokes);
        }
      }, [strokes, renderAllStrokes]);

      // Save strokes to BlockNote block props
      const saveStrokes = useCallback(
        (newStrokes: Stroke[]) => {
          setStrokes(newStrokes);
          editor.updateBlock(block, {
            props: {
              ...block.props,
              drawing: JSON.stringify(newStrokes),
            },
          });
        },
        [block, editor]
      );

      // Pointer event handlers supporting Pen / Stylus pressure + Touch + Mouse
      const getCanvasPoint = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        return {
          x: e.clientX - rect.left,
          y: e.clientY - rect.top,
          pressure: e.pressure && e.pressure > 0 ? e.pressure : 0.5,
        };
      };

      const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
        e.preventDefault();
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        isDrawing.current = true;
        const pt = getCanvasPoint(e);

        if (tool === "eraser") {
          // Erase strokes near point
          eraseNear(pt);
        } else {
          currentStroke.current = {
            points: [pt],
            color: activeColor,
            width: activeWidth,
            isHighlighter: tool === "highlighter",
          };
          // Immediately draw the point
          if (canvasRef.current) {
            renderAllStrokes(canvasRef.current, [...strokes, currentStroke.current]);
          }
        }
      };

      const eraseNear = (pt: Point) => {
        const radius = 16;
        const remaining = strokes.filter((stroke) => {
          return !stroke.points.some(
            (p) => Math.hypot(p.x - pt.x, p.y - pt.y) < radius + stroke.width
          );
        });
        if (remaining.length !== strokes.length) {
          saveStrokes(remaining);
        }
      };

      const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!isDrawing.current) return;
        e.preventDefault();
        const pt = getCanvasPoint(e);

        if (tool === "eraser") {
          eraseNear(pt);
        } else if (currentStroke.current) {
          currentStroke.current.points.push(pt);
          if (canvasRef.current) {
            renderAllStrokes(canvasRef.current, [...strokes, currentStroke.current]);
          }
        }
      };

      const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
        if (!isDrawing.current) return;
        e.preventDefault();
        try {
          (e.target as HTMLElement).releasePointerCapture(e.pointerId);
        } catch {
          // pointer capture might already be released
        }
        isDrawing.current = false;

        if (tool !== "eraser" && currentStroke.current) {
          const next = [...strokes, currentStroke.current];
          currentStroke.current = null;
          setRedoStack([]);
          saveStrokes(next);
        }
      };

      const handleUndo = () => {
        if (strokes.length === 0) return;
        const popped = strokes[strokes.length - 1];
        const next = strokes.slice(0, -1);
        setRedoStack((prev) => [...prev, popped]);
        saveStrokes(next);
      };

      const handleRedo = () => {
        if (redoStack.length === 0) return;
        const popped = redoStack[redoStack.length - 1];
        const nextStack = redoStack.slice(0, -1);
        setRedoStack(nextStack);
        saveStrokes([...strokes, popped]);
      };

      const handleClear = () => {
        if (strokes.length === 0) return;
        setRedoStack((prev) => [...prev, ...strokes]);
        saveStrokes([]);
      };

      return (
        <div className="my-3 rounded-2xl border border-border glass overflow-hidden transition-all shadow-sm group">
          {/* Annotation Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 border-b border-border/80 bg-surface-1/70 backdrop-blur-md select-none">
            <div className="flex items-center gap-1.5">
              <span className="flex items-center gap-1.5 text-xs font-medium text-secondary mr-2">
                <Edit3 size={13} className="text-accent" />
                Annotation
              </span>

              {/* Tool Mode */}
              <div className="flex items-center rounded-lg bg-surface-0 border border-border p-0.5">
                <button
                  type="button"
                  title="Pen / Stylus"
                  onClick={() => setTool("pen")}
                  className={`p-1.5 rounded-md text-xs transition-colors ${
                    tool === "pen"
                      ? "bg-accent text-white shadow-sm"
                      : "text-secondary hover:text-primary"
                  }`}
                >
                  <Edit3 size={13} />
                </button>
                <button
                  type="button"
                  title="Highlighter"
                  onClick={() => setTool("highlighter")}
                  className={`p-1.5 rounded-md text-xs transition-colors ${
                    tool === "highlighter"
                      ? "bg-accent text-white shadow-sm"
                      : "text-secondary hover:text-primary"
                  }`}
                >
                  <Highlighter size={13} />
                </button>
                <button
                  type="button"
                  title="Eraser"
                  onClick={() => setTool("eraser")}
                  className={`p-1.5 rounded-md text-xs transition-colors ${
                    tool === "eraser"
                      ? "bg-accent text-white shadow-sm"
                      : "text-secondary hover:text-primary"
                  }`}
                >
                  <Eraser size={13} />
                </button>
              </div>

              {/* Color Swatches (hide when eraser is active) */}
              {tool !== "eraser" && (
                <div className="flex items-center gap-1 ml-1 px-1.5 py-0.5 rounded-lg bg-surface-0 border border-border">
                  {PEN_COLORS.map((col, idx) => {
                    const colorVal = col[isDark ? "dark" : "light"];
                    const isSelected = selectedColorIndex === idx;
                    return (
                      <button
                        key={col.id}
                        type="button"
                        title={col.label}
                        onClick={() => setSelectedColorIndex(idx)}
                        className={`w-4 h-4 rounded-full transition-transform ${
                          isSelected
                            ? "ring-2 ring-accent scale-110 shadow-sm"
                            : "hover:scale-105 opacity-85"
                        }`}
                        style={{ backgroundColor: colorVal }}
                      />
                    );
                  })}
                </div>
              )}

              {/* Stroke Width Selector */}
              {tool !== "eraser" && (
                <div className="flex items-center gap-1 ml-1 px-1.5 py-1 rounded-lg bg-surface-0 border border-border">
                  {PEN_WIDTHS.map((w, idx) => (
                    <button
                      key={w.id}
                      type="button"
                      title={w.label}
                      onClick={() => setSelectedWidthIndex(idx)}
                      className={`flex items-center justify-center w-5 h-4 rounded transition-colors ${
                        selectedWidthIndex === idx
                          ? "bg-accent/20 text-accent font-bold"
                          : "text-secondary hover:text-primary"
                      }`}
                    >
                      <span
                        className="rounded-full bg-current"
                        style={{ width: w.width * 1.5, height: w.width * 1.5 }}
                      />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Actions: Undo / Redo / Clear / Resize */}
            <div className="flex items-center gap-1">
              <button
                type="button"
                title="Undo"
                disabled={strokes.length === 0}
                onClick={handleUndo}
                className="p-1.5 rounded-md text-secondary hover:text-primary disabled:opacity-30 transition-colors"
              >
                <RotateCcw size={13} />
              </button>
              <button
                type="button"
                title="Redo"
                disabled={redoStack.length === 0}
                onClick={handleRedo}
                className="p-1.5 rounded-md text-secondary hover:text-primary disabled:opacity-30 transition-colors"
              >
                <RotateCw size={13} />
              </button>
              <button
                type="button"
                title="Clear all handwriting"
                disabled={strokes.length === 0}
                onClick={handleClear}
                className="p-1.5 rounded-md text-secondary hover:text-danger disabled:opacity-30 transition-colors"
              >
                <Trash2 size={13} />
              </button>
              <button
                type="button"
                title={isExpanded ? "Collapse canvas" : "Expand canvas"}
                onClick={() => setIsExpanded(!isExpanded)}
                className="p-1.5 rounded-md text-secondary hover:text-primary transition-colors ml-1"
              >
                {isExpanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              </button>
            </div>
          </div>

          {/* Canvas Area */}
          <div className="relative touch-none cursor-crosshair bg-surface-0/40">
            <canvas
              ref={canvasRef}
              style={{ width: "100%", height: canvasHeight, display: "block" }}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            />

            {/* Subtle helper hint when empty */}
            {strokes.length === 0 && (
              <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center text-center p-4">
                <Edit3 size={24} className="text-secondary/40 mb-2 stroke-[1.5]" />
                <p className="text-xs font-medium text-secondary/70">
                  Write or sketch freely with your stylus, pen, or touch
                </p>
                <p className="text-[11px] text-secondary/50 mt-0.5">
                  Pressure-sensitive strokes auto-save to this page
                </p>
              </div>
            )}
          </div>
        </div>
      );
    },
  }
);
