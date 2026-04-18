"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "@/lib/utils";
import { getBookChapterCount } from "@/lib/study/book-chapters";
import { getAllBookMetadata } from "@/lib/study/book-metadata";
import { DEFAULT_VERSION_IDS } from "@/lib/study/constants";
import type { StudyRunEvent } from "@/lib/study/events";
import {
  type PersistedPassageQuestion,
  type PersistedStudyResult,
  type StudyResult,
  type StudyRunSummary,
} from "@/lib/study/schemas";

type ActiveStudy = StudyResult | PersistedStudyResult;
type ViewKey = "summary" | "analysts" | "reader" | "context" | "sources";
type RunStatusStage = "queued" | "running" | "completed" | "failed";
type Phase = "create" | "running" | "review";
type BookSortMode = "category" | "order" | "testament";

type StudyWorkbenchProps = {
  initialHistory?: StudyRunSummary[];
  initialStudy?: PersistedStudyResult | null;
  initialPassageQuestions?: PersistedPassageQuestion[];
};

type RunStatus = {
  label: string;
  stage: RunStatusStage;
  message: string;
};

type BookGroup = {
  key: string;
  title: string;
  osisList: string[];
  testament?: string;
};

type ConsoleEntry = {
  id: string;
  line: string;
};

type SelectionPromptState = {
  text: string;
  question: string;
  top: number;
  left: number;
};

type PreviewChapterData = {
  reference: string;
  versionId: string;
  versionLabel: string;
  description: string;
  sourceUrl: string;
  verses: Array<{
    verse: string;
    text: string;
  }>;
};

const books = getAllBookMetadata().map((book) => ({
  ...book,
  chapterCount: getBookChapterCount(book.osis),
}));

const booksByOsis = new Map(books.map((book) => [book.osis, book]));

const bookChipLabels: Record<string, string> = {
  "1Sam": "1 Sam",
  "2Sam": "2 Sam",
  "1Kgs": "1 Kings",
  "2Kgs": "2 Kings",
  "1Chr": "1 Chron",
  "2Chr": "2 Chron",
  Song: "Song",
  "1Cor": "1 Cor",
  "2Cor": "2 Cor",
  "1Thess": "1 Thess",
  "2Thess": "2 Thess",
  "1Tim": "1 Tim",
  "2Tim": "2 Tim",
  Phlm: "Philemon",
  "1Pet": "1 Pet",
  "2Pet": "2 Pet",
  "1John": "1 John",
  "2John": "2 John",
  "3John": "3 John",
};

const categoryBookGroups: BookGroup[] = [
  {
    key: "ot-torah",
    title: "Torah",
    testament: "Old Testament",
    osisList: ["Gen", "Exod", "Lev", "Num", "Deut"],
  },
  {
    key: "ot-history",
    title: "History",
    testament: "Old Testament",
    osisList: [
      "Josh",
      "Judg",
      "Ruth",
      "1Sam",
      "2Sam",
      "1Kgs",
      "2Kgs",
      "1Chr",
      "2Chr",
      "Ezra",
      "Neh",
      "Esth",
    ],
  },
  {
    key: "ot-wisdom",
    title: "Wisdom",
    testament: "Old Testament",
    osisList: ["Job", "Ps", "Prov", "Eccl", "Song"],
  },
  {
    key: "ot-major-prophets",
    title: "Major prophets",
    testament: "Old Testament",
    osisList: ["Isa", "Jer", "Lam", "Ezek", "Dan"],
  },
  {
    key: "ot-minor-prophets",
    title: "Minor prophets",
    testament: "Old Testament",
    osisList: [
      "Hos",
      "Joel",
      "Amos",
      "Obad",
      "Jonah",
      "Mic",
      "Nah",
      "Hab",
      "Zeph",
      "Hag",
      "Zech",
      "Mal",
    ],
  },
  {
    key: "nt-gospels",
    title: "Gospels",
    testament: "New Testament",
    osisList: ["Matt", "Mark", "Luke", "John"],
  },
  {
    key: "nt-history",
    title: "History",
    testament: "New Testament",
    osisList: ["Acts"],
  },
  {
    key: "nt-pauline-letters",
    title: "Pauline letters",
    testament: "New Testament",
    osisList: [
      "Rom",
      "1Cor",
      "2Cor",
      "Gal",
      "Eph",
      "Phil",
      "Col",
      "1Thess",
      "2Thess",
      "1Tim",
      "2Tim",
      "Titus",
      "Phlm",
    ],
  },
  {
    key: "nt-general-letters",
    title: "General letters",
    testament: "New Testament",
    osisList: [
      "Heb",
      "Jas",
      "1Pet",
      "2Pet",
      "1John",
      "2John",
      "3John",
      "Jude",
    ],
  },
  {
    key: "nt-apocalypse",
    title: "Apocalypse",
    testament: "New Testament",
    osisList: ["Rev"],
  },
];

const testamentBookGroups: BookGroup[] = [
  {
    key: "old-testament",
    title: "Old Testament",
    osisList: books
      .filter((book) => book.testament === "Old Testament")
      .map((book) => book.osis),
  },
  {
    key: "new-testament",
    title: "New Testament",
    osisList: books
      .filter((book) => book.testament === "New Testament")
      .map((book) => book.osis),
  },
];

const canonicalBookGroups: BookGroup[] = [
  {
    key: "canonical-order",
    title: "Canonical order",
    osisList: books.map((book) => book.osis),
  },
];

const sortOptions: Array<{ value: BookSortMode; label: string }> = [
  { value: "category", label: "By category" },
  { value: "order", label: "In order" },
  { value: "testament", label: "By testament" },
];

const viewOptions: Array<{ key: ViewKey; label: string }> = [
  { key: "summary", label: "Synthesis" },
  { key: "analysts", label: "Models" },
  { key: "reader", label: "Reader" },
  { key: "context", label: "Context" },
  { key: "sources", label: "Sources" },
];

const terminalTargets: Array<{ key: string; label: string }> = [
  { key: "context", label: "Context" },
  { key: "gpt54", label: "GPT-5.4" },
  { key: "opus46", label: "Claude Opus 4.6" },
  { key: "gemini31", label: "Gemini 3.1 Pro" },
  { key: "glm45", label: "GLM 4.5" },
  { key: "synthesis", label: "Final Synthesis" },
  { key: "narration", label: "Voice Overview" },
];

function getBookButtonLabel(osis: string) {
  return bookChipLabels[osis] ?? booksByOsis.get(osis)?.name ?? osis;
}

function getBookGroups(sortMode: BookSortMode): BookGroup[] {
  if (sortMode === "order") {
    return canonicalBookGroups;
  }

  if (sortMode === "testament") {
    return testamentBookGroups;
  }

  return categoryBookGroups;
}

function createDefaultRunStatuses(): Record<string, RunStatus> {
  return Object.fromEntries(
    terminalTargets.map((target) => [
      target.key,
      {
        label: target.label,
        stage: "queued",
        message: "Waiting to start.",
      },
    ]),
  );
}

function hasSlug(study: ActiveStudy | null): study is PersistedStudyResult {
  return Boolean(study && "slug" in study && "id" in study);
}

function buildSummaryFromStudy(study: PersistedStudyResult): StudyRunSummary {
  return {
    id: study.id,
    slug: study.slug,
    reference: study.context.parsedReference.reference,
    focusQuestion: study.request.focusQuestion,
    createdAt: study.generatedAt,
    versionIds: study.context.versions.map((version) => version.versionId),
    finalThesis: study.finalSynthesis.thesis,
    confidence: study.finalSynthesis.confidence,
  };
}

function getNarrationAutoplayToken(study: ActiveStudy) {
  return study.voiceNarration
    ? `${study.generatedAt}:${study.voiceNarration.audioUrl}`
    : null;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatConsoleTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function confidenceTone(confidence: "low" | "medium" | "high") {
  if (confidence === "high") {
    return "bg-[#e7ecd5] text-[#4d5a25] ring-[#c6d2a3]";
  }

  if (confidence === "medium") {
    return "bg-[#f3e7c4] text-[#7a5a1c] ring-[#e0cf97]";
  }

  return "bg-[#f1d7ce] text-[#7a2e1c] ring-[#dcb1a4]";
}

function statusTone(stage: RunStatusStage) {
  if (stage === "completed") {
    return "border-[#7d9a42]/50 bg-[#7d9a42]/15 text-[#d4deb0]";
  }

  if (stage === "running") {
    return "border-[#d4a84a]/60 bg-[#d4a84a]/15 text-[#f1deaa]";
  }

  if (stage === "failed") {
    return "border-[#c9533e]/60 bg-[#c9533e]/15 text-[#f3ccc0]";
  }

  return "border-[#f8f2e8]/10 bg-[#f8f2e8]/5 text-[#c9b99d]";
}

function stageDescription(stage: RunStatusStage) {
  if (stage === "completed") return "Done";
  if (stage === "running") return "Running";
  if (stage === "failed") return "Failed";
  return "Queued";
}

function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[#241c13]/55">
      {children}
    </div>
  );
}

