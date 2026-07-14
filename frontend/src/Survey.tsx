import { useEffect, useState } from 'react'
import { getInitialTheme, applyTheme, type Theme } from './theme'
import ThemeToggle from './ThemeToggle'

// Mirrors GainsCart_User_Survey.docx (the ethics-approved instrument used
// for the COMP902 research write-up's human evaluation) -- keys here match
// backend/src/models/SurveyResponse.ts field-for-field. Reproduced
// faithfully rather than condensed, since the report's analysis depends on
// this exact instrument.

const AGE_GROUPS = ['18-24', '25-34', '35-44', '45-54', '55+']
const FITNESS_RELATIONSHIPS = [
  'Competitive bodybuilder',
  'Recreational lifter/gym-goer',
  'General fitness interest',
  'Other',
]
const TRACKING_FREQUENCIES = ['Daily', 'A few times a week', 'Rarely', 'Never']
const NUTRITION_APP_USAGE = ['Yes, regularly', 'Yes, tried it once or twice', 'No']

const LIKERT_LABELS = ['Strongly Disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree']

interface LikertQuestionDef {
  key: string
  statement: string
}

const H1_QUESTIONS: LikertQuestionDef[] = [
  { key: 'proteinValue', statement: 'The app helped me identify grocery items with good protein value for the price.' },
  { key: 'easyToCompare', statement: 'The protein-per-dollar figures shown made it easy to compare items.' },
  { key: 'noticedNewItems', statement: 'I noticed items in the results I would not have otherwise considered as good protein sources.' },
  { key: 'trustNutritionInfo', statement: 'I trust the nutrition information shown for most items in my results.' },
  { key: 'matchedEstimatedClear', statement: 'The distinction between "Matched" (verified) and "Estimated" nutrition data was clear to me.' },
]

const H2_QUESTIONS: LikertQuestionDef[] = [
  { key: 'satisfiedOverall', statement: 'Overall, I am satisfied with the recommendations the app gave me.' },
  { key: 'easyWithoutInstructions', statement: 'The app was easy to use without any instructions.' },
  { key: 'explanationsAddedValue', statement: 'The "Why this pick?" and basket summary explanations added value to my experience.' },
  { key: 'wouldUseAgain', statement: 'I would use this app again if I were grocery shopping on a budget.' },
  { key: 'wouldRecommend', statement: 'I would recommend this app to another gym-goer or bodybuilder.' },
]

const H3_QUESTIONS: LikertQuestionDef[] = [
  { key: 'fasterThanManual', statement: 'Using this app was faster than manually comparing protein and price across products myself.' },
  { key: 'usableListQuickly', statement: 'I was able to get a usable grocery list within a minute or two of setting my budget.' },
  { key: 'compareStoresQuick', statement: 'Comparing stores/prices for a specific item (via "Compare stores") was quick and clear.' },
  { key: 'dietaryFilterAsExpected', statement: 'Filtering by dietary preference (if you used it) worked the way I expected.' },
  { key: 'noNeedToLeaveApp', statement: 'I did not need to leave the app to verify prices or nutrition elsewhere.' },
]

const SUS_QUESTIONS: LikertQuestionDef[] = [
  { key: 'unnecessarilyComplex', statement: 'I found the app unnecessarily complex.' },
  { key: 'wouldNeedSupport', statement: 'I think I would need technical support to use this app.' },
  { key: 'wellIntegrated', statement: 'I found the various functions in this app well integrated.' },
  { key: 'learnQuickly', statement: 'I imagine most people would learn to use this app very quickly.' },
]

type LikertAnswers = Record<string, number | null>

function emptyLikertAnswers(questions: LikertQuestionDef[]): LikertAnswers {
  return Object.fromEntries(questions.map((q) => [q.key, null]))
}

