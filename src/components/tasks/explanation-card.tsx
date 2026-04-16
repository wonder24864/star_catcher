"use client";

/**
 * ExplanationCard — renders a structured explanation in one of three formats:
 *   - static: full Markdown + KaTeX walkthrough (high school / formal)
 *   - interactive: step-by-step reveal with optional inline check questions
 *   - conversational: alternating-bubble Q&A dialogue
 *
 * Format is picked by the AI (per US-052 D16). This component dispatches.
 *
 * See: docs/user-stories/similar-questions-explanation.md (US-052)
 */

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useTierTranslations } from "@/hooks/use-tier-translations";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { AdaptiveCard } from "@/components/adaptive/adaptive-card";
import { AdaptiveButton } from "@/components/adaptive/adaptive-button";
import { AdaptiveProgress } from "@/components/adaptive/adaptive-progress";
import { useTier } from "@/components/providers/grade-tier-provider";

import type {
  ExplanationCard as ExplanationCardData,
  ExplanationStep,
} from "@/lib/domain/ai/harness/schemas/generate-explanation";

export interface ExplanationCardProps {
  card: ExplanationCardData;
  onComplete: () => void;
  completing?: boolean;
}

export function ExplanationCard({ card, onComplete, completing }: ExplanationCardProps) {
  switch (card.format) {
    case "static":
      return <StaticCard card={card} onComplete={onComplete} completing={completing} />;
    case "interactive":
      return (
        <InteractiveCard card={card} onComplete={onComplete} completing={completing} />
      );
    case "conversational":
      return (
        <ConversationalCard card={card} onComplete={onComplete} completing={completing} />
      );
    default:
      // schema validation should prevent this; render as static fallback
      return <StaticCard card={card} onComplete={onComplete} completing={completing} />;
  }
}

// ─── StaticCard ───────────────────────────────────────────────

function StaticCard({ card, onComplete, completing }: ExplanationCardProps) {
  const t = useTierTranslations("explanationCard");
  const { tierIndex } = useTier();
  const isWonder = tierIndex === 1;

  const body = useMemo(
    () => card.steps.map((s) => s.content).join("\n\n"),
    [card.steps],
  );

  return (
    <AdaptiveCard>
      <CardContent className="space-y-3 py-4">
        <Header title={card.title} format={card.format} />
        <div className={`prose prose-sm max-w-none dark:prose-invert ${isWonder ? "text-lg leading-relaxed" : ""}`}>
          <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
            {body}
          </ReactMarkdown>
        </div>
        <div className="flex justify-end">
          <AdaptiveButton onClick={onComplete} disabled={completing}>
            {t("done")}
          </AdaptiveButton>
        </div>
      </CardContent>
    </AdaptiveCard>
  );
}

// ─── InteractiveCard ──────────────────────────────────────────

function InteractiveCard({ card, onComplete, completing }: ExplanationCardProps) {
  const t = useTierTranslations("explanationCard");
  const { tierIndex } = useTier();
  const isWonder = tierIndex === 1;
  const [currentStep, setCurrentStep] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [feedback, setFeedback] = useState<Record<number, "correct" | "wrong">>({});

  const isLast = currentStep === card.steps.length - 1;
  const progressPct = card.steps.length > 0
    ? Math.round(((currentStep + 1) / card.steps.length) * 100)
    : 0;

  function checkAnswer(stepIndex: number, expected: string | undefined) {
    if (!expected) return;
    const given = (answers[stepIndex] ?? "").trim().toLowerCase();
    const wanted = expected.trim().toLowerCase();
    setFeedback((f) => ({
      ...f,
      [stepIndex]: given === wanted ? "correct" : "wrong",
    }));
  }

  function next() {
    if (isLast) {
      onComplete();
    } else {
      setCurrentStep((s) => s + 1);
    }
  }

  return (
    <AdaptiveCard>
      <CardContent className="space-y-4 py-4">
        <Header title={card.title} format={card.format} />
        <AdaptiveProgress value={progressPct} total={card.steps.length} />

        <div className="space-y-3">
          {card.steps.slice(0, currentStep + 1).map((s, i) => (
            <StepBlock
              key={i}
              step={s}
              index={i}
              isCurrent={i === currentStep}
              isWonder={isWonder}
              answer={answers[i] ?? ""}
              feedback={feedback[i]}
              onAnswerChange={(v) => setAnswers((a) => ({ ...a, [i]: v }))}
              onCheck={() => checkAnswer(i, s.expectedAnswer)}
              t={t}
            />
          ))}
        </div>

        <div className="flex justify-end">
          <AdaptiveButton onClick={next} disabled={completing}>
            {isLast ? t("done") : t("next")}
          </AdaptiveButton>
        </div>
      </CardContent>
    </AdaptiveCard>
  );
}

