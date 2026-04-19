import { describe, it, expect, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { parseWikipediaHtml } from '@/features/ingestion/parse-article'

// ---------------------------------------------------------------------------
// Fixtures — inline HTML mimicking real MediaWiki output
// ---------------------------------------------------------------------------

const FIXTURE_BASIC = `
<div class="mw-content-ltr mw-parser-output">
  <p>This is the lead paragraph with enough content to pass the filter.</p>
  <div class="mw-heading mw-heading2"><h2 id="History">History</h2></div>
  <p>History paragraph one with sufficient content for testing purposes.</p>
  <p>History paragraph two with enough text to pass the minimum length filter.</p>
  <div class="mw-heading mw-heading2"><h2 id="Design">Design</h2></div>
  <p>Design paragraph with adequate content length for the test suite here.</p>
</div>
`

const FIXTURE_NESTED = `
<div class="mw-content-ltr mw-parser-output">
  <p>Lead paragraph with sufficient content to be extracted by the parser code.</p>
  <div class="mw-heading mw-heading2"><h2 id="History">History</h2></div>
  <p>History intro paragraph with enough content to pass the length filter.</p>
  <div class="mw-heading mw-heading3"><h3 id="Early_period">Early period</h3></div>
  <p>Early period details with sufficient content for stable ID generation test.</p>
</div>
`

const FIXTURE_STRIP = `
<div class="mw-content-ltr mw-parser-output">
  <table class="infobox"><tr><td><p>Infobox paragraph should not appear in output.</p></td></tr></table>
  <p>Real lead paragraph with enough content to be included after stripping.</p>
  <div class="mw-heading mw-heading2"><h2 id="Overview">Overview</h2></div>
  <p>Overview content paragraph with sufficient length for the extraction test.</p>
  <div class="navbox"><p>Navbox content that should be stripped before extraction.</p></div>
  <div class="reflist"><p>References that must not appear in the output paragraphs.</p></div>
</div>
`

const FIXTURE_SHORT_PARAS = `
<div class="mw-content-ltr mw-parser-output">
  <p></p>
  <p>Short</p>
  <p>This is a real paragraph with enough content to pass the minimum length filter.</p>
</div>
`

const FIXTURE_NO_ROOT = `
<div><p>No parser output wrapper</p></div>
`

const FIXTURE_EMPTY_SECTION = `
<div class="mw-content-ltr mw-parser-output">
  <p>Lead paragraph with enough content to pass the minimum length filter here.</p>
  <div class="mw-heading mw-heading2"><h2 id="Empty">Empty</h2></div>
  <p>Short</p>
  <p></p>
  <div class="mw-heading mw-heading2"><h2 id="Real">Real</h2></div>
  <p>Real content paragraph with sufficient length to be included in the results.</p>
</div>
`

const FIXTURE_EDIT_SECTION = `
<div class="mw-content-ltr mw-parser-output">
  <div class="mw-heading mw-heading2">
    <h2 id="Test">Test</h2>
    <span class="mw-editsection">[edit]</span>
  </div>
  <p>Test content paragraph with enough text to pass the minimum length filter.</p>
</div>
`

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('parseWikipediaHtml', () => {
  it('extracts lead section before first heading', () => {
    const result = parseWikipediaHtml(FIXTURE_BASIC, 1)
    const lead = result.find(s => s.title === 'lead')
    expect(lead).toBeDefined()
    expect(lead!.path).toBe('lead')
    expect(lead!.paragraphs).toHaveLength(1)
    expect(lead!.paragraphs[0].plainText).toContain('lead paragraph')
  })

  it('extracts multiple sections with correct titles and paths', () => {
    const result = parseWikipediaHtml(FIXTURE_BASIC, 1)
    expect(result).toHaveLength(3)

    const history = result.find(s => s.title === 'History')
    const design = result.find(s => s.title === 'Design')

    expect(history).toBeDefined()
    expect(history!.path).toBe('history')
    expect(history!.paragraphs).toHaveLength(2)

    expect(design).toBeDefined()
    expect(design!.path).toBe('design')
    expect(design!.paragraphs).toHaveLength(1)
  })

  it('builds hierarchical section paths for nested headings', () => {
    const result = parseWikipediaHtml(FIXTURE_NESTED, 1)
    const earlyPeriod = result.find(s => s.title === 'Early period')
    expect(earlyPeriod).toBeDefined()
    expect(earlyPeriod!.path).toBe('history/early_period')
  })

  it('assigns correct positions to paragraphs within sections', () => {
    const result = parseWikipediaHtml(FIXTURE_BASIC, 1)
    const history = result.find(s => s.title === 'History')
    expect(history).toBeDefined()
    expect(history!.paragraphs[0].position).toBe(0)
    expect(history!.paragraphs[1].position).toBe(1)
  })

  it('generates stable IDs in correct format', () => {
    const revisionId = 12345
    const result = parseWikipediaHtml(FIXTURE_BASIC, revisionId)
    for (const section of result) {
      for (const para of section.paragraphs) {
        expect(para.stableId).toMatch(/^[a-z_/]+:[a-f0-9]{12}:\d+$/)
        expect(para.stableId).toContain(`:${revisionId}`)
      }
    }
  })

  it('strips infobox, navbox, and reflist content', () => {
    const result = parseWikipediaHtml(FIXTURE_STRIP, 1)
    const allTexts = result.flatMap(s => s.paragraphs.map(p => p.plainText))

    expect(allTexts.some(t => t.includes('Infobox'))).toBe(false)
    expect(allTexts.some(t => t.includes('Navbox'))).toBe(false)
    expect(allTexts.some(t => t.includes('References'))).toBe(false)

    // Real paragraphs should still be present
    expect(result.length).toBeGreaterThan(0)
    expect(allTexts.some(t => t.includes('Real lead paragraph'))).toBe(true)
  })

  it('filters empty and short paragraphs', () => {
    const result = parseWikipediaHtml(FIXTURE_SHORT_PARAS, 1)
    expect(result).toHaveLength(1)
    expect(result[0].paragraphs).toHaveLength(1)
    expect(result[0].paragraphs[0].plainText).toContain('real paragraph')
  })

  it('returns empty array when no mw-parser-output root', () => {
    const result = parseWikipediaHtml(FIXTURE_NO_ROOT, 1)
    expect(result).toEqual([])
  })

  it('excludes sections with zero paragraphs after filtering', () => {
    const result = parseWikipediaHtml(FIXTURE_EMPTY_SECTION, 1)
    const sectionTitles = result.map(s => s.title)
    expect(sectionTitles).not.toContain('Empty')
    expect(sectionTitles).toContain('Real')
  })

  it('content hash is deterministic for same input', () => {
    const revisionId = 99
    const result1 = parseWikipediaHtml(FIXTURE_BASIC, revisionId)
    const result2 = parseWikipediaHtml(FIXTURE_BASIC, revisionId)

    const ids1 = result1.flatMap(s => s.paragraphs.map(p => p.stableId))
    const ids2 = result2.flatMap(s => s.paragraphs.map(p => p.stableId))

    expect(ids1).toEqual(ids2)
  })

  it('strips .mw-editsection spans from heading areas', () => {
    const result = parseWikipediaHtml(FIXTURE_EDIT_SECTION, 1)
    const testSection = result.find(s => s.title === 'Test')
    expect(testSection).toBeDefined()
    expect(testSection!.title).not.toContain('[edit]')
    expect(testSection!.paragraphs).toHaveLength(1)
  })
})
