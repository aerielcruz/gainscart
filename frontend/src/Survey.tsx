import { useState } from 'react'

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

export default function SurveyModal({ onClose }: { onClose: () => void }) {
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
    } catch (err: any) {
      setError(err.message || 'Something went wrong submitting the survey.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-8">
      <div className="w-full max-w-2xl rounded-lg border border-border bg-background p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">GainsCart User Evaluation Survey</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-muted hover:text-foreground"
            aria-label="Close survey"
          >
            ✕
          </button>
        </div>

        {submitted ? (
          <div className="flex flex-col gap-3 text-sm text-muted">
            <p className="text-foreground">Thank you for your time!</p>
            <p>
              Your response has been recorded anonymously. If you would like a summary of the
              findings once the research is complete, please contact the researcher using the
              details in the Participant Information Sheet.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="mt-2 self-start rounded-md bg-accent-600 px-4 py-2 text-sm font-medium text-white hover:bg-accent-500"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-6 text-sm">
            <p className="text-muted">
              This research survey (COMP902 Applied Research Project, Aeriel Matthew Cruz) asks
              about your experience using GainsCart. It should take about 10-15 minutes. Your
              responses are anonymous -- please don't include your name anywhere in this form.
              Before continuing, make sure you've entered a budget, reviewed the ranked list, and
              tried at least one of the "Why this pick?" or "Compare stores" features.
            </p>

            <label className="flex items-start gap-2 rounded-md border border-border bg-surface px-3 py-2">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="mt-0.5"
                required
              />
              <span>
                I have read the Participant Information Sheet and Consent Form and agree to take
                part in this research, understanding that participation is voluntary and
                anonymous.
              </span>
            </label>

            <fieldset className="flex flex-col gap-3">
              <legend className="mb-1 font-medium text-foreground">Section A -- About You</legend>
              <p className="-mt-2 text-xs text-muted">These questions are for grouping responses only and cannot identify you.</p>

              <ChoiceQuestion
                label="Age group"
                options={AGE_GROUPS}
                value={ageGroup}
                onChange={setAgeGroup}
              />

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
                  className="rounded-md border border-border bg-surface px-3 py-2 text-foreground outline-none focus:border-accent-500"
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
            </fieldset>

            <LikertSection
              title="Section B -- Cost-Effective Protein Identification (H1)"
              hint="GainsCart positively influences users' ability to identify cost-effective protein sources."
              questions={H1_QUESTIONS}
              answers={h1}
              onChange={setH1}
            />

            <LikertSection
              title="Section C -- User Satisfaction (H2)"
              hint="GainsCart positively influences user satisfaction."
              questions={H2_QUESTIONS}
              answers={h2}
              onChange={setH2}
            />

            <LikertSection
              title="Section D -- Efficiency of Comparing Protein Products (H3)"
              hint="GainsCart positively influences users' efficiency in comparing protein products."
              questions={H3_QUESTIONS}
              answers={h3}
              onChange={setH3}
            />

            <fieldset className="flex flex-col gap-3">
              <legend className="mb-1 font-medium text-foreground">Section E -- Open-Ended Feedback</legend>
              <OpenTextQuestion
                label="What did you like most about GainsCart?"
                value={likedMost}
                onChange={setLikedMost}
              />
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
            </fieldset>

            <LikertSection
              title="Section F -- Overall Usability"
              hint='Adapted from the System Usability Scale (Brooke, 1996) -- items are reverse/positively worded on purpose, which is standard practice for that instrument.'
              questions={SUS_QUESTIONS}
              answers={sus}
              onChange={setSus}
            />

            {error && (
              <div className="rounded-md border border-accent-900 bg-surface px-4 py-3 text-sm text-accent-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={!canSubmit || submitting}
              className="rounded-md bg-accent-600 px-4 py-2 font-medium text-white transition-colors hover:bg-accent-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Submit survey'}
            </button>
            {!canSubmit && (
              <p className="-mt-4 text-xs text-muted">
                Please give consent and answer every question above (open-ended feedback is
                optional) before submitting.
              </p>
            )}
          </form>
        )}
      </div>
    </div>
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
    <label className="flex flex-col gap-1.5">
      <span>{label}</span>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={`rounded-full border px-3 py-1 text-xs transition-colors ${
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
    <label className="flex flex-col gap-1.5">
      <span>{label}</span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        maxLength={2000}
        className="resize-y rounded-md border border-border bg-surface px-3 py-2 text-foreground outline-none focus:border-accent-500"
      />
    </label>
  )
}

function LikertSection({
  title,
  hint,
  questions,
  answers,
  onChange,
}: {
  title: string
  hint: string
  questions: LikertQuestionDef[]
  answers: LikertAnswers
  onChange: (next: LikertAnswers) => void
}) {
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-1 font-medium text-foreground">{title}</legend>
      <p className="-mt-3 text-xs text-muted">{hint}</p>
      {questions.map((q) => (
        <LikertRow
          key={q.key}
          statement={q.statement}
          value={answers[q.key]}
          onChange={(v) => onChange({ ...answers, [q.key]: v })}
        />
      ))}
    </fieldset>
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
    <div className="flex flex-col gap-1.5 rounded-md border border-border bg-surface px-3 py-2.5">
      <span>{statement}</span>
      <div className="flex flex-wrap gap-1.5">
        {LIKERT_LABELS.map((label, i) => {
          const optionValue = i + 1
          const active = value === optionValue
          return (
            <button
              key={label}
              type="button"
              onClick={() => onChange(optionValue)}
              title={label}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                active
                  ? 'border-accent-500 bg-accent-900 text-accent-300'
                  : 'border-border text-muted hover:border-accent-500 hover:text-foreground'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
