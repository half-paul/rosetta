import 'server-only'
import { JSDOM } from 'jsdom'
import { computeContentHash, buildStableId, normalizeSectionPath } from './stable-id'

export interface ParsedParagraph {
  plainText: string
  contentHash: string
  stableId: string
  position: number
}

export interface ParsedSection {
  title: string
  path: string
  position: number
  paragraphs: ParsedParagraph[]
}

const STRIP_SELECTORS = [
  '.infobox', '.navbox', '.reflist', '#toc',
  '.mw-editsection', '.ambox', '.tmbox',
  '.reference', '.mw-references-wrap', 'style', 'script',
]

export function parseWikipediaHtml(html: string, revisionId: number): ParsedSection[] {
  const { document } = new JSDOM(html).window

  // Strip non-content elements (D-08)
  for (const sel of STRIP_SELECTORS) {
    document.querySelectorAll(sel).forEach(el => el.remove())
  }

  const root = document.querySelector('.mw-parser-output')
  if (!root) return []

  // Initialize lead section (Pitfall 3 — paragraphs before first heading)
  let currentHeadings: string[] = ['lead']
  let currentSection: ParsedSection = {
    title: 'lead',
    path: 'lead',
    position: 0,
    paragraphs: [],
  }
  const sections: ParsedSection[] = [currentSection]
  let sectionPos = 0
  let paraPos = 0

  for (const child of Array.from(root.children)) {
    if (child.classList.contains('mw-heading')) {
      // Find heading element inside the wrapper div
      const heading = child.querySelector('h2, h3, h4, h5, h6')
      if (!heading) continue

      const level = parseInt(heading.tagName[1], 10)
      const title = heading.textContent?.trim() ?? ''

      // Build heading stack based on level
      if (level === 2) {
        currentHeadings = [title]
      } else if (level === 3) {
        currentHeadings = [currentHeadings[0] ?? title, title]
      } else {
        // level 4, 5, 6
        currentHeadings = [...currentHeadings.slice(0, level - 2), title]
      }

      const path = normalizeSectionPath(currentHeadings)
      sectionPos++
      paraPos = 0

      currentSection = {
        title,
        path,
        position: sectionPos,
        paragraphs: [],
      }
      sections.push(currentSection)
    } else if (child.tagName === 'P') {
      const plainText = child.textContent?.trim() ?? ''

      // Pitfall 6: filter empty/spacer paragraphs
      if (plainText.length < 10) continue

      const contentHash = computeContentHash(plainText)
      const stableId = buildStableId(currentSection.path, contentHash, revisionId)

      currentSection.paragraphs.push({
        plainText,
        contentHash,
        stableId,
        position: paraPos++,
      })
    }
  }

  // Exclude sections with no paragraphs
  return sections.filter(s => s.paragraphs.length > 0)
}
