/* The landing pages' fonts. Loaded as a plain stylesheet so a slow or blocked
 * font host never holds up the page; the text shows in the fallback first. */
export function LandingFonts() {
  return (
    // eslint-disable-next-line @next/next/no-page-custom-font
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" />
  )
}
