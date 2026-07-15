import { useEffect, useState } from 'react'
import { getInitialTheme, applyTheme, type Theme } from './theme'
import ThemeToggle from './ThemeToggle'

// Mirrors GainsCart_User_Survey.docx (the ethics-approved instrument used
// for the COMP902 research write-up's human evaluation) -- keys here match
// backend/src/models/SurveyResponse.ts field-for-field. Reproduced
// faithfully rather than condensed, since the report's analysis depends on
// this exact instrument. Presented as a multi-step wizard (one section per
// screen, progress bar, Back/Next) rather than one long scroll -- UX
// pattern borrowed from a fellow COMP902 student's survey instrument
// (MāketeTrail NZ), not a change to the instrument's content/wording.

interface ChoiceOption {
  value: string
  label: string
}

// value = what's actually stored (backend/src/routes/survey.ts validates
// against these, backend/src/models/SurveyResponse.ts enums list them) --
// label = display text only, so rewording a label later can't silently
// change what a past submission means. Same key/statement split already
// used for LikertQuestionDef below.
const AGE_GROUPS: ChoiceOption[] = [
  { value: '18_24', label: '18-24' },
  { value: '25_34', label: '25-34' },
  { value: '35_44', label: '35-44' },
  { value: '45_54', label: '45-54' },
  { value: '55_plus', label: '55+' },
]
const FITNESS_RELATIONSHIPS: ChoiceOption[] = [
  { value: 'competitive_bodybuilder', label: 'Competitive bodybuilder' },
  { value: 'recreational_lifter', label: 'Recreational lifter/gym-goer' },
  { value: 'general_fitness', label: 'General fitness interest' },
  { value: 'other', label: 'Other' },
]
const TRACKING_FREQUENCIES: ChoiceOption[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'few_times_week', label: 'A few times a week' },
  { value: 'rarely', label: 'Rarely' },
  { value: 'never', label: 'Never' },
]
const NUTRITION_APP_USAGE: ChoiceOption[] = [
  { value: 'yes_regularly', label: 'Yes, regularly' },
  { value: 'yes_tried_once', label: 'Yes, tried it once or twice' },
  { value: 'no', label: 'No' },
]

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

// Added after the original ethics-approved instrument (GainsCart_User_Survey.docx)
// was written, covering features shipped since then -- kept as its own group
// rather than folded into H1/H2/H3 so it doesn't disturb that hypothesis scoring.
const NF_QUESTIONS: LikertQuestionDef[] = [
  { key: 'storeMapHelpful', statement: 'The "Store location" map made it easy to know where to find a store.' },
  { key: 'themeToggleHelpful', statement: 'Being able to switch between light and dark mode improved my experience using the app.' },
]

type LikertAnswers = Record<string, number | null>

function emptyLikertAnswers(questions: LikertQuestionDef[]): LikertAnswers {
  return Object.fromEntries(questions.map((q) => [q.key, null]))
}

// display-only heading font, loaded in index.css -- scoped to this page via
// this class rather than a global Tailwind theme token, since the main
// app's dark gym-app aesthetic (CLAUDE.md) keeps its existing sans-serif.
const HEADING_FONT = "font-['Fraunces',_serif]"