export default function SurveyPage() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [consent, setConsent] = useState(false)
  const [ageGroup, setAgeGroup] = useState('')
  const [fitnessRelationship, setFitnessRelationship] = useState('')
  const [fitnessRelationshipOther, setFitnessRelationshipOther] = useState('')
  const [trackingFrequency, setTrackingFrequency] = useState('')
  const [usedNutritionApp, setUsedNutritionApp] = useState('')
  const [h1, setH1] = useState<LikertAnswers>(() => emptyLikertAnswers(H1_QUESTIONS))
  const [h2, setH2] = useState<LikertAnswers>(() => emptyLikertAnswers(H2_QUESTIONS))
  const [h3, setH3] = useState<LikertAnswers>(() => emptyLikertAnswers(H3_QUESTIONS))
  const [sus, setSus] = useState<LikertAnswers>(() => emptyLikertAnswers(SUS_QUESTIONS))
  const [likedMost, setLikedMost] = useState('')
  const [confusing, setConfusing] = useState('')
  const [wrongOrSurprising, setWrongOrSurprising] = useState('')
  const [wouldChange, setWouldChange] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  function allLikertAnswered(answers: LikertAnswers) {
    return Object.values(answers).every((v) => v != null)
  }

  const canSubmit =
    consent &&
    ageGroup &&
    fitnessRelationship &&
    (fitnessRelationship !== 'Other' || fitnessRelationshipOther.trim()) &&
    trackingFrequency &&
    usedNutritionApp &&
    allLikertAnswered(h1) &&
    allLikertAnswered(h2) &&
    allLikertAnswered(h3) &&
    allLikertAnswered(sus)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!canSubmit || submitting) return

    setSubmitting(true)
    setError(null)

    try {
      const res = await fetch('/api/survey', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          demographics: { ageGroup, fitnessRelationship, fitnessRelationshipOther, trackingFrequency, usedNutritionApp },
          h1,
          h2,
          h3,
          sus,
          openEnded: { likedMost, confusing, wrongOrSurprising, wouldChange },
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error || `Request failed (${res.status})`)
      }
      setSubmitted(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err: any) {
      setError(err.message || 'Something went wrong submitting the survey.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="flex items-center justify-between border-b border-border px-6 py-4">
        <a href="/" className="text-xl font-semibold tracking-tight">
          Gains<span className="text-accent-500">Cart</span>
        </a>
        <ThemeToggle theme={theme} onToggle={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))} />
      </header>

      <main className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-16">
        <p className="text-sm font-medium uppercase tracking-wide text-accent-400">Research survey</p>
        <h1 className="text-3xl font-bold tracking-tight text-balance sm:text-4xl">
          GainsCart User Evaluation Survey
        </h1>

        {submitted ? (
          <div className="mt-6 flex flex-col gap-4 rounded-lg border border-border bg-surface px-8 py-10 text-base text-muted">
            <p className="text-xl font-semibold text-foreground">Thank you for your time!</p>
            <p className="leading-relaxed">
              Your response has been recorded anonymously. If you would like a summary of the
              findings once the research is complete, please contact the researcher using the
              details in the Participant Information Sheet.
            </p>
            <a
              href="/"
              className="mt-2 self-start rounded-md bg-accent-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-500"
            >
              Back to GainsCart
            </a>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 flex flex-col gap-16">
            <div className="flex flex-col gap-6">
              <p className="text-base leading-relaxed text-muted">
                This research survey (COMP902 Applied Research Project, Aeriel Matthew Cruz) asks
                about your experience using GainsCart. It should take about 10-15 minutes. Your
                responses are anonymous -- please don't include your name anywhere in this form.
                Before continuing, make sure you've entered a budget, reviewed the ranked list,
                and tried at least one of the "Why this pick?" or "Compare stores" features.
              </p>

              <label className="flex items-start gap-3 rounded-lg border border-accent-900 bg-accent-900/10 px-5 py-4">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-1 h-4 w-4 shrink-0 accent-accent-500"
                  required
                />
                <span className="text-base leading-relaxed">
                  I have read the Participant Information Sheet and Consent Form and agree to take
                  part in this research, understanding that participation is voluntary and
                  anonymous.
                </span>
              </label>
            </div>

            <Section title="Section A" heading="About You">
              <p className="-mt-2 mb-2 text-sm text-muted">
                These questions are for grouping responses only and cannot identify you.
              </p>

              <ChoiceQuestion label="Age group" options={AGE_GROUPS} value={ageGroup} onChange={setAgeGroup} />

              <ChoiceQuestion
                label="How would you describe your relationship to fitness/bodybuilding?"
                options={FITNESS_RELATIONSHIPS}
                value={fitnessRelationship}
                onChange={setFitnessRelationship}
              />
              {fitnessRelationship === 'Other' && (
                <input
                  type="text"
                  placeholder="Please specify"
                  value={fitnessRelationshipOther}
                  onChange={(e) => setFitnessRelationshipOther(e.target.value)}
                  className="rounded-md border border-border bg-surface px-4 py-2.5 text-foreground outline-none focus:border-accent-500"
                />
              )}

              <ChoiceQuestion
                label="How often do you currently track or plan what you eat?"
                options={TRACKING_FREQUENCIES}
                value={trackingFrequency}
                onChange={setTrackingFrequency}
              />

              <ChoiceQuestion
                label="Have you used a nutrition-tracking app before (e.g. MyFitnessPal, Cronometer)?"
                options={NUTRITION_APP_USAGE}
                value={usedNutritionApp}
                onChange={setUsedNutritionApp}
              />
            </Section>

            <Section
              title="Section B"
              heading="Cost-Effective Protein Identification"
              hint="H1 -- GainsCart positively influences users' ability to identify cost-effective protein sources."
            >
              <LikertQuestions questions={H1_QUESTIONS} answers={h1} onChange={setH1} />
            </Section>

            <Section title="Section C" heading="User Satisfaction" hint="H2 -- GainsCart positively influences user satisfaction.">
              <LikertQuestions questions={H2_QUESTIONS} answers={h2} onChange={setH2} />
            </Section>

            <Section
              title="Section D"
              heading="Efficiency of Comparing Protein Products"
              hint="H3 -- GainsCart positively influences users' efficiency in comparing protein products."
            >
              <LikertQuestions questions={H3_QUESTIONS} answers={h3} onChange={setH3} />
            </Section>

            <Section title="Section E" heading="Open-Ended Feedback">
              <OpenTextQuestion label="What did you like most about GainsCart?" value={likedMost} onChange={setLikedMost} />
              <OpenTextQuestion
                label="What, if anything, was confusing or frustrating?"
                value={confusing}
                onChange={setConfusing}
              />
              <OpenTextQuestion
                label="Did any recommended item seem wrong, inaccurate, or surprising (e.g. wrong nutrition, odd ranking)? Please describe."
                value={wrongOrSurprising}
                onChange={setWrongOrSurprising}
              />
              <OpenTextQuestion
                label="What would you add or change to make this more useful for your own grocery shopping?"
                value={wouldChange}
                onChange={setWouldChange}
              />
            </Section>

            <Section
              title="Section F"
              heading="Overall Usability"
              hint="Adapted from the System Usability Scale (Brooke, 1996) -- items are reverse/positively worded on purpose, which is standard practice for that instrument."
            >
              <LikertQuestions questions={SUS_QUESTIONS} answers={sus} onChange={setSus} />
            </Section>

            {error && (
              <div className="rounded-md border border-accent-900 bg-surface px-5 py-4 text-base text-accent-300">
                {error}
              </div>
            )}

            <div className="flex flex-col gap-3 border-t border-border pt-8">
              <button
                type="submit"
                disabled={!canSubmit || submitting}
                className="self-start rounded-md bg-accent-600 px-6 py-3 text-base font-medium text-white transition-colors hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? 'Submitting…' : 'Submit survey'}
              </button>
              {!canSubmit && (
                <p className="text-sm text-muted">
                  Please give consent and answer every question above (open-ended feedback is
                  optional) before submitting.
                </p>
              )}
            </div>
          </form>
        )}
      </main>
    </div>
  )
}

