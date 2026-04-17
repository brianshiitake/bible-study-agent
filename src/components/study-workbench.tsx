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
import AnimatedList, {
  type AnimatedListItem,
} from "@/components/react-bits/animated-list";
import StaggeredText from "@/components/react-bits/staggered-text";
import { cn } from "@/lib/utils";
import { getBookChapterCount } from "@/lib/study/book-chapters";
import { getNewTestamentBookMetadata } from "@/lib/study/book-metadata";
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

const books = getNewTestamentBookMetadata().map((book) => ({
  ...book,
  chapterCount: getBookChapterCount(book.osis),
}));

const viewOptions: Array<{ key: ViewKey; label: string }> = [
  { key: "summary", label: "Final Summary" },
  { key: "analysts", label: "Model Outputs" },
  { key: "reader", label: "Chapter Reader" },
  { key: "context", label: "Context Pack" },
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

function parseReferenceFromStudy(study: ActiveStudy | null) {
  if (!study) {
    return {
      bookName: "John",
      chapter: "3",
      focusQuestion: "",
    };
  }

  return {
    bookName: study.context.parsedReference.book.name,
    chapter: String(study.context.parsedReference.chapter),
    focusQuestion: study.request.focusQuestion ?? "",
  };
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
    return "bg-emerald-100 text-emerald-900 ring-emerald-300";
  }

  if (confidence === "medium") {
    return "bg-amber-100 text-amber-900 ring-amber-300";
  }

  return "bg-rose-100 text-rose-900 ring-rose-300";
}

function statusTone(stage: RunStatusStage) {
  if (stage === "completed") {
    return "border-emerald-400/40 bg-emerald-500/15 text-emerald-100";
  }

  if (stage === "running") {
    return "border-sky-400/40 bg-sky-500/15 text-sky-100";
  }

  if (stage === "failed") {
    return "border-rose-400/40 bg-rose-500/15 text-rose-100";
  }

  return "border-white/10 bg-white/5 text-slate-300";
}

function SectionTitle({
  eyebrow,
  title,
  body,
}: {
  eyebrow: string;
  title: string;
  body?: string;
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-700/70">
        {eyebrow}
      </div>
      <h2 className="font-display mt-3 text-3xl text-slate-950">{title}</h2>
      {body ? (
        <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-700">{body}</p>
      ) : null}
    </div>
  );
}

function SummaryCard({
  label,
  children,
  className,
  dark = false,
}: {
  label: string;
  children: ReactNode;
  className?: string;
  dark?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[1.75rem] border p-5",
        dark
          ? "border-white/10 bg-white/10 shadow-none"
          : "border-slate-200 bg-white/95 shadow-[0_16px_60px_rgba(15,23,42,0.08)]",
        className,
      )}
    >
      <div
        className={cn(
          "text-xs font-semibold uppercase tracking-[0.24em]",
          dark ? "text-sky-100/70" : "text-slate-500",
        )}
      >
        {label}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function PillList({ items }: { items: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <span
          key={item}
          className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm text-slate-700"
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
          className="flex items-start gap-3 text-sm leading-7 text-slate-700"
        >
          <span className="mt-1 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
            {ordered ? index + 1 : "•"}
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
          className="rounded-[1.4rem] border border-slate-200 bg-slate-50/90 px-4 py-4"
        >
          <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
            {item.reference}
          </div>
          <p className="mt-2 text-sm leading-7 text-slate-700">{item.relevance}</p>
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
          className="rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold text-slate-950">{item.term}</div>
            <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700">
              {item.type}
            </span>
          </div>
          <div className="mt-2 text-sm font-medium italic text-sky-800">
            {item.phonetic}
          </div>
          <p className="mt-3 text-sm leading-7 text-slate-700">{item.explanation}</p>
        </div>
      ))}
    </div>
  );
}

