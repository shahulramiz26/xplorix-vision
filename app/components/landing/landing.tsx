'use client'

import { useEffect } from 'react'
import { LandingFonts } from './fonts'
import './landing.css'
import { LandingMarkup } from './markup'
import { startHero } from './scenes/hero'
import { startPage } from './scenes/sections'
import { startHole } from './scenes/hole'

/* ==========================================================================
 * LANDING PAGE (dark)
 *
 * About exploration drilling: the breaking core, one shift logged once, one
 * hole and the problems on the way down, the invoice that checks itself, and
 * XPLORIX Intelligence. XPLORIX Core has its own page (/core). Every product
 * picture is drawn in the page itself, on demo data. The markup is static;
 * the scenes start after the first paint and stop when the page is left.
 * ========================================================================== */
export default function Landing() {
  useEffect(() => {
    const stops = [startPage(), startHero(), startHole()]
    return () => stops.forEach(stop => stop())
  }, [])
  return <div className="xl"><LandingFonts /><LandingMarkup /></div>
}
