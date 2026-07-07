import { Router } from 'express'
import { getOptimisedList } from '../services/optimiser.js'

export const optimiseRouter = Router()

optimiseRouter.get('/', async (req, res) => {
  const budget = Number(req.query.budget)
  if (!Number.isFinite(budget) || budget <= 0) {
    res.status(400).json({ error: 'budget must be a positive number' })
    return
  }

  const dietaryPreferences =
    typeof req.query.dietaryPreferences === 'string'
      ? req.query.dietaryPreferences
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : []

  try {
    const result = await getOptimisedList(budget, dietaryPreferences)
    res.json(result)
  } catch (err) {
    console.error('getOptimisedList failed:', err)
    res.status(500).json({ error: 'internal error computing optimised list' })
  }
})
