import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import SurveyPage from './Survey.tsx'

// No router dependency for a two-page app -- the survey opens in its own
// tab (see the link in App.tsx) rather than as an in-page modal, so it
// just needs its own URL to land on, not client-side navigation between
// the two.
const page = window.location.pathname === '/survey' ? <SurveyPage /> : <App />

createRoot(document.getElementById('root')!).render(<StrictMode>{page}</StrictMode>)
