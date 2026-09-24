"use client";

import { json, jsonParseLinter } from "@codemirror/lang-json";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { linter, lintGutter } from "@codemirror/lint";
import { EditorView, basicSetup } from "codemirror";
import { tags } from "@lezer/highlight";
import { useEffect, useRef } from "react";

/** Colors come from the design tokens, so the editor follows the theme. */
const theme = EditorView.theme(
  {
    "&": {
      backgroundColor: "var(--canvas)",
      color: "var(--ink-2)",
      fontSize: "12px",
      borderRadius: "8px",
      border: "1px solid var(--line)",
    },
    "&.cm-focused": { outline: "none", borderColor: "var(--accent)" },
    ".cm-content": {
      fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
      caretColor: "var(--ink)",
      padding: "8px 0",
    },
    ".cm-scroller": { lineHeight: "20px" },
    ".cm-gutters": {
      backgroundColor: "var(--canvas)",
      color: "var(--faint)",
      border: "none",
      borderRadius: "8px 0 0 8px",
    },
    ".cm-activeLine, .cm-activeLineGutter": { backgroundColor: "transparent" },
    "&.cm-focused .cm-activeLine": { backgroundColor: "var(--panel)" },
    ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection":
      { backgroundColor: "var(--accent-soft) !important" },
    ".cm-matchingBracket": {
      backgroundColor: "var(--raised)",
      outline: "1px solid var(--line-strong)",
    },
    ".cm-tooltip": {
      backgroundColor: "var(--raised)",
      border: "1px solid var(--line-strong)",
      color: "var(--ink)",
    },
    ".cm-foldPlaceholder": {
      backgroundColor: "var(--raised)",
      border: "none",
      color: "var(--muted)",
    },
  },
  { dark: true },
);

const highlight = HighlightStyle.define([
  { tag: tags.propertyName, color: "var(--accent)" },
  { tag: tags.string, color: "var(--success)" },
  { tag: [tags.number, tags.bool, tags.null], color: "var(--warning)" },
  { tag: [tags.brace, tags.squareBracket, tags.separator], color: "var(--muted)" },
]);

export function JsonEditor({
  initialValue,
  onChange,
  label,
}: {
  initialValue: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  const onChangeRef = useRef(onChange);

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    if (!hostRef.current) {
      return;
    }

    const view = new EditorView({
      doc: initialValue,
      parent: hostRef.current,
      extensions: [
        basicSetup,
        json(),
        linter(jsonParseLinter()),
        lintGutter(),
        theme,
        syntaxHighlighting(highlight),
        EditorView.contentAttributes.of({ "aria-label": label }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
    });

    return () => view.destroy();
    // The editor owns its document after mount; reset it with a new key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={hostRef} className="max-h-96 overflow-auto rounded-lg" />;
}