function StepBlock({
  step,
  index,
  isCurrent,
  isWonder,
  answer,
  feedback,
  onAnswerChange,
  onCheck,
  t,
}: {
  step: ExplanationStep;
  index: number;
  isCurrent: boolean;
  isWonder: boolean;
  answer: string;
  feedback: "correct" | "wrong" | undefined;
  onAnswerChange: (v: string) => void;
  onCheck: () => void;
  t: (key: string, values?: Record<string, unknown>) => string;
}) {
  return (
    <div className={isCurrent ? "" : "opacity-70"}>
      <div className={`prose prose-sm max-w-none dark:prose-invert ${isWonder ? "text-lg leading-relaxed" : ""}`}>
        <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
          {`**${t("stepLabel", { n: index + 1 })}.** ${step.content}`}
        </ReactMarkdown>
      </div>
      {step.question && (
        <div className="mt-2 space-y-2 rounded-md border border-dashed border-muted-foreground/30 p-3">
          <p className="text-sm font-medium">{step.question}</p>
          <div className="flex gap-2">
            <Input
              value={answer}
              onChange={(e) => onAnswerChange(e.target.value)}
              placeholder={t("yourAnswer")}
              disabled={!isCurrent || feedback === "correct"}
              className={isWonder ? "text-lg min-h-[48px]" : ""}
            />
            <AdaptiveButton
              variant="outline"
              size="sm"
              onClick={onCheck}
              disabled={!isCurrent || !answer.trim() || feedback === "correct"}
            >
              {t("check")}
            </AdaptiveButton>
          </div>
          {feedback === "correct" && (
            <Badge className="bg-green-100 text-green-800" variant="outline">
              {t("correct")}
            </Badge>
          )}
          {feedback === "wrong" && (
            <Badge className="bg-orange-100 text-orange-800" variant="outline">
              {t("tryAgain")}
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ConversationalCard ───────────────────────────────────────

function ConversationalCard({ card, onComplete, completing }: ExplanationCardProps) {
  const t = useTierTranslations("explanationCard");
  const [revealed, setRevealed] = useState(1);

  const isLast = revealed >= card.steps.length;

  return (
    <AdaptiveCard>
      <CardContent className="space-y-3 py-4">
        <Header title={card.title} format={card.format} />
        <div className="space-y-2">
          {card.steps.slice(0, revealed).map((s, i) => (
            <Bubble key={i} step={s} side={i % 2 === 0 ? "ai" : "user"} />
          ))}
        </div>
        <div className="flex justify-end">
          {isLast ? (
            <AdaptiveButton onClick={onComplete} disabled={completing}>
              {t("done")}
            </AdaptiveButton>
          ) : (
            <AdaptiveButton variant="outline" onClick={() => setRevealed((r) => r + 1)}>
              {t("nextTurn")}
            </AdaptiveButton>
          )}
        </div>
      </CardContent>
    </AdaptiveCard>
  );
}

function Bubble({ step, side }: { step: ExplanationStep; side: "ai" | "user" }) {
  const isAI = side === "ai";
  return (
    <div className={`flex ${isAI ? "justify-start" : "justify-end"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${
          isAI
            ? "bg-muted text-foreground"
            : "bg-primary text-primary-foreground"
        }`}
      >
        <div className="prose prose-sm max-w-none dark:prose-invert">
          <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
            {step.content}
          </ReactMarkdown>
        </div>
        {step.question && (
          <p className="mt-2 text-sm font-medium italic">{step.question}</p>
        )}
      </div>
    </div>
  );
}

// ─── Header ─────────────────────────────────────────────────

function Header({ title, format }: { title: string; format: string }) {
  const t = useTierTranslations("explanationCard");
  const FORMAT_BADGE: Record<string, string> = {
    static: "bg-slate-100 text-slate-800",
    interactive: "bg-blue-100 text-blue-800",
    conversational: "bg-purple-100 text-purple-800",
  };
  return (
    <div className="flex items-start justify-between gap-3">
      <h3 className="text-lg font-semibold">{title}</h3>
      <Badge variant="outline" className={FORMAT_BADGE[format] ?? ""}>
        {t(`formats.${format}`)}
      </Badge>
    </div>
  );
}