export default function SurveyPage() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)
  const [step, setStep] = useState(0)
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
  const [nf, setNf] = useState<LikertAnswers>(() => emptyLikertAnswers(NF_QUESTIONS))
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

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [step])

  function allLikertAnswered(answers: LikertAnswers) {
    return Object.values(answers).every((v) => v != null)
  }

  const aboutYouComplete = Boolean(
    ageGroup &&
      fitnessRelationship &&
      (fitnessRelationship !== 'other' || fitnessRelationshipOther.trim()) &&
      trackingFrequency &&
      usedNutritionApp
  )

  const STEPS = [
    { title: 'Consent', heading: 'Participant Information and Consent', complete: consent },
    { title: 'Section A', heading: 'About You', complete: aboutYouComplete },
    {
      title: 'Section B',
      heading: 'Cost-Effective Protein Identification',
      hint: "H1 -- GainsCart positively influences users' ability to identify cost-effective protein sources.",
      complete: allLikertAnswered(h1),
    },
    {
      title: 'Section C',
      heading: 'User Satisfaction',
      hint: 'H2 -- GainsCart positively influences user satisfaction.',
      complete: allLikertAnswered(h2),
    },
    {
      title: 'Section D',
      heading: 'Efficiency of Comparing Protein Products',
      hint: "H3 -- GainsCart positively influences users' efficiency in comparing protein products.",
      complete: allLikertAnswered(h3),
    },
    { title: 'Section E', heading: 'Open-Ended Feedback', complete: true },
    {
      title: 'Section F',
      heading: 'Overall Usability',
      hint: 'Adapted from the System Usability Scale (Brooke, 1996) -- items are reverse/positively worded on purpose, which is standard practice for that instrument.',
      complete: allLikertAnswered(sus),
    },
    {
      title: 'Section G',
      heading: 'Recently Added Features',
      hint: 'Added after the original survey instrument -- covers features shipped since, not part of the H1/H2/H3 scoring above.',
      complete: allLikertAnswered(nf),
    },
  ]
  const isLastStep = step === STEPS.length - 1
  const canSubmit = STEPS.every((s) => s.complete)

  async function handleSubmit() {
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
          nf,
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

      <main className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-16">
        <p className="text-sm font-medium uppercase tracking-wide text-accent-400">Research survey</p>
        <h1 className={`${HEADING_FONT} text-3xl font-bold tracking-tight text-balance sm:text-4xl`}>
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
          <div className="mt-6 flex flex-col gap-6 rounded-lg border border-border bg-surface px-6 py-6 sm:px-8 sm:py-8">
            <div className="flex flex-col gap-3">
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-background">
                <div
                  className="h-full rounded-full bg-accent-500 transition-all duration-300"
                  style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
                />
              </div>
              <span className="inline-flex w-fit items-center rounded-full border border-border px-3 py-1 text-xs font-medium text-muted">
                Step {step + 1} of {STEPS.length} — {STEPS[step].title}
              </span>
            </div>

            <div className="flex flex-col gap-1.5">
              <h2 className={`${HEADING_FONT} text-2xl font-semibold text-foreground`}>{STEPS[step].heading}</h2>
              {STEPS[step].hint && <p className="text-sm text-muted">{STEPS[step].hint}</p>}
            </div>

            <div className="flex flex-col gap-5">
              {step === 0 && (
                <>
                  <div className="flex flex-col gap-5">
                    <div className="flex flex-col gap-1.5">
                      <h3 className="font-medium text-foreground">Invitation</h3>
                      <p className="leading-relaxed text-muted">
                        I am Aeriel Matthew Cruz, currently completing the COMP902 Advanced
                        Information Technology Specialised Project as part of the Master of
                        Information Technology (MIT) program at Auckland Institute of Studies
                        (AIS). This survey is conducted as part of my final research report. You
                        are invited to participate by evaluating GainsCart, a protein-per-dollar
                        grocery budgeting tool. Your responses will help assess the app's
                        usability, effectiveness, and value for gym-going and bodybuilding
                        communities.
                      </p>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <h3 className="font-medium text-foreground">Purpose of the Study</h3>
                      <p className="leading-relaxed text-muted">
                        This study evaluates whether GainsCart helps users identify cost-effective
                        protein sources, improves satisfaction with grocery decisions, and makes
                        comparing protein products more efficient. Findings will be reported
                        alongside a technical evaluation of the app in the final research report.
                      </p>
                    </div>

                    <div className="flex flex-col gap-1.5">
                      <h3 className="font-medium text-foreground">Agreement to Participate</h3>
                      <p className="leading-relaxed text-muted">
                        Participation is voluntary. You may close this page at any time before
                        submitting without penalty. All responses are anonymous -- no name, email,
                        or other identifying information is collected. Data is stored securely and
                        used only for this academic research project, consistent with the approved
                        Participant Information Sheet and Consent Form (dated 17 June 2026).
                      </p>
                    </div>
                  </div>

                  <p className="text-sm leading-relaxed text-muted">
                    This survey should take about 10-15 minutes. Before continuing, make sure
                    you've entered a budget, reviewed the ranked list, and tried at least one of
                    the "Why this pick?" or "Compare stores" features.
                  </p>

                  <label className="flex items-start gap-3 rounded-lg border border-accent-900 bg-accent-900/10 px-5 py-4">
                    <input
                      type="checkbox"
                      checked={consent}
                      onChange={(e) => setConsent(e.target.checked)}
                      className="mt-1 h-4 w-4 shrink-0 accent-accent-500"
                    />
                    <span className="text-base leading-relaxed">
                      I have read the Participant Information Sheet and Consent Form and agree to
                      take part in this research, understanding that participation is voluntary
                      and anonymous.
                    </span>
                  </label>
                </>
              )}

              {step === 1 && (
                <>
                  <p className="-mt-2 text-sm text-muted">
                    These questions are for grouping responses only and cannot identify you.
                  </p>
                  <ChoiceQuestion number={1} label="Age group" options={AGE_GROUPS} value={ageGroup} onChange={setAgeGroup} />
                  <ChoiceQuestion
                    number={2}
                    label="How would you describe your relationship to fitness/bodybuilding?"
                    options={FITNESS_RELATIONSHIPS}
                    value={fitnessRelationship}
                    onChange={setFitnessRelationship}
                  />
                  {fitnessRelationship === 'other' && (
                    <input
                      type="text"
                      placeholder="Please specify"
                      value={fitnessRelationshipOther}
                      onChange={(e) => setFitnessRelationshipOther(e.target.value)}
                      className="rounded-md border border-border bg-surface px-4 py-2.5 text-foreground outline-none focus:border-accent-500"
                    />
                  )}
                  <ChoiceQuestion
                    number={3}
                    label="How often do you currently track or plan what you eat?"
                    options={TRACKING_FREQUENCIES}
                    value={trackingFrequency}
                    onChange={setTrackingFrequency}
                  />
                  <ChoiceQuestion
                    number={4}
                    label="Have you used a nutrition-tracking app before (e.g. MyFitnessPal, Cronometer)?"
                    options={NUTRITION_APP_USAGE}
                    value={usedNutritionApp}
                    onChange={setUsedNutritionApp}
                  />
                </>
              )}

              {step === 2 && <LikertQuestions questions={H1_QUESTIONS} answers={h1} onChange={setH1} />}
              {step === 3 && <LikertQuestions questions={H2_QUESTIONS} answers={h2} onChange={setH2} />}
              {step === 4 && <LikertQuestions questions={H3_QUESTIONS} answers={h3} onChange={setH3} />}

              {step === 5 && (
                <>
                  <OpenTextQuestion
                    number={1}
                    label="What did you like most about GainsCart?"
                    value={likedMost}
                    onChange={setLikedMost}
                  />
                  <OpenTextQuestion
                    number={2}
                    label="What, if anything, was confusing or frustrating?"
                    value={confusing}
                    onChange={setConfusing}
                  />
                  <OpenTextQuestion
                    number={3}
                    label='Did any recommended item seem wrong, inaccurate, or surprising (e.g. wrong nutrition, odd ranking)? Please describe.'
                    value={wrongOrSurprising}
                    onChange={setWrongOrSurprising}
                  />
                  <OpenTextQuestion
                    number={4}
                    label="What would you add or change to make this more useful for your own grocery shopping?"
                    value={wouldChange}
                    onChange={setWouldChange}
                  />
                </>
              )}

              {step === 6 && <LikertQuestions questions={SUS_QUESTIONS} answers={sus} onChange={setSus} />}
              {step === 7 && <LikertQuestions questions={NF_QUESTIONS} answers={nf} onChange={setNf} />}
            </div>

            {error && (
              <div className="rounded-md border border-accent-900 bg-surface px-5 py-4 text-sm text-accent-300">
                {error}
              </div>
            )}

            <div className="flex items-center justify-between border-t border-border pt-6">
              {step > 0 ? (
                <button
                  type="button"
                  onClick={() => setStep((s) => s - 1)}
                  className="rounded-md border border-border px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent-500"
                >
                  ← Back
                </button>
              ) : (
                <a
                  href="/"
                  className="rounded-md border border-border px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent-500"
                >
                  Cancel
                </a>
              )}

              {isLastStep ? (
                <button
                  type="button"
                  onClick={handleSubmit}
                  disabled={!canSubmit || submitting}
                  className="rounded-md bg-accent-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {submitting ? 'Submitting…' : 'Submit survey'}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setStep((s) => s + 1)}
                  disabled={!STEPS[step].complete}
                  className="rounded-md bg-accent-600 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Next →
                </button>
              )}
            </div>
            {!STEPS[step].complete && (
              <p className="-mt-2 text-xs text-muted">
                {step === 0 ? 'Please give consent to continue.' : 'Please answer every question above to continue.'}
              </p>
            )}
          </div>
        )}
      </main>
    </div>
  )
}

