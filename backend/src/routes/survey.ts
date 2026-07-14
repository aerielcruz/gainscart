import { Router } from 'express'
import { SurveyResponse } from '../models/SurveyResponse.js'

export const surveyRouter = Router()

const AGE_GROUPS = ['18-24', '25-34', '35-44', '45-54', '55+']
const FITNESS_RELATIONSHIPS = [
  'Competitive bodybuilder',
  'Recreational lifter/gym-goer',
  'General fitness interest',
  'Other',
]
const TRACKING_FREQUENCIES = ['Daily', 'A few times a week', 'Rarely', 'Never']
const NUTRITION_APP_USAGE = ['Yes, regularly', 'Yes, tried it once or twice', 'No']

const H1_KEYS = ['proteinValue', 'easyToCompare', 'noticedNewItems', 'trustNutritionInfo', 'matchedEstimatedClear']
const H2_KEYS = ['satisfiedOverall', 'easyWithoutInstructions', 'explanationsAddedValue', 'wouldUseAgain', 'wouldRecommend']
const H3_KEYS = ['fasterThanManual', 'usableListQuickly', 'compareStoresQuick', 'dietaryFilterAsExpected', 'noNeedToLeaveApp']
const SUS_KEYS = ['unnecessarilyComplex', 'wouldNeedSupport', 'wellIntegrated', 'learnQuickly']

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
