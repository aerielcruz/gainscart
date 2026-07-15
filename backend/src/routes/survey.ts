import { Router } from 'express'
import { SurveyResponse } from '../models/SurveyResponse.js'

export const surveyRouter = Router()

// Stable value codes, not display labels -- must match the ChoiceOption
// `value`s in frontend/src/Survey.tsx and the enums in SurveyResponse.ts.
const AGE_GROUPS = ['18_24', '25_34', '35_44', '45_54', '55_plus']
const FITNESS_RELATIONSHIPS = ['competitive_bodybuilder', 'recreational_lifter', 'general_fitness', 'other']
const TRACKING_FREQUENCIES = ['daily', 'few_times_week', 'rarely', 'never']
const NUTRITION_APP_USAGE = ['yes_regularly', 'yes_tried_once', 'no']

const H1_KEYS = ['proteinValue', 'easyToCompare', 'noticedNewItems', 'trustNutritionInfo', 'matchedEstimatedClear']
const H2_KEYS = ['satisfiedOverall', 'easyWithoutInstructions', 'explanationsAddedValue', 'wouldUseAgain', 'wouldRecommend']
const H3_KEYS = ['fasterThanManual', 'usableListQuickly', 'compareStoresQuick', 'dietaryFilterAsExpected', 'noNeedToLeaveApp']
const SUS_KEYS = ['unnecessarilyComplex', 'wouldNeedSupport', 'wellIntegrated', 'learnQuickly']
const NF_KEYS = ['storeMapHelpful', 'themeToggleHelpful']

// Open-ended answers are free text from an anonymous participant -- capped
// to keep the DB entry bounded, not because longer feedback is unwelcome.
const MAX_OPEN_TEXT_LENGTH = 2000

function isLikert(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5
}

function parseLikertGroup(body: any, keys: string[]): Record<string, number> | string {
  const group: Record<string, number> = {}
  for (const key of keys) {
    const value = body?.[key]
    if (!isLikert(value)) return `${key} must be an integer from 1 to 5`
    group[key] = value
  }
  return group
}

function parseOpenText(v: unknown): string {
  return typeof v === 'string' ? v.slice(0, MAX_OPEN_TEXT_LENGTH) : ''
}

surveyRouter.post('/', async (req, res) => {
  const body = req.body ?? {}
  const demographics = body.demographics ?? {}

  if (!AGE_GROUPS.includes(demographics.ageGroup)) {
    res.status(400).json({ error: `demographics.ageGroup must be one of: ${AGE_GROUPS.join(', ')}` })
    return
  }
  if (!FITNESS_RELATIONSHIPS.includes(demographics.fitnessRelationship)) {
    res.status(400).json({ error: `demographics.fitnessRelationship must be one of: ${FITNESS_RELATIONSHIPS.join(', ')}` })
    return
  }
  if (!TRACKING_FREQUENCIES.includes(demographics.trackingFrequency)) {
    res.status(400).json({ error: `demographics.trackingFrequency must be one of: ${TRACKING_FREQUENCIES.join(', ')}` })
    return
  }
  if (!NUTRITION_APP_USAGE.includes(demographics.usedNutritionApp)) {
    res.status(400).json({ error: `demographics.usedNutritionApp must be one of: ${NUTRITION_APP_USAGE.join(', ')}` })
    return
  }

  const h1 = parseLikertGroup(body.h1, H1_KEYS)
  if (typeof h1 === 'string') {
    res.status(400).json({ error: `h1.${h1}` })
    return
  }
  const h2 = parseLikertGroup(body.h2, H2_KEYS)
  if (typeof h2 === 'string') {
    res.status(400).json({ error: `h2.${h2}` })
    return
  }
  const h3 = parseLikertGroup(body.h3, H3_KEYS)
  if (typeof h3 === 'string') {
    res.status(400).json({ error: `h3.${h3}` })
    return
  }
  const sus = parseLikertGroup(body.sus, SUS_KEYS)
  if (typeof sus === 'string') {
    res.status(400).json({ error: `sus.${sus}` })
    return
  }
  const nf = parseLikertGroup(body.nf, NF_KEYS)
  if (typeof nf === 'string') {
    res.status(400).json({ error: `nf.${nf}` })
    return
  }

  try {
    await SurveyResponse.create({
      demographics: {
        ageGroup: demographics.ageGroup,
        fitnessRelationship: demographics.fitnessRelationship,
        fitnessRelationshipOther:
          demographics.fitnessRelationship === 'Other' ? parseOpenText(demographics.fitnessRelationshipOther) : undefined,
        trackingFrequency: demographics.trackingFrequency,
        usedNutritionApp: demographics.usedNutritionApp,
      },
      h1,
      h2,
      h3,
      sus,
      nf,
      openEnded: {
        likedMost: parseOpenText(body.openEnded?.likedMost),
        confusing: parseOpenText(body.openEnded?.confusing),
        wrongOrSurprising: parseOpenText(body.openEnded?.wrongOrSurprising),
        wouldChange: parseOpenText(body.openEnded?.wouldChange),
      },
    })
    res.status(201).json({ ok: true })
  } catch (err) {
    console.error('Failed to save survey response:', err)
    res.status(500).json({ error: 'internal error saving survey response' })
  }
})