function ChoiceQuestion({
  number,
  label,
  options,
  value,
  onChange,
}: {
  number: number
  label: string
  options: ChoiceOption[]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex flex-col gap-2.5">
      <span className="text-base">
        <span className="font-semibold text-foreground">Q{number}.</span> {label}
      </span>
      <div className="flex flex-wrap gap-2.5">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded-full border px-4 py-2 text-sm transition-colors ${value === opt.value
                ? 'border-accent-500 bg-accent-900 text-accent-300'
                : 'border-border text-muted hover:border-accent-500 hover:text-foreground'
              }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </label>
  )
}

function OpenTextQuestion({
  number,
  label,
  value,
  onChange,
}: {
  number: number
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex flex-col gap-2.5">
      <span className="text-base">
        <span className="font-semibold text-foreground">Q{number}.</span> {label}
      </span>
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
      {questions.map((q, i) => (
        <LikertRow
          key={q.key}
          number={i + 1}
          statement={q.statement}
          value={answers[q.key]}
          onChange={(v) => onChange({ ...answers, [q.key]: v })}
        />
      ))}
    </>
  )
}

function LikertRow({
  number,
  statement,
  value,
  onChange,
}: {
  number: number
  statement: string
  value: number | null
  onChange: (v: number) => void
}) {
  return (
    <div className="rounded-lg border border-border bg-background px-5 py-5 sm:px-7 sm:py-6">
      <p className="mb-5 text-base leading-relaxed text-foreground">
        <span className="font-semibold">Q{number}.</span> {statement}
      </p>
      <div className="grid grid-cols-5 gap-1.5 sm:gap-3">
        {LIKERT_LABELS.map((label, i) => {
          const optionValue = i + 1
          const active = value === optionValue
          return (
            <button
              key={label}
              type="button"
              onClick={() => onChange(optionValue)}
              className={`flex flex-col items-center gap-2 rounded-md border px-1 py-3 text-center transition-colors sm:px-2 ${active
                  ? 'border-accent-500 bg-accent-900'
                  : 'border-border hover:border-accent-500'
                }`}
            >
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-full border text-sm font-semibold transition-colors ${active ? 'border-accent-400 bg-accent-500 text-white' : 'border-border text-muted'
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
