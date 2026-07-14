import { Schema, model } from 'mongoose'

// Mirrors GainsCart_User_Survey.docx (the ethics-approved instrument used
// for the COMP902 research write-up's human evaluation, Section 4.6/5.4).
// Deliberately collects nothing identifying (no name, email, IP, user
// agent) -- the survey is anonymous by design, per the Participant
// Information Sheet / Consent Form referenced in the report.
const likertScale = { type: Number, min: 1, max: 5, required: true }

const surveyResponseSchema = new Schema({
  demographics: {
    ageGroup: { type: String, enum: ['18-24', '25-34', '35-44', '45-54', '55+'], required: true },
    fitnessRelationship: {
      type: String,
      enum: ['Competitive bodybuilder', 'Recreational lifter/gym-goer', 'General fitness interest', 'Other'],
      required: true,
    },
    fitnessRelationshipOther: String,
    trackingFrequency: {
      type: String,
      enum: ['Daily', 'A few times a week', 'Rarely', 'Never'],
      required: true,
    },
    usedNutritionApp: {
      type: String,
      enum: ['Yes, regularly', 'Yes, tried it once or twice', 'No'],
      required: true,
    },
  },
  // H1: GainsCart positively influences users' ability to identify
  // cost-effective protein sources.
  h1: {
    proteinValue: likertScale,
    easyToCompare: likertScale,
    noticedNewItems: likertScale,
    trustNutritionInfo: likertScale,
    matchedEstimatedClear: likertScale,
  },
  // H2: GainsCart positively influences user satisfaction.
  h2: {
    satisfiedOverall: likertScale,
    easyWithoutInstructions: likertScale,
    explanationsAddedValue: likertScale,
    wouldUseAgain: likertScale,
    wouldRecommend: likertScale,
  },
  // H3: GainsCart positively influences users' efficiency in comparing
  // protein products.
  h3: {
    fasterThanManual: likertScale,
    usableListQuickly: likertScale,
    compareStoresQuick: likertScale,
    dietaryFilterAsExpected: likertScale,
    noNeedToLeaveApp: likertScale,
  },
  // Adapted from the System Usability Scale (Brooke, 1996) -- reverse/
  // positively worded on purpose, per the survey doc's own note.
  sus: {
    unnecessarilyComplex: likertScale,
    wouldNeedSupport: likertScale,
    wellIntegrated: likertScale,
    learnQuickly: likertScale,
  },
  // Added after the original ethics-approved instrument -- covers features
  // shipped since (store location map, light/dark theme), kept separate from
  // h1/h2/h3 so it doesn't disturb that hypothesis scoring.
  nf: {
    storeMapHelpful: likertScale,
    themeToggleHelpful: likertScale,
  },
  openEnded: {
    likedMost: String,
    confusing: String,
    wrongOrSurprising: String,
    wouldChange: String,
  },
  submittedAt: { type: Date, default: Date.now },
})

export const SurveyResponse = model('SurveyResponse', surveyResponseSchema, 'survey_responses')