function Card({
  label,
  children,
  className,
  dark = false,
}: {
  label?: string;
  children: ReactNode;
  className?: string;
  dark?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[1.25rem] border p-5",
        dark
          ? "border-[#f8f2e8]/15 bg-[#1a140c]/80 text-[#f3ebdb]"
          : "border-[#241c13]/10 bg-[#fbf6ed]",
        className,
      )}
    >
      {label ? (
        <div
          className={cn(
            "text-[11px] font-semibold uppercase tracking-[0.24em]",
            dark ? "text-[#e6c87c]" : "text-[#241c13]/55",
          )}
        >
          {label}
        </div>
      ) : null}
      <div className={label ? "mt-3" : undefined}>{children}</div>
    </div>
  );
}

function BookPreviewModal({
  chapter,
  isLoading,
  error,
  onClose,
}: {
  chapter: PreviewChapterData | null;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-[#241c13]/45 px-4 py-8"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.2 }}
          role="dialog"
          aria-modal="true"
          aria-label={chapter ? `${chapter.reference} preview` : "Chapter preview"}
          className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-[1.5rem] border border-[#ae7a1a]/30 bg-[#fbf6ed] shadow-[0_24px_80px_rgba(36,28,19,0.24)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-start justify-between gap-4 border-b border-[#241c13]/10 px-6 py-5">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#ae7a1a]">
                Preview scripture
              </div>
              <h3 className="font-display mt-2 text-3xl text-[#241c13]">
                {chapter?.reference ?? "Loading chapter..."}
              </h3>
              {chapter ? (
                <div className="mt-2 text-sm text-[#241c13]/60">
                  {chapter.versionLabel} · {chapter.versionId}
                </div>
              ) : null}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[#241c13]/15 bg-white/70 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#241c13]/60 transition hover:border-[#ae7a1a] hover:text-[#ae7a1a]"
            >
              Close
            </button>
          </div>

          <div className="overflow-y-auto px-6 py-5">
            {isLoading ? (
              <div className="rounded-[1rem] border border-[#241c13]/10 bg-white/60 px-5 py-5 text-sm leading-7 text-[#241c13]/65">
                Loading chapter text...
              </div>
            ) : null}

            {!isLoading && error ? (
              <div className="rounded-[1rem] border border-[#c9533e]/30 bg-[#f3d9d1]/50 px-5 py-5 text-sm leading-7 text-[#7a2e1c]">
                {error}
              </div>
            ) : null}

            {!isLoading && !error && chapter ? (
              <div>
                <div className="rounded-[1rem] border border-[#241c13]/10 bg-white/60 px-5 py-4">
                  <div className="text-sm leading-7 text-[#241c13]/70">
                    {chapter.description}
                  </div>
                </div>

                <div className="mt-5 space-y-4">
                  {chapter.verses.map((verse, index) => (
                    <p
                      key={`${chapter.reference}-${verse.verse}-${index}`}
                      className="text-[17px] leading-8 text-[#241c13]/88"
                    >
                      <span className="mr-3 align-top text-sm font-semibold uppercase tracking-[0.16em] text-[#ae7a1a]">
                        {verse.verse}
                      </span>
                      {verse.text}
                    </p>
                  ))}
                </div>

                <div className="mt-6 border-t border-[#241c13]/10 pt-4 text-xs text-[#241c13]/55">
                  <a
                    href={chapter.sourceUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline decoration-[#241c13]/20 underline-offset-4 hover:text-[#ae7a1a]"
                  >
                    Open source page
                  </a>
                </div>
              </div>
            ) : null}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

function PillList({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className="rounded-full border border-[#241c13]/15 bg-[#f8f2e8] px-3 py-1 text-sm text-[#241c13]/80"
        >
          {item}
        </span>
      ))}
    </div>
  );
}

function BulletList({
  items,
  ordered = false,
}: {
  items: string[];
  ordered?: boolean;
}) {
  if (!items.length) {
    return null;
  }

  return (
    <ul className="space-y-3">
      {items.map((item, index) => (
        <li
          key={`${item}-${index}`}
          className="flex items-start gap-3 text-[15px] leading-7 text-[#241c13]/85"
        >
          <span className="mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#241c13]/5 text-xs font-semibold text-[#241c13]/70 ring-1 ring-[#241c13]/10">
            {ordered ? index + 1 : "·"}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function CrossReferenceCards({
  items,
}: {
  items: Array<{ reference: string; relevance: string }>;
}) {
  return (
    <div className="space-y-3">
      {items.map((item, index) => (
        <div
          key={`${item.reference}-${index}`}
          className="rounded-[1rem] border border-[#241c13]/10 bg-[#f3ead8]/70 px-4 py-4"
        >
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#ae7a1a]">
            {item.reference}
          </div>
          <p className="mt-2 text-[15px] leading-7 text-[#241c13]/85">
            {item.relevance}
          </p>
        </div>
      ))}
    </div>
  );
}

function PronunciationGuide({
  items,
}: {
  items: Array<{
    term: string;
    phonetic: string;
    type: "name" | "place" | "term";
    explanation: string;
  }>;
}) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      {items.map((item, index) => (
        <div
          key={`${item.term}-${index}`}
          className="rounded-[1rem] border border-[#241c13]/10 bg-[#f3ead8]/70 px-4 py-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="font-display text-lg text-[#241c13]">
              {item.term}
            </div>
            <span className="rounded-full bg-[#241c13]/5 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#241c13]/60">
              {item.type}
            </span>
          </div>
          <div className="mt-2 text-sm italic text-[#ae7a1a]">
            {item.phonetic}
          </div>
          <p className="mt-3 text-[15px] leading-7 text-[#241c13]/85">
            {item.explanation}
          </p>
        </div>
      ))}
    </div>
  );
}

function TerminalConsole({
  logs,
  statuses,
  isStreaming,
  reference,
  focusQuestion,
}: {
  logs: ConsoleEntry[];
  statuses: Record<string, RunStatus>;
  isStreaming: boolean;
  reference?: string | null;
  focusQuestion?: string | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = scrollRef.current;

    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [logs]);

  return (
    <section className="rounded-[1.5rem] border border-[#241c13]/80 bg-[#1a140c] text-[#f3ebdb] shadow-[0_24px_80px_rgba(36,28,19,0.25)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[#f3ebdb]/10 px-6 py-4">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-[#c9533e]/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#d4a84a]/70" />
            <span className="h-2.5 w-2.5 rounded-full bg-[#7d9a42]/70" />
          </div>
          <span className="font-mono text-xs text-[#e6c87c]">
            agents {reference ? `· ${reference}` : ""}
          </span>
        </div>
        <span
          className={cn(
            "rounded-full border px-3 py-0.5 font-mono text-[10px] uppercase tracking-[0.24em]",
            isStreaming
              ? "border-[#d4a84a]/50 bg-[#d4a84a]/10 text-[#f1deaa]"
              : "border-[#f3ebdb]/10 bg-[#f3ebdb]/5 text-[#c9b99d]",
          )}
        >
          {isStreaming ? "streaming" : "idle"}
        </span>
      </header>

      <div className="grid gap-2 px-6 py-5 md:grid-cols-2 xl:grid-cols-3">
        {terminalTargets.map((target) => {
          const status = statuses[target.key] ?? {
            label: target.label,
            stage: "queued" as RunStatusStage,
            message: "Waiting to start.",
          };

          return (
            <div
              key={target.key}
              className={cn(
                "rounded-[0.85rem] border px-4 py-3",
                statusTone(status.stage),
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="font-mono text-[11px] tracking-[0.14em]">
                  {status.label}
                </div>
                <span className="font-mono text-[10px] uppercase tracking-[0.22em] opacity-80">
                  {stageDescription(status.stage)}
                </span>
              </div>
              <div className="mt-1.5 font-mono text-[11px] leading-5 opacity-90">
                {status.message}
              </div>
            </div>
          );
        })}
      </div>

      <div
        ref={scrollRef}
        className="mx-6 mb-6 h-[18rem] overflow-y-auto rounded-[0.85rem] border border-[#f3ebdb]/10 bg-black/40 px-4 py-4 font-mono text-[11px] leading-6 text-[#e6dfcb]"
      >
        {logs.length ? (
          <div className="space-y-0.5">
            {logs.map((log) => (
              <div key={log.id}>{log.line}</div>
            ))}
          </div>
        ) : (
          <div className="text-[#9a8a6b]">
            {focusQuestion
              ? `Focus: ${focusQuestion}`
              : "Initializing stream..."}
          </div>
        )}
      </div>
    </section>
  );
}

function FinalSummaryView({
  study,
  onCopyLink,
  narrationAutoplayToken,
  onNarrationAutoplayHandled,
  copyState,
}: {
  study: ActiveStudy;
  onCopyLink: () => void;
  narrationAutoplayToken: string | null;
  onNarrationAutoplayHandled: () => void;
  copyState: "idle" | "copied";
}) {
  const final = study.finalSynthesis;
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (!study.voiceNarration || !narrationAutoplayToken) {
      return;
    }

    const audioElement = audioRef.current;

    if (!audioElement) {
      return;
    }

    const playNarration = async () => {
      try {
        audioElement.currentTime = 0;
        await audioElement.play();
      } catch {
      } finally {
        onNarrationAutoplayHandled();
      }
    };

    void playNarration();
  }, [narrationAutoplayToken, onNarrationAutoplayHandled, study.voiceNarration]);

  return (
    <div className="space-y-6">
      <section className="rounded-[1.5rem] border border-[#241c13]/10 bg-[#fbf6ed] px-7 py-8 shadow-[0_16px_48px_rgba(36,28,19,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <Eyebrow>Final synthesis</Eyebrow>
            <h2 className="font-display mt-3 text-[2.5rem] leading-[1.1] text-[#241c13]">
              {study.context.parsedReference.reference}
            </h2>
            <p className="mt-5 text-[17px] leading-8 text-[#241c13]/85">
              {final.thesis}
            </p>
          </div>

          <div className="flex flex-col items-end gap-2.5">
            <span
              className={cn(
                "rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ring-1",
                confidenceTone(final.confidence),
              )}
            >
              {final.confidence} confidence
            </span>
            {hasSlug(study) ? (
              <button
                type="button"
                onClick={onCopyLink}
                className="rounded-full border border-[#241c13]/15 bg-[#f8f2e8] px-4 py-1.5 text-xs font-medium text-[#241c13]/80 transition hover:border-[#ae7a1a]/50 hover:text-[#ae7a1a]"
              >
                {copyState === "copied" ? "Link copied" : "Copy share link"}
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-8 grid gap-4 xl:grid-cols-3">
          <Card label="Historical">
            <p className="text-[15px] leading-7 text-[#241c13]/85">
              {final.historicalSnapshot}
            </p>
          </Card>
          <Card label="Geography">
            <p className="text-[15px] leading-7 text-[#241c13]/85">
              {final.geographicSnapshot}
            </p>
          </Card>
          <Card label="Translation">
            <p className="text-[15px] leading-7 text-[#241c13]/85">
              {final.translationSnapshot}
            </p>
          </Card>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card label="Consensus">
          <BulletList items={final.consensus} />
        </Card>
        <Card label="Productive differences">
          <BulletList items={final.productiveDifferences} />
        </Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card label="Canonical links">
          <CrossReferenceCards items={final.canonicalLinks} />
        </Card>
        <Card label="Practical takeaways">
          <BulletList items={final.practicalTakeaways} ordered />
        </Card>
      </div>

      {study.voiceNarration ? (
        <Card label="Voice overview">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[#241c13]/70">
              <span>
                {study.voiceNarration.voice} via{" "}
                {study.voiceNarration.provider.toUpperCase()} ·{" "}
                {study.voiceNarration.format.toUpperCase()}
              </span>
              <span>{study.voiceNarration.languageCode}</span>
            </div>
            <audio
              ref={audioRef}
              controls
              preload="metadata"
              playsInline
              className="w-full"
              src={study.voiceNarration.audioUrl}
            />
            <p className="text-[15px] leading-7 text-[#241c13]/80">
              Overview, historical relevance, and a closing prayer.
            </p>
          </div>
        </Card>
      ) : null}

      <Card label="Pronunciation guide">
        <PronunciationGuide items={final.pronunciationGuide} />
      </Card>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <Card label="Prayer prompt">
          <p className="text-[15px] leading-7 text-[#241c13]/85">
            {final.prayerPrompt}
          </p>
        </Card>
        <Card label="Open questions">
          <BulletList items={final.openQuestions} />
        </Card>
      </div>
    </div>
  );
}

function AnalystView({
  study,
  selectedReportId,
  onSelectReport,
}: {
  study: ActiveStudy;
  selectedReportId: string | null;
  onSelectReport: (modelId: string) => void;
}) {
  const activeReport =
    study.reports.find((report) => report.modelId === selectedReportId) ??
    study.reports[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {study.reports.map((report) => (
          <button
            key={report.modelId}
            type="button"
            onClick={() => onSelectReport(report.modelId)}
            className={cn(
              "rounded-full px-4 py-1.5 text-sm transition",
              activeReport.modelId === report.modelId
                ? "bg-[#241c13] text-[#f8f2e8]"
                : "border border-[#241c13]/15 bg-[#fbf6ed] text-[#241c13]/75 hover:border-[#ae7a1a]/50 hover:text-[#ae7a1a]",
            )}
          >
            {report.modelLabel}
          </button>
        ))}
      </div>

      <section className="rounded-[1.5rem] border border-[#241c13]/10 bg-[#fbf6ed] p-7 shadow-[0_16px_48px_rgba(36,28,19,0.06)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-3xl">
            <Eyebrow>{activeReport.lens}</Eyebrow>
            <h3 className="font-display mt-2 text-3xl text-[#241c13]">
              {activeReport.modelLabel}
            </h3>
            <p className="mt-4 text-[17px] leading-8 text-[#241c13]/85">
              {activeReport.thesis}
            </p>
          </div>
          <span
            className={cn(
              "rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] ring-1",
              confidenceTone(activeReport.confidence),
            )}
          >
            {activeReport.confidence}
          </span>
        </div>

        <div className="mt-8 grid gap-4 xl:grid-cols-2">
          <Card label="Historical context">
            <p className="text-[15px] leading-7 text-[#241c13]/85">
              {activeReport.historicalContext}
            </p>
          </Card>
          <Card label="Chronology + geography">
            <p className="text-[15px] leading-7 text-[#241c13]/85">
              {activeReport.chronologyInsight}
            </p>
            <p className="mt-3 text-[15px] leading-7 text-[#241c13]/70">
              {activeReport.geographyInsight}
            </p>
          </Card>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <Card label="Chapter movement">
            <BulletList items={activeReport.chapterMovement} ordered />
          </Card>
          <Card label="Meaning">
            <p className="text-[15px] leading-7 text-[#241c13]/85">
              {activeReport.meaning}
            </p>
            <div className="mt-5">
              <Eyebrow>Key themes</Eyebrow>
              <div className="mt-3">
                <PillList items={activeReport.keyThemes} />
              </div>
            </div>
          </Card>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <Card label="Translation insights">
            <div className="space-y-3">
              {activeReport.translationInsights.map((item, index) => (
                <div
                  key={`${item.verseRange}-${index}`}
                  className="rounded-[1rem] border border-[#241c13]/10 bg-[#f3ead8]/70 px-4 py-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-base text-[#241c13]">
                      {item.verseRange}
                    </span>
                    <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#ae7a1a]">
                      {item.versions.join(" / ")}
                    </span>
                  </div>
                  <p className="mt-3 text-[15px] leading-7 text-[#241c13]/85">
                    {item.observation}
                  </p>
                  <p className="mt-2 text-[15px] leading-7 text-[#241c13]/70">
                    {item.significance}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <Card label="Cross references">
            <CrossReferenceCards items={activeReport.crossReferences} />
          </Card>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <Card label="Lived response">
            <BulletList items={activeReport.livedResponse} ordered />
          </Card>
          <Card label="Cautions">
            <BulletList items={activeReport.cautions} />
          </Card>
        </div>
      </section>
    </div>
  );
}

function ContextPack({ study }: { study: ActiveStudy }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Card label="Book summary">
          <p className="text-[15px] leading-7 text-[#241c13]/85">
            {study.context.parsedReference.book.summary}
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-[0.85rem] bg-[#f3ead8]/70 px-4 py-3">
              <Eyebrow>Genre</Eyebrow>
              <div className="mt-1 font-display text-base text-[#241c13]">
                {study.context.parsedReference.book.genre}
              </div>
            </div>
            <div className="rounded-[0.85rem] bg-[#f3ead8]/70 px-4 py-3">
              <Eyebrow>Composition</Eyebrow>
              <div className="mt-1 font-display text-base text-[#241c13]">
                {study.context.parsedReference.book.compositionWindow}
              </div>
            </div>
          </div>
        </Card>

        <Card label="Setting">
          <p className="text-[15px] leading-7 text-[#241c13]/85">
            {study.context.parsedReference.book.setting}
          </p>
        </Card>
      </div>

      <Card label="Adjacent chapters">
        {study.context.relatedChapters.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {study.context.relatedChapters.map((chapter) => (
              <div
                key={chapter.reference}
                className="rounded-[1rem] border border-[#241c13]/10 bg-[#f3ead8]/70 px-4 py-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-display text-base text-[#241c13]">
                    {chapter.reference}
                  </div>
                  <span className="rounded-full bg-[#ae7a1a]/10 px-3 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-[#ae7a1a]">
                    {chapter.relation}
                  </span>
                </div>
                <Eyebrow>{chapter.versionLabel}</Eyebrow>
                <p className="mt-3 text-[15px] leading-7 text-[#241c13]/85">
                  {chapter.summary}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[15px] leading-7 text-[#241c13]/75">
            No adjacent chapter context was available for this chapter.
          </p>
        )}
      </Card>

      <Card label="Geography">
        {study.context.geography.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {study.context.geography.map((place) => (
              <div
                key={place.name}
                className="overflow-hidden rounded-[1rem] border border-[#241c13]/10 bg-[#f3ead8]/70"
              >
                {place.photoMatch ? (
                  <a
                    href={place.photoMatch.pageUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={place.photoMatch.imageUrl}
                      alt={place.photoMatch.caption}
                      className="h-44 w-full object-cover"
                    />
                  </a>
                ) : null}
                <div className="px-4 py-4">
                  <div className="font-display text-base text-[#241c13]">
                    {place.name}
                  </div>
                  <Eyebrow>{place.type}</Eyebrow>
                  <p className="mt-3 text-[15px] leading-7 text-[#241c13]/85">
                    {place.summary}
                  </p>
                  {place.photoMatch ? (
                    <p className="mt-3 text-xs leading-6 text-[#241c13]/55">
                      Photo: {place.photoMatch.caption}
                    </p>
                  ) : null}
                  {place.coordinates ? (
                    <p className="mt-2 text-[11px] uppercase tracking-[0.2em] text-[#241c13]/55">
                      {place.coordinates}
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[15px] leading-7 text-[#241c13]/75">
            No explicit place matches were found in the OpenBible geography dataset.
          </p>
        )}
      </Card>
    </div>
  );
}

function SourcesView({ study }: { study: ActiveStudy }) {
  return (
    <div className="space-y-6">
      <Card label="Source catalog">
        <div className="grid gap-3 lg:grid-cols-2">
          {study.context.sourceCatalog.map((source) => (
            <a
              key={source.label}
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-[1rem] border border-[#241c13]/10 bg-[#f3ead8]/70 px-4 py-4 transition hover:border-[#ae7a1a]/40 hover:bg-[#f3e3c6]/70"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-display text-base text-[#241c13]">
                    {source.label}
                  </div>
                  <div className="mt-2 text-[15px] leading-7 text-[#241c13]/80">
                    {source.note}
                  </div>
                </div>
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] ring-1",
                    source.status === "active" &&
                      "bg-[#e7ecd5] text-[#4d5a25] ring-[#c6d2a3]",
                    source.status === "fallback" &&
                      "bg-[#f3e7c4] text-[#7a5a1c] ring-[#e0cf97]",
                    source.status === "inactive" &&
                      "bg-[#241c13]/5 text-[#241c13]/60 ring-[#241c13]/15",
                  )}
                >
                  {source.status}
                </span>
              </div>
            </a>
          ))}
        </div>
      </Card>

      <Card label="Diagnostics">
        <BulletList
          items={study.warnings.length ? study.warnings : study.context.sourceDiagnostics}
        />
      </Card>
    </div>
  );
}

function AppHeader({ recentCount }: { recentCount: number }) {
  return (
    <header className="mx-auto flex max-w-[104rem] items-center justify-between px-6 py-6 lg:px-10">
      <Link href="/" className="flex items-center gap-3 group">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#241c13] font-display text-sm text-[#f8f2e8]">
          α
        </span>
        <span className="font-display text-lg text-[#241c13] transition group-hover:text-[#ae7a1a]">
          Bible study
        </span>
      </Link>
      {recentCount > 0 ? (
        <span className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#241c13]/55">
          {recentCount} recent {recentCount === 1 ? "study" : "studies"}
        </span>
      ) : null}
    </header>
  );
}

function HistoryRail({ history }: { history: StudyRunSummary[] }) {
  if (!history.length) return null;
  const items = history.slice(0, 6);
  return (
    <section className="border-t border-[#241c13]/10 bg-[#fbf6ed]/50">
      <div className="mx-auto max-w-[104rem] px-6 py-10 lg:px-10">
        <div className="flex items-end justify-between gap-4">
          <div>
            <Eyebrow>Recent studies</Eyebrow>
            <h2 className="font-display mt-1 text-2xl text-[#241c13]">
              Return to what you&apos;ve already opened
            </h2>
          </div>
        </div>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((entry) => (
            <Link
              key={entry.id}
              href={`/studies/${entry.slug}`}
              className="group rounded-[1.25rem] border border-[#241c13]/10 bg-[#fbf6ed] px-5 py-5 transition hover:border-[#ae7a1a]/50 hover:bg-[#f3e3c6]/40"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="font-display text-lg text-[#241c13] group-hover:text-[#ae7a1a]">
                  {entry.reference}
                </div>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] ring-1",
                    confidenceTone(entry.confidence),
                  )}
                >
                  {entry.confidence}
                </span>
              </div>
              <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#241c13]/50">
                {formatTimestamp(entry.createdAt)}
              </div>
              <p className="mt-3 line-clamp-3 text-sm leading-6 text-[#241c13]/75">
                {entry.finalThesis}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function CreateStudyView({
  selectedOsis,
  onSelectBook,
  sortMode,
  onSortModeChange,
  chapterValue,
  onChapterChange,
  focusQuestion,
  onFocusChange,
  onSubmit,
  canSubmit,
  isSubmitting,
  error,
  history,
}: {
  selectedOsis: string;
  onSelectBook: (osis: string) => void;
  sortMode: BookSortMode;
  onSortModeChange: (value: BookSortMode) => void;
  chapterValue: string;
  onChapterChange: (value: string) => void;
  focusQuestion: string;
  onFocusChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  canSubmit: boolean;
  isSubmitting: boolean;
  error: string | null;
  history: StudyRunSummary[];
}) {
  const selectedBook = books.find((book) => book.osis === selectedOsis) ?? null;
  const previewChapterNumber =
    Number.isInteger(Number(chapterValue)) && Number(chapterValue) > 0
      ? Number(chapterValue)
      : 1;
  const visibleBookGroups = useMemo(() => getBookGroups(sortMode), [sortMode]);
  const chapters = useMemo(() => {
    if (!selectedBook) return [];
    return Array.from({ length: selectedBook.chapterCount }, (_, i) => i + 1);
  }, [selectedBook]);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewChapter, setPreviewChapter] = useState<PreviewChapterData | null>(
    null,
  );
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);

  async function onOpenPreview() {
    if (!selectedBook) {
      return;
    }

    setPreviewModalOpen(true);
    setPreviewChapter(null);
    setPreviewError(null);
    setIsPreviewLoading(true);

    try {
      const reference = `${selectedBook.name} ${previewChapterNumber}`;
      const params = new URLSearchParams({
        reference,
        version: DEFAULT_VERSION_IDS[0],
      });
      const response = await fetch(`/api/study/preview?${params.toString()}`);
      const payload = (await response.json()) as
        | PreviewChapterData
        | { error?: string };

      if (!response.ok || !("reference" in payload)) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "The chapter preview failed.",
        );
      }

      setPreviewChapter(payload);
    } catch (previewLoadError) {
      setPreviewError(
        previewLoadError instanceof Error
          ? previewLoadError.message
          : "The chapter preview failed.",
      );
    } finally {
      setIsPreviewLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader recentCount={history.length} />

      <div className="flex-1">
        <div className="mx-auto max-w-3xl px-6 pt-6 pb-16 lg:pt-10">
          <div className="mb-12">
            <Eyebrow>Open a study</Eyebrow>
            <h1 className="font-display mt-3 text-[2.75rem] leading-[1.05] text-[#241c13] md:text-[3.25rem]">
              Make a choice
              <br />
              <span className="text-[#ae7a1a]">and start your session.</span>
            </h1>
            <p className="mt-5 max-w-xl text-[17px] leading-8 text-[#241c13]/75">
              Choose the book, choose a chapter, and spawn multiple agents to
              explore deep research and insights based on biblical history
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-14">
            <section>
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="font-display text-lg text-[#ae7a1a]">01</span>
                <h2 className="font-display text-xl text-[#241c13]">Book</h2>
                <div className="ml-auto flex flex-wrap gap-2">
                  {sortOptions.map((option) => {
                    const active = sortMode === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => onSortModeChange(option.value)}
                        className={cn(
                          "rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] transition",
                          active
                            ? "border-[#241c13] bg-[#241c13] text-[#f8f2e8]"
                            : "border-[#241c13]/15 bg-[#fbf6ed] text-[#241c13]/60 hover:border-[#ae7a1a] hover:text-[#ae7a1a]",
                        )}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-5 space-y-5">
                {visibleBookGroups.map((group) => (
                  <div key={group.key}>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[#241c13]/40">
                        {group.title}
                      </div>
                      {group.testament ? (
                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#ae7a1a]/70">
                          {group.testament}
                        </div>
                      ) : null}
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {group.osisList.map((osis) => {
                        const book = booksByOsis.get(osis);
                        if (!book) return null;
                        const active = selectedOsis === osis;
                        return (
                          <button
                            key={osis}
                            type="button"
                            onClick={() => {
                              onSelectBook(osis);
                              onChapterChange("");
                            }}
                            className={cn(
                              "rounded-full border px-4 py-1.5 font-display text-base transition",
                              active
                                ? "border-[#ae7a1a] bg-[#f3e3c6] text-[#7b5311] shadow-[0_6px_18px_rgba(174,122,26,0.12)]"
                                : "border-[#241c13]/15 bg-[#fbf6ed] text-[#241c13] hover:-translate-y-px hover:border-[#ae7a1a] hover:text-[#ae7a1a]",
                            )}
                          >
                            {getBookButtonLabel(osis)}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>

              <AnimatePresence>
                {selectedBook ? (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="mt-5 rounded-[1.25rem] border border-[#ae7a1a]/40 bg-[#fbf6ed] px-5 py-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <div className="font-display text-2xl text-[#241c13]">
                            {selectedBook.name}
                          </div>
                          <button
                            type="button"
                            onClick={onOpenPreview}
                            className="rounded-full border border-[#241c13]/15 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#241c13]/60 transition hover:border-[#ae7a1a] hover:text-[#ae7a1a]"
                          >
                            Preview scripture
                          </button>
                        </div>
                        <div className="mt-1 text-xs text-[#241c13]/60">
                          {selectedBook.testament} · {selectedBook.genre} ·{" "}
                          {selectedBook.chapterCount} chapters
                        </div>
                      </div>
                      <div className="text-right text-[11px] uppercase tracking-[0.18em] text-[#241c13]/45">
                        Chapter {previewChapterNumber}
                      </div>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-[#241c13]/75">
                      {selectedBook.summary}
                    </p>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </section>

            <AnimatePresence>
              {selectedBook ? (
                <motion.section
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.25 }}
                >
                  <div className="flex items-baseline gap-3">
                    <span className="font-display text-lg text-[#ae7a1a]">02</span>
                    <h2 className="font-display text-xl text-[#241c13]">
                      Chapter
                    </h2>
                  </div>
                  <div
                    className="mt-5 grid gap-2"
                    style={{
                      gridTemplateColumns: "repeat(auto-fill, minmax(3rem, 1fr))",
                    }}
                  >
                    {chapters.map((n) => {
                      const value = String(n);
                      const active = chapterValue === value;
                      return (
                        <button
                          key={n}
                          type="button"
                          onClick={() => onChapterChange(value)}
                          className={cn(
                            "flex h-12 items-center justify-center rounded-[0.85rem] font-display text-lg transition",
                            active
                              ? "bg-[#241c13] text-[#f8f2e8] shadow-[0_6px_16px_rgba(36,28,19,0.2)]"
                              : "border border-[#241c13]/15 bg-[#fbf6ed] text-[#241c13]/75 hover:border-[#ae7a1a] hover:text-[#ae7a1a]",
                          )}
                        >
                          {n}
                        </button>
                      );
                    })}
                  </div>
                </motion.section>
              ) : null}
            </AnimatePresence>

            <AnimatePresence>
              {selectedBook && chapterValue ? (
                <motion.section
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.25 }}
                  className="space-y-8"
                >
                  <div>
                    <div className="flex items-baseline gap-3">
                      <span className="font-display text-lg text-[#ae7a1a]">
                        03
                      </span>
                      <h2 className="font-display text-xl text-[#241c13]">
                        Focus question
                      </h2>
                      <span className="text-xs text-[#241c13]/50">optional</span>
                    </div>
                    <textarea
                      value={focusQuestion}
                      onChange={(event) => onFocusChange(event.target.value)}
                      rows={3}
                      placeholder="e.g. What does this chapter teach about the kingdom?"
                      className="mt-4 w-full rounded-[1rem] border border-[#241c13]/15 bg-[#fbf6ed] px-4 py-3 text-[16px] leading-7 text-[#241c13] outline-none transition placeholder:text-[#241c13]/40 focus:border-[#ae7a1a] focus:bg-white"
                    />
                  </div>

                  <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="text-xs leading-6 text-[#241c13]/55">
                      Translations:{" "}
                      <span className="text-[#241c13]/80">
                        {DEFAULT_VERSION_IDS.join(" · ")}
                      </span>
                    </div>
                    <button
                      type="submit"
                      disabled={!canSubmit}
                      className={cn(
                        "group inline-flex items-center gap-3 rounded-full px-6 py-3 font-display text-base transition",
                        canSubmit
                          ? "bg-[#241c13] text-[#f8f2e8] shadow-[0_12px_28px_rgba(36,28,19,0.22)] hover:bg-[#ae7a1a]"
                          : "cursor-not-allowed bg-[#241c13]/20 text-[#241c13]/45",
                      )}
                    >
                      <span>{isSubmitting ? "Starting..." : "Begin study"}</span>
                      <span className="transition group-hover:translate-x-0.5">
                        →
                      </span>
                    </button>
                  </div>
                </motion.section>
              ) : null}
            </AnimatePresence>

            {error ? (
              <div className="rounded-[1rem] border border-[#c9533e]/30 bg-[#f3d9d1]/50 px-4 py-3 text-sm leading-6 text-[#7a2e1c]">
                {error}
              </div>
            ) : null}
          </form>
        </div>
      </div>

      {previewModalOpen ? (
        <BookPreviewModal
          chapter={previewChapter}
          isLoading={isPreviewLoading}
          error={previewError}
          onClose={() => {
            setPreviewModalOpen(false);
            setPreviewChapter(null);
            setPreviewError(null);
            setIsPreviewLoading(false);
          }}
        />
      ) : null}

      <HistoryRail history={history} />
    </div>
  );
}

function RunningStudyView({
  reference,
  focusQuestion,
  logs,
  statuses,
  isStreaming,
  error,
  onCancelToCreate,
}: {
  reference: string;
  focusQuestion: string | null;
  logs: ConsoleEntry[];
  statuses: Record<string, RunStatus>;
  isStreaming: boolean;
  error: string | null;
  onCancelToCreate: () => void;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader recentCount={0} />
      <div className="mx-auto w-full max-w-5xl flex-1 px-6 pb-14 pt-2 lg:pt-6">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <Eyebrow>Studying</Eyebrow>
            <h1 className="font-display mt-2 text-[2.75rem] leading-[1.05] text-[#241c13]">
              {reference}
            </h1>
            {focusQuestion ? (
              <p className="mt-3 max-w-2xl text-[15px] leading-7 text-[#241c13]/75">
                <span className="text-[#241c13]/50">Focus — </span>
                {focusQuestion}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onCancelToCreate}
            className="text-xs text-[#241c13]/55 underline decoration-[#241c13]/20 underline-offset-4 hover:text-[#ae7a1a]"
          >
            Start over
          </button>
        </div>

        <TerminalConsole
          logs={logs}
          statuses={statuses}
          isStreaming={isStreaming}
          reference={reference}
          focusQuestion={focusQuestion}
        />

        {error ? (
          <div className="mt-6 rounded-[1rem] border border-[#c9533e]/30 bg-[#f3d9d1]/50 px-4 py-3 text-sm leading-6 text-[#7a2e1c]">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function ReviewStudyView({
  study,
  history,
  passageQuestions,
  activeView,
  onSetView,
  selectedReportId,
  onSelectReport,
  selectedVersionId,
  onSelectVersion,
  copyState,
  onCopyLink,
  narrationAutoplayToken,
  onNarrationAutoplayHandled,
  selectionPrompt,
  setSelectionPrompt,
  questionError,
  setQuestionError,
  readerRef,
  onReaderMouseUp,
  onSubmitPassageQuestion,
  isAskingQuestion,
  onStartNewStudy,
}: {
  study: ActiveStudy;
  history: StudyRunSummary[];
  passageQuestions: PersistedPassageQuestion[];
  activeView: ViewKey;
  onSetView: (view: ViewKey) => void;
  selectedReportId: string | null;
  onSelectReport: (modelId: string) => void;
  selectedVersionId: string;
  onSelectVersion: (versionId: string) => void;
  copyState: "idle" | "copied";
  onCopyLink: () => void;
  narrationAutoplayToken: string | null;
  onNarrationAutoplayHandled: () => void;
  selectionPrompt: SelectionPromptState | null;
  setSelectionPrompt: (
    updater:
      | SelectionPromptState
      | null
      | ((prev: SelectionPromptState | null) => SelectionPromptState | null),
  ) => void;
  questionError: string | null;
  setQuestionError: (value: string | null) => void;
  readerRef: React.RefObject<HTMLDivElement | null>;
  onReaderMouseUp: () => void;
  onSubmitPassageQuestion: () => void;
  isAskingQuestion: boolean;
  onStartNewStudy: () => void;
}) {
  const currentVersion =
    study.context.versions.find(
      (version) => version.versionId === selectedVersionId,
    ) ??
    study.context.versions[0] ??
    null;
  const selectedQuestionId = passageQuestions[0]?.id ?? null;

  return (
    <div className="min-h-screen">
      <AppHeader recentCount={history.length} />

      <div className="mx-auto grid max-w-[104rem] gap-8 px-6 pb-14 pt-2 lg:grid-cols-[18rem_minmax(0,1fr)] lg:px-10 lg:pt-4">
        <aside className="space-y-5">
          <button
            type="button"
            onClick={onStartNewStudy}
            className="group flex w-full items-center justify-between rounded-[1rem] border border-[#241c13]/15 bg-[#fbf6ed] px-4 py-3 text-left transition hover:border-[#ae7a1a] hover:bg-[#f3e3c6]/40"
          >
            <span>
              <div className="font-display text-base text-[#241c13] group-hover:text-[#ae7a1a]">
                New study
              </div>
              <div className="text-[11px] uppercase tracking-[0.2em] text-[#241c13]/50">
                Pick another chapter
              </div>
            </span>
            <span className="text-lg text-[#241c13]/40 transition group-hover:translate-x-0.5 group-hover:text-[#ae7a1a]">
              →
            </span>
          </button>

          <section>
            <Eyebrow>Recent</Eyebrow>
            <div className="mt-3 space-y-2">
              {history.length ? (
                history.map((entry) => {
                  const active = hasSlug(study) && entry.id === study.id;
                  return (
                    <Link
                      key={entry.id}
                      href={`/studies/${entry.slug}`}
                      className={cn(
                        "block rounded-[0.85rem] border px-3 py-3 transition",
                        active
                          ? "border-[#ae7a1a] bg-[#fbf6ed]"
                          : "border-[#241c13]/10 bg-[#fbf6ed]/60 hover:border-[#ae7a1a]/50 hover:bg-[#fbf6ed]",
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-display text-sm text-[#241c13]">
                          {entry.reference}
                        </div>
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] ring-1",
                            confidenceTone(entry.confidence),
                          )}
                        >
                          {entry.confidence}
                        </span>
                      </div>
                      <div className="mt-1 text-[10px] uppercase tracking-[0.2em] text-[#241c13]/45">
                        {formatTimestamp(entry.createdAt)}
                      </div>
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-[#241c13]/70">
                        {entry.finalThesis}
                      </p>
                    </Link>
                  );
                })
              ) : (
                <div className="rounded-[0.85rem] border border-dashed border-[#241c13]/15 bg-[#fbf6ed]/40 px-3 py-4 text-xs leading-5 text-[#241c13]/60">
                  Saved studies will appear here.
                </div>
              )}
            </div>
          </section>
        </aside>

        <section className="space-y-6">
          <section className="rounded-[1.5rem] border border-[#241c13]/10 bg-[#fbf6ed] px-6 py-6 shadow-[0_16px_48px_rgba(36,28,19,0.06)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <Eyebrow>Active study</Eyebrow>
                <h1 className="font-display mt-2 text-[2.75rem] leading-[1.05] text-[#241c13]">
                  {study.context.parsedReference.reference}
                </h1>
                <p className="mt-3 max-w-2xl text-[15px] leading-7 text-[#241c13]/75">
                  {study.request.focusQuestion
                    ? study.request.focusQuestion
                    : study.context.parsedReference.book.summary}
                </p>
              </div>
              <div className="rounded-[1rem] border border-[#241c13]/10 bg-[#f3ead8]/70 px-4 py-3 text-xs text-[#241c13]/70">
                {hasSlug(study) ? (
                  <div>
                    <span className="text-[#241c13]/50">ID </span>
                    {study.id.slice(0, 8)}
                  </div>
                ) : null}
                <div className="mt-1">
                  <span className="text-[#241c13]/50">Generated </span>
                  {formatTimestamp(study.generatedAt)}
                </div>
                <div className="mt-1">
                  <span className="text-[#241c13]/50">Versions </span>
                  {study.context.versions
                    .map((version) => version.versionId)
                    .join(", ")}
                </div>
                {copyState === "copied" ? (
                  <div className="mt-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#7d9a42]">
                    Link copied
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {viewOptions.map((option) => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => onSetView(option.key)}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-sm transition",
                    activeView === option.key
                      ? "bg-[#241c13] text-[#f8f2e8]"
                      : "border border-[#241c13]/15 bg-[#fbf6ed] text-[#241c13]/75 hover:border-[#ae7a1a]/50 hover:text-[#ae7a1a]",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </section>

          {activeView === "summary" ? (
            <FinalSummaryView
              study={study}
              onCopyLink={onCopyLink}
              narrationAutoplayToken={narrationAutoplayToken}
              onNarrationAutoplayHandled={onNarrationAutoplayHandled}
              copyState={copyState}
            />
          ) : null}

          {activeView === "analysts" ? (
            <AnalystView
              study={study}
              selectedReportId={selectedReportId}
              onSelectReport={onSelectReport}
            />
          ) : null}

          {activeView === "reader" ? (
            <div className="space-y-6">
              <div>
                <Eyebrow>Chapter reader</Eyebrow>
                <h2 className="font-display mt-2 text-3xl text-[#241c13]">
                  Read, highlight, and ask.
                </h2>
                <p className="mt-2 max-w-3xl text-[15px] leading-7 text-[#241c13]/75">
                  Highlight any portion of the chapter to open a focused question.
                  Answers are saved with this study.
                </p>
              </div>

              <section className="rounded-[1.5rem] border border-[#241c13]/10 bg-[#fbf6ed] p-6 shadow-[0_16px_48px_rgba(36,28,19,0.06)]">
                <div className="flex flex-wrap items-center gap-2">
                  {study.context.versions.map((version) => (
                    <button
                      key={version.versionId}
                      type="button"
                      onClick={() => {
                        onSelectVersion(version.versionId);
                        setSelectionPrompt(null);
                        setQuestionError(null);
                      }}
                      className={cn(
                        "rounded-full px-4 py-1.5 text-sm transition",
                        currentVersion?.versionId === version.versionId
                          ? "bg-[#241c13] text-[#f8f2e8]"
                          : "border border-[#241c13]/15 bg-[#fbf6ed] text-[#241c13]/75 hover:border-[#ae7a1a]/50 hover:text-[#ae7a1a]",
                      )}
                    >
                      {version.versionId}
                    </button>
                  ))}
                </div>

                {currentVersion ? (
                  <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
                    <div className="relative">
                      <div className="rounded-[1rem] bg-[#1a140c] px-5 py-4 text-[#f3ebdb]">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#e6c87c]">
                          {currentVersion.versionId}
                        </div>
                        <div className="font-display mt-1 text-2xl">
                          {currentVersion.versionLabel}
                        </div>
                        <p className="mt-2 text-sm leading-7 text-[#e6dfcb]">
                          {currentVersion.description}
                        </p>
                      </div>

                      <div
                        ref={readerRef}
                        onMouseUp={onReaderMouseUp}
                        className="relative mt-4 max-h-[46rem] overflow-y-auto rounded-[1rem] border border-[#241c13]/10 bg-[#fbf6ed] px-6 py-6"
                      >
                        <div className="space-y-4">
                          {currentVersion.verses.map((verse, index) => (
                            <p
                              key={`${currentVersion.versionId}-${verse.verse}-${index}`}
                              className="font-display text-lg leading-9 text-[#241c13]/90"
                            >
                              <span className="mr-3 align-top text-xs font-semibold text-[#ae7a1a]">
                                {verse.verse}
                              </span>
                              {verse.text}
                            </p>
                          ))}
                        </div>

                        {selectionPrompt ? (
                          <div
                            onMouseUp={(event) => event.stopPropagation()}
                            className="absolute z-20 w-[20rem] rounded-[1rem] border border-[#241c13]/15 bg-[#fbf6ed] p-4 shadow-[0_20px_50px_rgba(36,28,19,0.18)]"
                            style={{
                              top: selectionPrompt.top,
                              left: selectionPrompt.left,
                            }}
                          >
                            <Eyebrow>Selected text</Eyebrow>
                            <p className="mt-2 line-clamp-4 text-sm leading-6 text-[#241c13]/80">
                              {selectionPrompt.text}
                            </p>
                            <label className="mt-4 block text-sm font-medium text-[#241c13]">
                              Ask about this section
                            </label>
                            <textarea
                              value={selectionPrompt.question}
                              onChange={(event) =>
                                setSelectionPrompt((prev) =>
                                  prev
                                    ? { ...prev, question: event.target.value }
                                    : prev,
                                )
                              }
                              rows={4}
                              placeholder="What does this section mean in context?"
                              className="mt-2 w-full rounded-[0.75rem] border border-[#241c13]/15 bg-white px-3 py-2 text-sm leading-6 text-[#241c13] outline-none transition focus:border-[#ae7a1a]"
                            />
                            {questionError ? (
                              <div className="mt-3 text-sm text-[#7a2e1c]">
                                {questionError}
                              </div>
                            ) : null}
                            <div className="mt-4 flex gap-2">
                              <button
                                type="button"
                                onClick={onSubmitPassageQuestion}
                                disabled={isAskingQuestion}
                                className="rounded-full bg-[#241c13] px-4 py-1.5 text-sm text-[#f8f2e8] transition hover:bg-[#ae7a1a] disabled:cursor-not-allowed disabled:bg-[#241c13]/30"
                              >
                                {isAskingQuestion ? "Asking..." : "Ask GPT-5.4"}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectionPrompt(null);
                                  setQuestionError(null);
                                  window.getSelection()?.removeAllRanges();
                                }}
                                className="rounded-full border border-[#241c13]/15 px-4 py-1.5 text-sm text-[#241c13]/70 hover:text-[#241c13]"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <Card label="Reader meta">
                        <div className="space-y-2 text-sm text-[#241c13]/80">
                          <div>
                            <span className="text-[#241c13]/55">Attribution </span>
                            {currentVersion.attribution}
                          </div>
                          <div>
                            <span className="text-[#241c13]/55">Verses </span>
                            {currentVersion.verses.length}
                          </div>
                          <div>
                            <span className="text-[#241c13]/55">Source </span>
                            <a
                              href={currentVersion.sourceUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-[#ae7a1a] underline decoration-[#ae7a1a]/30 underline-offset-4"
                            >
                              Open
                            </a>
                          </div>
                        </div>
                      </Card>

                      <Card label="Saved passage questions">
                        {passageQuestions.length ? (
                          <div className="space-y-3">
                            {passageQuestions.map((entry) => (
                              <div
                                key={entry.id}
                                className={cn(
                                  "rounded-[1rem] border px-4 py-4",
                                  selectedQuestionId === entry.id
                                    ? "border-[#ae7a1a] bg-[#fbf6ed]"
                                    : "border-[#241c13]/10 bg-[#f3ead8]/60",
                                )}
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[#241c13]/55">
                                    {entry.versionId}
                                  </div>
                                  <span
                                    className={cn(
                                      "rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.22em] ring-1",
                                      confidenceTone(entry.confidence),
                                    )}
                                  >
                                    {entry.confidence}
                                  </span>
                                </div>
                                <p className="font-display mt-2 text-sm text-[#241c13]">
                                  “{entry.selectionText}”
                                </p>
                                <p className="mt-2 text-sm leading-6 text-[#241c13]/80">
                                  <span className="text-[#241c13]/55">Q </span>
                                  {entry.question}
                                </p>
                                <p className="mt-2 text-sm leading-6 text-[#241c13]/80">
                                  <span className="text-[#241c13]/55">A </span>
                                  {entry.answer}
                                </p>
                                <p className="mt-2 text-xs leading-5 text-[#241c13]/55">
                                  {entry.surroundingContext}
                                </p>
                                <div className="mt-2 text-[10px] uppercase tracking-[0.22em] text-[#241c13]/45">
                                  {formatTimestamp(entry.createdAt)}
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[15px] leading-7 text-[#241c13]/70">
                            Highlight text in the reader to save focused questions
                            for this study.
                          </p>
                        )}
                      </Card>
                    </div>
                  </div>
                ) : null}
              </section>
            </div>
          ) : null}

          {activeView === "context" ? (
            <div className="space-y-6">
              <div>
                <Eyebrow>Context pack</Eyebrow>
                <h2 className="font-display mt-2 text-3xl text-[#241c13]">
                  Historical, geographic, and literary frame
                </h2>
                <p className="mt-2 max-w-3xl text-[15px] leading-7 text-[#241c13]/75">
                  The bundle fed to the analysts so the chapter is read as a full
                  literary unit in its broader canonical context.
                </p>
              </div>
              <ContextPack study={study} />
            </div>
          ) : null}

          {activeView === "sources" ? (
            <div className="space-y-6">
              <div>
                <Eyebrow>Sources</Eyebrow>
                <h2 className="font-display mt-2 text-3xl text-[#241c13]">
                  Providers and runtime notes
                </h2>
                <p className="mt-2 max-w-3xl text-[15px] leading-7 text-[#241c13]/75">
                  Which providers served the text, which fallbacks were used,
                  and which runtime warnings fired.
                </p>
              </div>
              <SourcesView study={study} />
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

export function StudyWorkbench({
  initialHistory = [],
  initialStudy = null,
  initialPassageQuestions = [],
}: StudyWorkbenchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const readerRef = useRef<HTMLDivElement>(null);

  const [phase, setPhase] = useState<Phase>(initialStudy ? "review" : "create");
  const [history, setHistory] = useState<StudyRunSummary[]>(initialHistory);
  const [currentStudy, setCurrentStudy] = useState<ActiveStudy | null>(
    initialStudy,
  );
  const [passageQuestions, setPassageQuestions] = useState<
    PersistedPassageQuestion[]
  >(initialPassageQuestions);
  const [activeView, setActiveView] = useState<ViewKey>("summary");
  const [selectedReportId, setSelectedReportId] = useState<string | null>(
    initialStudy?.reports[0]?.modelId ?? null,
  );
  const [selectedVersionId, setSelectedVersionId] = useState<string>(
    initialStudy?.context.versions[0]?.versionId ?? DEFAULT_VERSION_IDS[0],
  );
  const [copyState, setCopyState] = useState<"idle" | "copied">("idle");
  const [error, setError] = useState<string | null>(null);
  const [questionError, setQuestionError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAskingQuestion, setIsAskingQuestion] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [consoleLogs, setConsoleLogs] = useState<ConsoleEntry[]>([]);
  const [runStatuses, setRunStatuses] = useState<Record<string, RunStatus>>(
    createDefaultRunStatuses(),
  );
  const [narrationAutoplayToken, setNarrationAutoplayToken] = useState<
    string | null
  >(initialStudy ? getNarrationAutoplayToken(initialStudy) : null);
  const [sortMode, setSortMode] = useState<BookSortMode>("order");
  const [selectedOsis, setSelectedOsis] = useState<string>(
    initialStudy?.context.parsedReference.book.osis ?? "",
  );
  const [chapterValue, setChapterValue] = useState<string>(
    initialStudy ? String(initialStudy.context.parsedReference.chapter) : "",
  );
  const [focusQuestion, setFocusQuestion] = useState<string>(
    initialStudy?.request.focusQuestion ?? "",
  );
  const [selectionPrompt, setSelectionPrompt] =
    useState<SelectionPromptState | null>(null);

  const selectedBook = books.find((book) => book.osis === selectedOsis) ?? null;
  const chapterNumber = Number(chapterValue);
  const canSubmit =
    !!selectedBook &&
    Number.isInteger(chapterNumber) &&
    chapterNumber > 0 &&
    chapterNumber <= (selectedBook?.chapterCount ?? 0) &&
    !isSubmitting &&
    !isStreaming;

  const runningReference = selectedBook
    ? `${selectedBook.name} ${chapterValue}`
    : "";

  function appendConsoleLine(line: string) {
    setConsoleLogs((previous) => [
      ...previous,
      {
        id: `${previous.length + 1}-${Date.now()}`,
        line,
      },
    ]);
  }

  function handleStudyStreamEvent(event: StudyRunEvent) {
    if (event.type === "run-start") {
      setRunStatuses(createDefaultRunStatuses());
      appendConsoleLine(
        `[${formatConsoleTime(event.timestamp)}] [run] Starting ${event.reference} with ${event.versions.join(", ")}`,
      );
      return;
    }

    if (event.type === "status") {
      setRunStatuses((previous) => ({
        ...previous,
        [event.target]: {
          label: event.label,
          stage: event.stage,
          message: event.message,
        },
      }));
      appendConsoleLine(
        `[${formatConsoleTime(event.timestamp)}] [${event.label}] ${event.stage.toUpperCase()} ${event.message}`,
      );
      return;
    }

    if (event.type === "log") {
      appendConsoleLine(
        `[${formatConsoleTime(event.timestamp)}] [${event.label ?? event.scope}] ${event.message}`,
      );
      return;
    }

    if (event.type === "result") {
      const study = event.study as ActiveStudy;
      setCurrentStudy(study);
      setNarrationAutoplayToken(getNarrationAutoplayToken(study));
      setPassageQuestions([]);
      setSelectedReportId(study.reports[0]?.modelId ?? null);
      setSelectedVersionId(
        study.context.versions[0]?.versionId ?? DEFAULT_VERSION_IDS[0],
      );
      setActiveView("summary");
      setCopyState("idle");
      setQuestionError(null);
      setError(null);
      setPhase("review");

      if (hasSlug(study)) {
        setHistory((previous) => {
          const nextSummary = buildSummaryFromStudy(study);
          const merged = [
            nextSummary,
            ...previous.filter((item) => item.id !== nextSummary.id),
          ];
          return merged.slice(0, 12);
        });

        if (pathname !== `/studies/${study.slug}`) {
          router.replace(`/studies/${study.slug}`);
        }
      }
      return;
    }

    if (event.type === "error") {
      setError(event.message);
      setIsStreaming(false);
      setPhase("create");
      appendConsoleLine(
        `[${formatConsoleTime(event.timestamp)}] [error] ${event.message}`,
      );
      return;
    }

    if (event.type === "complete") {
      setIsStreaming(false);
      appendConsoleLine(
        `[${formatConsoleTime(event.timestamp)}] [run] Stream complete`,
      );
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setQuestionError(null);
    setSelectionPrompt(null);

    if (!selectedBook) {
      setError("Choose a book.");
      return;
    }

    const chapter = Number(chapterValue);

    if (
      !Number.isInteger(chapter) ||
      chapter <= 0 ||
      chapter > selectedBook.chapterCount
    ) {
      setError(
        `Choose a chapter between 1 and ${selectedBook.chapterCount} for ${selectedBook.name}.`,
      );
      return;
    }

    setIsSubmitting(true);
    setIsStreaming(true);
    setPhase("running");
    setConsoleLogs([]);
    setRunStatuses(createDefaultRunStatuses());
    setNarrationAutoplayToken(null);

    try {
      const reference = `${selectedBook.name} ${chapter}`;
      const response = await fetch("/api/study/stream", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reference,
          focusQuestion: focusQuestion || undefined,
          versions: DEFAULT_VERSION_IDS,
        }),
      });

      if (!response.ok || !response.body) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        throw new Error(payload?.error ?? "The study request failed.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();

        if (done) {
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) {
            continue;
          }

          handleStudyStreamEvent(JSON.parse(line) as StudyRunEvent);
        }
      }

      if (buffer.trim()) {
        handleStudyStreamEvent(JSON.parse(buffer) as StudyRunEvent);
      }
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "The study request failed.",
      );
      setIsStreaming(false);
      setPhase("create");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function onCopyLink() {
    if (!hasSlug(currentStudy)) {
      return;
    }

    await navigator.clipboard.writeText(
      `${window.location.origin}/studies/${currentStudy.slug}`,
    );
    setCopyState("copied");
    window.setTimeout(() => setCopyState("idle"), 1800);
  }

  function onReaderMouseUp() {
    const container = readerRef.current;
    const selection = window.getSelection();

    if (!container || !selection || selection.isCollapsed) {
      return;
    }

    const anchorNode = selection.anchorNode;
    const focusNode = selection.focusNode;

    if (
      !anchorNode ||
      !focusNode ||
      !container.contains(anchorNode) ||
      !container.contains(focusNode)
    ) {
      return;
    }

    const selectedText = selection.toString().replace(/\s+/g, " ").trim();

    if (selectedText.length < 2) {
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const top = rect.bottom - containerRect.top + container.scrollTop + 12;
    const left = Math.max(
      16,
      Math.min(
        rect.left - containerRect.left + container.scrollLeft,
        container.clientWidth - 352,
      ),
    );

    setSelectionPrompt({
      text: selectedText,
      question: "",
      top,
      left,
    });
    setQuestionError(null);
  }

  async function submitPassageQuestion() {
    if (
      !currentStudy ||
      !hasSlug(currentStudy) ||
      !selectionPrompt
    ) {
      return;
    }

    const version =
      currentStudy.context.versions.find(
        (v) => v.versionId === selectedVersionId,
      ) ?? currentStudy.context.versions[0];

    if (!version) {
      return;
    }

    if (!selectionPrompt.question.trim()) {
      setQuestionError("Ask a question about the selected text first.");
      return;
    }

    setIsAskingQuestion(true);
    setQuestionError(null);

    try {
      const response = await fetch("/api/study/qa", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          studyId: currentStudy.id,
          versionId: version.versionId,
          selectionText: selectionPrompt.text,
          question: selectionPrompt.question,
        }),
      });
      const payload = (await response.json()) as
        | PersistedPassageQuestion
        | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in payload && payload.error
            ? payload.error
            : "The passage question failed.",
        );
      }

      const saved = payload as PersistedPassageQuestion;
      setPassageQuestions((previous) => {
        const merged = [saved, ...previous.filter((item) => item.id !== saved.id)];
        return merged;
      });
      setSelectionPrompt(null);
      window.getSelection()?.removeAllRanges();
    } catch (askError) {
      setQuestionError(
        askError instanceof Error
          ? askError.message
          : "The passage question failed.",
      );
    } finally {
      setIsAskingQuestion(false);
    }
  }

  function onStartNewStudy() {
    if (pathname !== "/") {
      router.push("/");
      return;
    }
    setCurrentStudy(null);
    setPhase("create");
    setSelectedOsis("");
    setChapterValue("");
    setFocusQuestion("");
    setError(null);
  }

  return (
    <AnimatePresence mode="wait">
      {phase === "create" ? (
        <motion.main
          key="create"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <CreateStudyView
            selectedOsis={selectedOsis}
            onSelectBook={setSelectedOsis}
            sortMode={sortMode}
            onSortModeChange={setSortMode}
            chapterValue={chapterValue}
            onChapterChange={setChapterValue}
            focusQuestion={focusQuestion}
            onFocusChange={setFocusQuestion}
            onSubmit={onSubmit}
            canSubmit={canSubmit}
            isSubmitting={isSubmitting}
            error={error}
            history={history}
          />
        </motion.main>
      ) : null}

      {phase === "running" ? (
        <motion.main
          key="running"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <RunningStudyView
            reference={runningReference}
            focusQuestion={focusQuestion || null}
            logs={consoleLogs}
            statuses={runStatuses}
            isStreaming={isStreaming}
            error={error}
            onCancelToCreate={() => {
              setIsStreaming(false);
              setPhase("create");
            }}
          />
        </motion.main>
      ) : null}

      {phase === "review" && currentStudy ? (
        <motion.main
          key="review"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <ReviewStudyView
            study={currentStudy}
            history={history}
            passageQuestions={passageQuestions}
            activeView={activeView}
            onSetView={setActiveView}
            selectedReportId={selectedReportId}
            onSelectReport={setSelectedReportId}
            selectedVersionId={selectedVersionId}
            onSelectVersion={setSelectedVersionId}
            copyState={copyState}
            onCopyLink={onCopyLink}
            narrationAutoplayToken={narrationAutoplayToken}
            onNarrationAutoplayHandled={() => setNarrationAutoplayToken(null)}
            selectionPrompt={selectionPrompt}
            setSelectionPrompt={setSelectionPrompt}
            questionError={questionError}
            setQuestionError={setQuestionError}
            readerRef={readerRef}
            onReaderMouseUp={onReaderMouseUp}
            onSubmitPassageQuestion={submitPassageQuestion}
            isAskingQuestion={isAskingQuestion}
            onStartNewStudy={onStartNewStudy}
          />
        </motion.main>
      ) : null}
    </AnimatePresence>
  );
}
