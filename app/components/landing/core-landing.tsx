'use client'

import { useEffect } from 'react'
import { LandingFonts } from './fonts'
import './core.css'
import { CoreMarkup } from './core-markup'
import { startCore } from './scenes/core'

/* XPLORIX CORE (coming soon): its own page, reached from the landing page.
 * The tray review and the 3D view are drawn in the page, on demo holes with
 * real NVCL core photos. */
export default function CoreLanding() {
  useEffect(() => startCore(), [])
  return <div className="xc"><LandingFonts /><CoreMarkup /></div>
}