function TerminalConsole({
  logs,
  statuses,
  isStreaming,
}: {
  logs: ConsoleEntry[];
  statuses: Record<string, RunStatus>;
  isStreaming: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = scrollRef.current;

    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }, [logs]);

  return (
    <section className="rounded-[2rem] border border-slate-900 bg-[linear-gradient(180deg,#020617_0%,#111827_100%)] p-5 text-slate-100 shadow-[0_24px_80px_rgba(2,6,23,0.35)]">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-200/80">
            Live Agent Console
          </div>
          <p className="mt-2 text-sm leading-7 text-slate-300">
            Streams execution activity and completion state for the context stage,
            each analyst, and the final synthesis.
          </p>
        </div>
        <span
          className={cn(
            "rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
            isStreaming
              ? "border-sky-400/40 bg-sky-500/15 text-sky-100"
              : "border-white/10 bg-white/5 text-slate-300",
          )}
        >
          {isStreaming ? "Streaming" : "Idle"}
        </span>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {terminalTargets.map((target) => {
          const status = statuses[target.key] ?? {
            label: target.label,
            stage: "queued",
            message: "Waiting to start.",
          };

          return (
            <div
              key={target.key}
              className={cn(
                "rounded-[1.3rem] border px-4 py-4",
                statusTone(status.stage),
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="font-mono text-xs uppercase tracking-[0.18em]">
                  {status.label}
                </div>
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">
                  {status.stage}
                </span>
              </div>
              <div className="mt-2 font-mono text-xs leading-6 text-inherit/90">
                {status.message}
              </div>
            </div>
          );
        })}
      </div>

      <div
        ref={scrollRef}
        className="mt-5 h-[18rem] overflow-y-auto rounded-[1.5rem] border border-white/10 bg-black/30 px-4 py-4 font-mono text-xs leading-6 text-slate-200"
      >
        {logs.length ? (
          <div className="space-y-1">
            {logs.map((log) => (
              <div key={log.id}>{log.line}</div>
            ))}
          </div>
        ) : (
          <div className="text-slate-400">
            Launch a study to begin streaming agent activity.
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
}: {
  study: ActiveStudy;
  onCopyLink: () => void;
  narrationAutoplayToken: string | null;
  onNarrationAutoplayHandled: () => void;
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
      <section className="rounded-[2rem] border border-sky-200/70 bg-[linear-gradient(135deg,#082f49_0%,#0f172a_62%,#111827_100%)] px-6 py-7 text-slate-50 shadow-[0_24px_80px_rgba(8,47,73,0.28)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.28em] text-sky-200/80">
              Final Synthesis
            </div>
            <h2 className="font-display mt-3 text-4xl leading-tight text-white">
              {study.context.parsedReference.reference}
            </h2>
            <p className="mt-4 max-w-4xl text-base leading-8 text-slate-200">
              {final.thesis}
            </p>
          </div>

          <div className="flex flex-col items-end gap-3">
            <span
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ring-1",
                final.confidence === "high" &&
                  "bg-emerald-500/20 text-emerald-100 ring-emerald-400/40",
                final.confidence === "medium" &&
                  "bg-amber-500/20 text-amber-100 ring-amber-400/40",
                final.confidence === "low" &&
                  "bg-rose-500/20 text-rose-100 ring-rose-400/40",
              )}
            >
              {final.confidence} confidence
            </span>
            {hasSlug(study) ? (
              <button
                type="button"
                onClick={onCopyLink}
                className="rounded-full border border-sky-300/40 bg-white/10 px-4 py-2 text-sm font-semibold text-sky-50 transition hover:bg-white/20"
              >
                Copy share link
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-8 grid gap-4 xl:grid-cols-3">
          <SummaryCard label="Historical Snapshot" dark>
            <p className="text-sm leading-7 text-slate-100">
              {final.historicalSnapshot}
            </p>
          </SummaryCard>
          <SummaryCard label="Geography Snapshot" dark>
            <p className="text-sm leading-7 text-slate-100">
              {final.geographicSnapshot}
            </p>
          </SummaryCard>
          <SummaryCard label="Translation Snapshot" dark>
            <p className="text-sm leading-7 text-slate-100">
              {final.translationSnapshot}
            </p>
          </SummaryCard>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <SummaryCard label="Consensus">
          <BulletList items={final.consensus} />
        </SummaryCard>
        <SummaryCard label="Productive Differences">
          <BulletList items={final.productiveDifferences} />
        </SummaryCard>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <SummaryCard label="Canonical Links">
          <CrossReferenceCards items={final.canonicalLinks} />
        </SummaryCard>
        <SummaryCard label="Practical Takeaways">
          <BulletList items={final.practicalTakeaways} ordered />
        </SummaryCard>
      </div>

      {study.voiceNarration ? (
        <SummaryCard label="Voice Overview">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-slate-600">
              <span>
                {study.voiceNarration.voice} via {study.voiceNarration.provider.toUpperCase()} · {study.voiceNarration.format.toUpperCase()}
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
            <p className="text-sm leading-7 text-slate-700">
              This narration includes the overview, historical relevance, and prayer.
            </p>
          </div>
        </SummaryCard>
      ) : null}

      <SummaryCard label="Pronunciation Guide">
        <PronunciationGuide items={final.pronunciationGuide} />
      </SummaryCard>

      <div className="grid gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <SummaryCard label="Prayer Prompt">
          <p className="text-sm leading-7 text-slate-700">{final.prayerPrompt}</p>
        </SummaryCard>
        <SummaryCard label="Open Questions">
          <BulletList items={final.openQuestions} />
        </SummaryCard>
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
      <div className="flex flex-wrap gap-3">
        {study.reports.map((report) => (
          <button
            key={report.modelId}
            type="button"
            onClick={() => onSelectReport(report.modelId)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold transition",
              activeReport.modelId === report.modelId
                ? "bg-sky-900 text-white shadow-[0_12px_32px_rgba(8,47,73,0.28)]"
                : "border border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:text-sky-800",
            )}
          >
            {report.modelLabel}
          </button>
        ))}
      </div>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-[0_20px_70px_rgba(15,23,42,0.08)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
              {activeReport.lens}
            </div>
            <h3 className="mt-2 text-3xl font-semibold text-slate-950">
              {activeReport.modelLabel}
            </h3>
            <p className="mt-4 max-w-4xl text-base leading-8 text-slate-700">
              {activeReport.thesis}
            </p>
          </div>
          <span
            className={cn(
              "rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ring-1",
              confidenceTone(activeReport.confidence),
            )}
          >
            {activeReport.confidence}
          </span>
        </div>

        <div className="mt-8 grid gap-4 xl:grid-cols-2">
          <SummaryCard label="Historical Context">
            <p className="text-sm leading-7 text-slate-700">
              {activeReport.historicalContext}
            </p>
          </SummaryCard>
          <SummaryCard label="Chronology + Geography">
            <p className="text-sm leading-7 text-slate-700">
              {activeReport.chronologyInsight}
            </p>
            <p className="mt-3 text-sm leading-7 text-slate-600">
              {activeReport.geographyInsight}
            </p>
          </SummaryCard>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
          <SummaryCard label="Chapter Movement">
            <BulletList items={activeReport.chapterMovement} ordered />
          </SummaryCard>
          <SummaryCard label="Meaning">
            <p className="text-sm leading-7 text-slate-700">{activeReport.meaning}</p>
            <div className="mt-5">
              <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">
                Key Themes
              </div>
              <div className="mt-3">
                <PillList items={activeReport.keyThemes} />
              </div>
            </div>
          </SummaryCard>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <SummaryCard label="Translation Insights">
            <div className="space-y-3">
              {activeReport.translationInsights.map((item, index) => (
                <div
                  key={`${item.verseRange}-${index}`}
                  className="rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-4"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-950">
                      {item.verseRange}
                    </span>
                    <span className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                      {item.versions.join(" / ")}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-7 text-slate-700">
                    {item.observation}
                  </p>
                  <p className="mt-2 text-sm leading-7 text-slate-600">
                    {item.significance}
                  </p>
                </div>
              ))}
            </div>
          </SummaryCard>

          <SummaryCard label="Cross References">
            <CrossReferenceCards items={activeReport.crossReferences} />
          </SummaryCard>
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <SummaryCard label="Lived Response">
            <BulletList items={activeReport.livedResponse} ordered />
          </SummaryCard>
          <SummaryCard label="Cautions">
            <BulletList items={activeReport.cautions} />
          </SummaryCard>
        </div>
      </section>
    </div>
  );
}

function ContextPack({ study }: { study: ActiveStudy }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <SummaryCard label="Book Summary">
          <p className="text-sm leading-7 text-slate-700">
            {study.context.parsedReference.book.summary}
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Genre
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-900">
                {study.context.parsedReference.book.genre}
              </div>
            </div>
            <div className="rounded-2xl bg-slate-50 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                Composition Window
              </div>
              <div className="mt-2 text-sm font-semibold text-slate-900">
                {study.context.parsedReference.book.compositionWindow}
              </div>
            </div>
          </div>
        </SummaryCard>

        <SummaryCard label="Setting">
          <p className="text-sm leading-7 text-slate-700">
            {study.context.parsedReference.book.setting}
          </p>
        </SummaryCard>
      </div>

      <SummaryCard label="Adjacent Chapters">
        {study.context.relatedChapters.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {study.context.relatedChapters.map((chapter) => (
              <div
                key={chapter.reference}
                className="rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-slate-950">
                    {chapter.reference}
                  </div>
                  <span className="rounded-full bg-sky-100 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-900">
                    {chapter.relation}
                  </span>
                </div>
                <div className="mt-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                  {chapter.versionLabel}
                </div>
                <p className="mt-3 text-sm leading-7 text-slate-700">
                  {chapter.summary}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm leading-7 text-slate-700">
            No adjacent chapter context was available for this chapter.
          </p>
        )}
      </SummaryCard>

      <SummaryCard label="Geography">
        {study.context.geography.length ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {study.context.geography.map((place) => (
              <div
                key={place.name}
                className="overflow-hidden rounded-[1.4rem] border border-slate-200 bg-slate-50"
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
                  <div className="text-sm font-semibold text-slate-950">
                    {place.name}
                  </div>
                  <div className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                    {place.type}
                  </div>
                  <p className="mt-3 text-sm leading-7 text-slate-700">
                    {place.summary}
                  </p>
                  {place.photoMatch ? (
                    <p className="mt-3 text-xs leading-6 text-slate-500">
                      Photo match: {place.photoMatch.caption}
                    </p>
                  ) : null}
                  {place.coordinates ? (
                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                      {place.coordinates}
                    </p>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm leading-7 text-slate-700">
            No explicit place matches were found for this chapter in the OpenBible geography dataset.
          </p>
        )}
      </SummaryCard>
    </div>
  );
}

function SourcesView({ study }: { study: ActiveStudy }) {
  return (
    <div className="space-y-6">
      <SummaryCard label="Source Catalog">
        <div className="grid gap-3 lg:grid-cols-2">
          {study.context.sourceCatalog.map((source) => (
            <a
              key={source.label}
              href={source.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-4 transition hover:border-sky-300 hover:bg-sky-50/60"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-950">
                    {source.label}
                  </div>
                  <div className="mt-2 text-sm leading-7 text-slate-700">
                    {source.note}
                  </div>
                </div>
                <span
                  className={cn(
                    "rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] ring-1",
                    source.status === "active" &&
                      "bg-emerald-100 text-emerald-900 ring-emerald-300",
                    source.status === "fallback" &&
                      "bg-amber-100 text-amber-900 ring-amber-300",
                    source.status === "inactive" &&
                      "bg-slate-100 text-slate-700 ring-slate-300",
                  )}
                >
                  {source.status}
                </span>
              </div>
            </a>
          ))}
        </div>
      </SummaryCard>

      <SummaryCard label="Diagnostics">
        <BulletList
          items={study.warnings.length ? study.warnings : study.context.sourceDiagnostics}
        />
      </SummaryCard>
    </div>
  );
}

function EmptyState() {
  return (
    <section className="rounded-[2rem] border border-dashed border-sky-200 bg-white/85 px-6 py-10 shadow-[0_20px_80px_rgba(15,23,42,0.06)]">
      <SectionTitle
        eyebrow="Ready To Study"
        title="Choose a New Testament book and chapter to open a study workspace."
        body="The app will compare five translations, include adjacent chapter context, geographic matches, four model analyses, one final synthesis, and saved passage questions."
      />

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {[
          {
            label: "Launch",
            body: "Pick a New Testament chapter and optionally add a focus question before the agents begin.",
          },
          {
            label: "Watch",
            body: "The live console streams context preparation, each analyst run, and the final synthesis stage.",
          },
          {
            label: "Study",
            body: "Read one translation at a time, highlight a section, and save focused GPT-5.4 questions for future review.",
          },
        ].map((card) => (
          <SummaryCard key={card.label} label={card.label}>
            <p className="text-sm leading-7 text-slate-700">{card.body}</p>
          </SummaryCard>
        ))}
      </div>
    </section>
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
  const [history, setHistory] = useState<StudyRunSummary[]>(initialHistory);
  const [currentStudy, setCurrentStudy] = useState<ActiveStudy | null>(initialStudy);
  const [passageQuestions, setPassageQuestions] =
    useState<PersistedPassageQuestion[]>(initialPassageQuestions);
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
  const [narrationAutoplayToken, setNarrationAutoplayToken] = useState<string | null>(
    initialStudy ? getNarrationAutoplayToken(initialStudy) : null,
  );
  const initialReference = parseReferenceFromStudy(initialStudy);
  const [bookQuery, setBookQuery] = useState(initialReference.bookName);
  const [chapterValue, setChapterValue] = useState(initialReference.chapter);
  const [focusQuestion, setFocusQuestion] = useState(initialReference.focusQuestion);
  const [selectionPrompt, setSelectionPrompt] =
    useState<SelectionPromptState | null>(null);

  const normalizedBookQuery = bookQuery.trim().toLowerCase();
  const selectedBook =
    books.find((book) => book.name.toLowerCase() === normalizedBookQuery) ?? null;
  const currentVersion =
    currentStudy?.context.versions.find((version) => version.versionId === selectedVersionId) ??
    currentStudy?.context.versions[0] ??
    null;
  const selectedQuestionId = passageQuestions[0]?.id ?? null;
  const bookSuggestions = useMemo(() => {
    if (!normalizedBookQuery) {
      return books.slice(0, 8);
    }

    return books
      .filter((book) => book.name.toLowerCase().includes(normalizedBookQuery))
      .slice(0, 8);
  }, [normalizedBookQuery]);
  const chapterSuggestions = useMemo(() => {
    if (!selectedBook) {
      return [];
    }

    return Array.from({ length: selectedBook.chapterCount }, (_, index) =>
      String(index + 1),
    );
  }, [selectedBook]);
  const historyItems = useMemo<AnimatedListItem[]>(
    () =>
      history.map((study) => ({
        id: study.id,
        content: (
          <Link href={`/studies/${study.slug}`} className="block">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-slate-950">
                  {study.reference}
                </div>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ring-1",
                    confidenceTone(study.confidence),
                  )}
                >
                  {study.confidence}
                </span>
              </div>
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                {formatTimestamp(study.createdAt)}
              </div>
              <p className="line-clamp-3 text-sm leading-6 text-slate-700">
                {study.finalThesis}
              </p>
            </div>
          </Link>
        ),
      })),
    [history],
  );

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
      setSelectedVersionId(study.context.versions[0]?.versionId ?? DEFAULT_VERSION_IDS[0]);
      setActiveView("summary");
      setCopyState("idle");
      setQuestionError(null);
      setError(null);

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

    const nextBook =
      books.find((book) => book.name.toLowerCase() === normalizedBookQuery) ?? null;

    if (!nextBook) {
      setError("Choose a valid New Testament book from the suggestions.");
      return;
    }

    const chapter = Number(chapterValue);

    if (!Number.isInteger(chapter) || chapter <= 0 || chapter > nextBook.chapterCount) {
      setError(
        `Choose a chapter between 1 and ${nextBook.chapterCount} for ${nextBook.name}.`,
      );
      return;
    }

    setIsSubmitting(true);
    setIsStreaming(true);
    setConsoleLogs([]);
    setRunStatuses(createDefaultRunStatuses());
    setNarrationAutoplayToken(null);

    try {
      const reference = `${nextBook.name} ${chapter}`;
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
    if (!currentStudy || !currentVersion || !hasSlug(currentStudy) || !selectionPrompt) {
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
          versionId: currentVersion.versionId,
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

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.18),transparent_24%),radial-gradient(circle_at_bottom_right,rgba(251,191,36,0.18),transparent_24%),linear-gradient(180deg,#f8fafc_0%,#eff6ff_46%,#f8fafc_100%)]">
      <div className="mx-auto grid min-h-screen max-w-[104rem] gap-6 px-4 py-6 lg:grid-cols-[22rem_minmax(0,1fr)] lg:px-6 lg:py-8">
        <aside className="space-y-6">
          <section className="rounded-[2rem] border border-sky-200/70 bg-white/85 p-6 shadow-[0_20px_70px_rgba(14,30,62,0.08)] backdrop-blur">
            <div className="inline-flex rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-900">
              New Testament Study Agents
            </div>
            <div className="mt-5 max-w-sm">
              <StaggeredText
                as="h1"
                text="Study a New Testament chapter with a live multi-agent workspace."
                className="font-display text-4xl leading-tight text-slate-950"
                delay={28}
                duration={0.45}
                segmentBy="words"
                blur={false}
              />
            </div>
            <p className="mt-4 text-sm leading-7 text-slate-700">
              Five translations, adjacent chapter context, live agent activity,
              saved passage questions, and slug-based study retrieval.
            </p>
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.08)]">
            <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
              Launch A Study
            </div>
            <form className="mt-5 space-y-5" onSubmit={onSubmit}>
              <div>
                <label className="text-sm font-semibold text-slate-800" htmlFor="book">
                  Book
                </label>
                <input
                  id="book"
                  list="book-suggestions"
                  value={bookQuery}
                  onChange={(event) => setBookQuery(event.target.value)}
                  placeholder="Start typing John, Romans, Matthew..."
                  className="mt-2 w-full rounded-[1.15rem] border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
                />
                <datalist id="book-suggestions">
                  {books.map((book) => (
                    <option key={book.osis} value={book.name} />
                  ))}
                </datalist>
                <div className="mt-3 flex flex-wrap gap-2">
                  {bookSuggestions.map((book) => (
                    <button
                      key={book.osis}
                      type="button"
                      onClick={() => {
                        setBookQuery(book.name);
                        setChapterValue("1");
                      }}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700 hover:border-sky-300 hover:text-sky-900"
                    >
                      {book.name}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-800" htmlFor="chapter">
                  Chapter
                </label>
                <input
                  id="chapter"
                  list="chapter-suggestions"
                  inputMode="numeric"
                  value={chapterValue}
                  onChange={(event) => setChapterValue(event.target.value)}
                  placeholder={selectedBook ? `1-${selectedBook.chapterCount}` : "Pick a book first"}
                  disabled={!selectedBook}
                  className="mt-2 w-full rounded-[1.15rem] border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400"
                />
                <datalist id="chapter-suggestions">
                  {chapterSuggestions.map((chapter) => (
                    <option key={chapter} value={chapter} />
                  ))}
                </datalist>
                {selectedBook ? (
                  <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                    {selectedBook.chapterCount} chapters available
                  </p>
                ) : null}
              </div>

              <div>
                <label className="text-sm font-semibold text-slate-800" htmlFor="focusQuestion">
                  Focus question
                </label>
                <textarea
                  id="focusQuestion"
                  value={focusQuestion}
                  onChange={(event) => setFocusQuestion(event.target.value)}
                  rows={4}
                  placeholder="Optional: What is this chapter teaching about discipleship, kingdom, suffering, witness..."
                  className="mt-2 w-full rounded-[1.15rem] border border-slate-200 bg-slate-50 px-4 py-3 text-base text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
                />
              </div>

              <div className="rounded-[1.3rem] bg-slate-950 px-4 py-4 text-slate-100">
                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-200/80">
                  Default Translation Stack
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {DEFAULT_VERSION_IDS.map((version) => (
                    <span
                      key={version}
                      className="rounded-full bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-100"
                    >
                      {version}
                    </span>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting || isStreaming}
                className="inline-flex w-full items-center justify-center rounded-[1.2rem] bg-sky-900 px-5 py-3 text-sm font-semibold uppercase tracking-[0.18em] text-white shadow-[0_18px_36px_rgba(8,47,73,0.25)] transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-400"
              >
                {isSubmitting || isStreaming ? "Running study..." : "Run study"}
              </button>
            </form>

            {error ? (
              <div className="mt-4 rounded-[1.2rem] border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-7 text-rose-900">
                {error}
              </div>
            ) : null}
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.08)]">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                Recent Studies
              </div>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
                {history.length}
              </span>
            </div>

            <div className="mt-5">
              {history.length ? (
                <AnimatedList
                  items={historyItems}
                  autoAddDelay={0}
                  animationType="slide"
                  enterFrom="top"
                  hoverEffect="scale"
                  fadeEdges={false}
                  className="!bg-transparent"
                  height="520px"
                />
              ) : (
                <div className="rounded-[1.4rem] border border-dashed border-slate-200 bg-slate-50 px-4 py-5 text-sm leading-7 text-slate-600">
                  Completed studies will appear here as soon as they’ve been saved.
                </div>
              )}
            </div>
          </section>
        </aside>

        <section className="space-y-6">
          {isStreaming ? (
            <TerminalConsole
              logs={consoleLogs}
              statuses={runStatuses}
              isStreaming={isStreaming}
            />
          ) : null}

          {currentStudy ? (
            <>
              <section className="rounded-[2rem] border border-slate-200 bg-white/85 p-6 shadow-[0_20px_80px_rgba(15,23,42,0.08)]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">
                      Active Study
                    </div>
                    <h1 className="font-display mt-3 text-5xl leading-tight text-slate-950">
                      {currentStudy.context.parsedReference.reference}
                    </h1>
                    <p className="mt-3 max-w-3xl text-sm leading-7 text-slate-700">
                      {currentStudy.request.focusQuestion
                        ? currentStudy.request.focusQuestion
                        : currentStudy.context.parsedReference.book.summary}
                    </p>
                  </div>
                  <div className="rounded-[1.4rem] border border-slate-200 bg-slate-50 px-4 py-4">
                    <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Study Meta
                    </div>
                    <div className="mt-3 space-y-2 text-sm text-slate-700">
                      {hasSlug(currentStudy) ? (
                        <div>
                          <span className="font-semibold text-slate-900">ID:</span>{" "}
                          {currentStudy.id.slice(0, 8)}
                        </div>
                      ) : null}
                      <div>
                        <span className="font-semibold text-slate-900">Generated:</span>{" "}
                        {formatTimestamp(currentStudy.generatedAt)}
                      </div>
                      <div>
                        <span className="font-semibold text-slate-900">Versions:</span>{" "}
                        {currentStudy.context.versions
                          .map((version) => version.versionId)
                          .join(", ")}
                      </div>
                      {copyState === "copied" ? (
                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                          Link copied
                        </div>
                      ) : null}
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-3">
                  {viewOptions.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setActiveView(option.key)}
                      className={cn(
                        "rounded-full px-4 py-2 text-sm font-semibold transition",
                        activeView === option.key
                          ? "bg-slate-950 text-white shadow-[0_14px_30px_rgba(15,23,42,0.18)]"
                          : "border border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:text-sky-800",
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </section>

              {activeView === "summary" ? (
                <FinalSummaryView
                  study={currentStudy}
                  onCopyLink={onCopyLink}
                  narrationAutoplayToken={narrationAutoplayToken}
                  onNarrationAutoplayHandled={() => setNarrationAutoplayToken(null)}
                />
              ) : null}

              {activeView === "analysts" ? (
                <AnalystView
                  study={currentStudy}
                  selectedReportId={selectedReportId}
                  onSelectReport={setSelectedReportId}
                />
              ) : null}

              {activeView === "reader" ? (
                <div className="space-y-6">
                  <SectionTitle
                    eyebrow="Chapter Reader"
                    title="Read one translation at a time and ask targeted questions."
                    body="Highlight any portion of the displayed chapter to open a focused GPT-5.4 question box. Each answer is stored with the study for later review."
                  />

                  <section className="rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-[0_20px_70px_rgba(15,23,42,0.08)]">
                    <div className="flex flex-wrap items-center gap-3">
                      {currentStudy.context.versions.map((version) => (
                        <button
                          key={version.versionId}
                          type="button"
                          onClick={() => {
                            setSelectedVersionId(version.versionId);
                            setSelectionPrompt(null);
                            setQuestionError(null);
                          }}
                          className={cn(
                            "rounded-full px-4 py-2 text-sm font-semibold transition",
                            currentVersion?.versionId === version.versionId
                              ? "bg-sky-900 text-white shadow-[0_12px_32px_rgba(8,47,73,0.22)]"
                              : "border border-slate-200 bg-white text-slate-700 hover:border-sky-300 hover:text-sky-800",
                          )}
                        >
                          {version.versionId}
                        </button>
                      ))}
                    </div>

                    {currentVersion ? (
                      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_22rem]">
                        <div className="relative">
                          <div className="rounded-[1.4rem] bg-slate-950 px-5 py-4 text-slate-100">
                            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-200/80">
                              {currentVersion.versionId}
                            </div>
                            <div className="mt-2 text-2xl font-semibold">
                              {currentVersion.versionLabel}
                            </div>
                            <p className="mt-2 text-sm leading-7 text-slate-300">
                              {currentVersion.description}
                            </p>
                          </div>

                          <div
                            ref={readerRef}
                            onMouseUp={onReaderMouseUp}
                            className="relative mt-4 max-h-[46rem] overflow-y-auto rounded-[1.6rem] border border-slate-200 bg-white px-6 py-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.8)]"
                          >
                            <div className="space-y-5">
                              {currentVersion.verses.map((verse, index) => (
                                <p
                                  key={`${currentVersion.versionId}-${verse.verse}-${index}`}
                                  className="text-lg leading-9 text-slate-800"
                                >
                                  <span className="mr-3 align-top text-sm font-semibold uppercase tracking-[0.16em] text-sky-800">
                                    {verse.verse}
                                  </span>
                                  {verse.text}
                                </p>
                              ))}
                            </div>

	                            {selectionPrompt ? (
	                              <div
	                                onMouseUp={(event) => event.stopPropagation()}
	                                className="absolute z-20 w-[20rem] rounded-[1.25rem] border border-slate-200 bg-white p-4 shadow-[0_20px_50px_rgba(15,23,42,0.16)]"
	                                style={{
	                                  top: selectionPrompt.top,
                                  left: selectionPrompt.left,
                                }}
                              >
                                <div className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                                  Selected Text
                                </div>
                                <p className="mt-2 line-clamp-4 text-sm leading-7 text-slate-700">
                                  {selectionPrompt.text}
                                </p>
                                <label className="mt-4 block text-sm font-semibold text-slate-800">
                                  Ask about this section
                                </label>
                                <textarea
                                  value={selectionPrompt.question}
                                  onChange={(event) =>
                                    setSelectionPrompt((previous) =>
                                      previous
                                        ? { ...previous, question: event.target.value }
                                        : previous,
                                    )
                                  }
                                  rows={4}
                                  placeholder="What does this section mean in context?"
                                  className="mt-2 w-full rounded-[1rem] border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-400 focus:bg-white"
                                />
                                {questionError ? (
                                  <div className="mt-3 text-sm text-rose-700">
                                    {questionError}
                                  </div>
                                ) : null}
                                <div className="mt-4 flex gap-2">
                                  <button
                                    type="button"
                                    onClick={submitPassageQuestion}
                                    disabled={isAskingQuestion}
                                    className="rounded-full bg-sky-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-sky-800 disabled:cursor-not-allowed disabled:bg-slate-400"
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
                                    className="rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : null}
                          </div>
                        </div>

                        <div className="space-y-4">
                          <SummaryCard label="Reader Meta">
                            <div className="space-y-2 text-sm text-slate-700">
                              <div>
                                <span className="font-semibold text-slate-900">Attribution:</span>{" "}
                                {currentVersion.attribution}
                              </div>
                              <div>
                                <span className="font-semibold text-slate-900">Verses:</span>{" "}
                                {currentVersion.verses.length}
                              </div>
                              <div>
                                <span className="font-semibold text-slate-900">Source:</span>{" "}
                                <a
                                  href={currentVersion.sourceUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-sky-800 underline decoration-sky-300 underline-offset-4"
                                >
                                  Open source page
                                </a>
                              </div>
                            </div>
                          </SummaryCard>

                          <SummaryCard label="Saved Passage Questions">
                            {passageQuestions.length ? (
                              <div className="space-y-3">
                                {passageQuestions.map((entry) => (
                                  <div
                                    key={entry.id}
                                    className={cn(
                                      "rounded-[1.3rem] border px-4 py-4",
                                      selectedQuestionId === entry.id
                                        ? "border-sky-300 bg-sky-50/70"
                                        : "border-slate-200 bg-slate-50",
                                    )}
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                        {entry.versionId}
                                      </div>
                                      <span
                                        className={cn(
                                          "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ring-1",
                                          confidenceTone(entry.confidence),
                                        )}
                                      >
                                        {entry.confidence}
                                      </span>
                                    </div>
                                    <p className="mt-2 text-sm font-medium text-slate-900">
                                      “{entry.selectionText}”
                                    </p>
                                    <p className="mt-2 text-sm leading-7 text-slate-700">
                                      <span className="font-semibold text-slate-900">
                                        Q:
                                      </span>{" "}
                                      {entry.question}
                                    </p>
                                    <p className="mt-2 text-sm leading-7 text-slate-700">
                                      <span className="font-semibold text-slate-900">
                                        A:
                                      </span>{" "}
                                      {entry.answer}
                                    </p>
                                    <p className="mt-2 text-xs leading-6 text-slate-500">
                                      {entry.surroundingContext}
                                    </p>
                                    <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                                      {formatTimestamp(entry.createdAt)}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-sm leading-7 text-slate-700">
                                Highlight text in the reader to save focused passage questions for this study.
                              </p>
                            )}
                          </SummaryCard>
                        </div>
                      </div>
                    ) : null}
                  </section>
                </div>
              ) : null}

              {activeView === "context" ? (
                <div className="space-y-6">
                  <SectionTitle
                    eyebrow="Context Pack"
                    title="Historical, geographic, and adjacent chapter frame"
                    body="This bundle feeds the analysts so the chapter is studied as a full literary unit inside its immediate New Testament context."
                  />
                  <ContextPack study={currentStudy} />
                </div>
              ) : null}

              {activeView === "sources" ? (
                <div className="space-y-6">
                  <SectionTitle
                    eyebrow="Sources"
                    title="Inspect providers and runtime notes"
                    body="This view surfaces which providers served the text, what fallbacks were used, and which runtime warnings were generated."
                  />
                  <SourcesView study={currentStudy} />
                </div>
              ) : null}
            </>
          ) : (
            <EmptyState />
          )}
        </section>
      </div>
    </main>
  );
}