function Section({
  title,
  heading,
  hint,
  children,
}: {
  title: string
  heading: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <fieldset className="flex flex-col gap-6">
      <legend className="flex w-full flex-col gap-1 border-b border-border pb-4">
        <span className="text-sm font-medium uppercase tracking-wide text-accent-400">{title}</span>
        <span className="text-xl font-semibold text-foreground">{heading}</span>
        {hint && <span className="text-sm font-normal text-muted">{hint}</span>}
      </legend>
      <div className="flex flex-col gap-5">{children}</div>
    </fieldset>
  )
}

function ChoiceQuestion({
  label,
  options,
  value,
  onChange,
}: {
  label: string
  options: string[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex flex-col gap-2.5">
      <span className="text-base">{label}</span>
      <div className="flex flex-wrap gap-2.5">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`rounded-full border px-4 py-2 text-sm transition-colors ${
              value === opt
                ? 'border-accent-500 bg-accent-900 text-accent-300'
                : 'border-border text-muted hover:border-accent-500 hover:text-foreground'
            }`}
          >
            {opt}
          </button>
        ))}
      </div>
    </label>
  )
}

function OpenTextQuestion({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex flex-col gap-2.5">
      <span className="text-base">{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        maxLength={2000}
        className="resize-y rounded-md border border-border bg-surface px-4 py-3 text-foreground outline-none focus:border-accent-500"
      />
    </label>
  )
}

function LikertQuestions({
  questions,
  answers,
  onChange,
}: {
  questions: LikertQuestionDef[]
  answers: LikertAnswers
  onChange: (next: LikertAnswers) => void
}) {
  return (
    <>
      {questions.map((q) => (
        <LikertRow
          key={q.key}
          statement={q.statement}
          value={answers[q.key]}
          onChange={(v) => onChange({ ...answers, [q.key]: v })}
        />
      ))}
    </>
  )
}

function LikertRow({
  statement,
  value,
  onChange,
}: {
  statement: string
  value: number | null
  onChange: (v: number) => void
}) {
  return (
    <div className="rounded-lg border border-border bg-surface px-5 py-5 sm:px-7 sm:py-6">
      <p className="mb-5 text-base leading-relaxed text-foreground">{statement}</p>
      <div className="grid grid-cols-5 gap-1.5 sm:gap-3">
        {LIKERT_LABELS.map((label, i) => {
          const optionValue = i + 1
          const active = value === optionValue
          return (
            <button
              key={label}
              type="button"
              onClick={() => onChange(optionValue)}
              className={`flex flex-col items-center gap-2 rounded-md border px-1 py-3 text-center transition-colors sm:px-2 ${
                active
                  ? 'border-accent-500 bg-accent-900'
                  : 'border-border hover:border-accent-500'
              }`}
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold transition-colors ${
                  active ? 'border-accent-400 bg-accent-500 text-white' : 'border-border text-muted'
                }`}
              >
                {optionValue}
              </span>
              <span className={`text-[11px] leading-tight ${active ? 'text-accent-300' : 'text-muted'}`}>
                {label}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
