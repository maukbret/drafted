import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { SavedReportDetail } from '@/types/reports'
import { ReportInsights, ReportInsightSection } from '@/lib/report-insights'

interface PdfOptions {
  report: SavedReportDetail
  insights: ReportInsights | null
  periodLabel: string
  compareLabel: string
  excludedActionItems: Set<string>
  showListGrowthSection: boolean
  hasGrowthMetrics: boolean
}

function fmtCurrency(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)
}

function fmtPct(n: number) {
  return `${(n * 100).toFixed(2)}%`
}

function formatInteger(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  return Math.round(value).toLocaleString('en-US')
}

function formatSignedInteger(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  const rounded = Math.round(value)
  return `${rounded >= 0 ? '+' : ''}${rounded.toLocaleString('en-US')}`
}

function formatSignedPercent(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—'
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

function growthPct(current: number, comparison: number): string {
  if (comparison === 0) return current > 0 ? 'New' : '—'
  const pct = ((current - comparison) / comparison) * 100
  return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
}

function aggregateRate(
  items: { openRate: number; clickRate: number; deliveredCount: number }[],
  key: 'openRate' | 'clickRate',
): number {
  const totalDelivered = items.reduce((s, c) => s + c.deliveredCount, 0)
  if (totalDelivered > 0) {
    return items.reduce((s, c) => s + c[key] * c.deliveredCount, 0) / totalDelivered
  }
  if (items.length === 0) return 0
  return items.reduce((s, c) => s + c[key], 0) / items.length
}

// Colors (mutable tuples for jspdf-autotable compatibility)
type RGB = [number, number, number]
const PRIMARY: RGB = [15, 23, 42]       // slate-900
const MUTED: RGB = [100, 116, 139]      // slate-500
const LIGHT_BG: RGB = [248, 250, 252]   // slate-50
const BORDER: RGB = [226, 232, 240]     // slate-200

function addInsightSection(
  doc: jsPDF,
  y: number,
  title: string,
  section: ReportInsightSection | null,
  sectionKey: string,
  excludedActionItems: Set<string>,
  includeActionItems: boolean,
): number {
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 20
  const contentWidth = pageWidth - margin * 2

  // Check if we need a new page
  if (y > doc.internal.pageSize.getHeight() - 60) {
    doc.addPage()
    y = 20
  }

  // Section title
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...PRIMARY)
  doc.text(title, margin, y)
  y += 7

  if (!section) {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MUTED)
    doc.text('No insight generated yet.', margin, y)
    return y + 10
  }

  // Summary
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...PRIMARY)
  const summaryLines = doc.splitTextToSize(section.summary, contentWidth)
  doc.text(summaryLines, margin, y)
  y += summaryLines.length * 4.5 + 4

  // Highlights
  if (section.highlights.length > 0) {
    if (y > doc.internal.pageSize.getHeight() - 40) {
      doc.addPage()
      y = 20
    }
    doc.setFontSize(8)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...MUTED)
    doc.text('HIGHLIGHTS', margin, y)
    y += 5

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...PRIMARY)
    doc.setFontSize(9)
    for (const item of section.highlights) {
      if (y > doc.internal.pageSize.getHeight() - 20) {
        doc.addPage()
        y = 20
      }
      const lines = doc.splitTextToSize(item, contentWidth - 8)
      doc.text('•', margin + 2, y)
      doc.text(lines, margin + 8, y)
      y += lines.length * 4.5 + 2
    }
    y += 2
  }

  // Action items (only included ones)
  if (includeActionItems && section.actionItems.length > 0) {
    const includedItems = section.actionItems.filter(
      (_, i) => !excludedActionItems.has(`${sectionKey}-${i}`),
    )

    if (includedItems.length > 0) {
      if (y > doc.internal.pageSize.getHeight() - 40) {
        doc.addPage()
        y = 20
      }
      doc.setFontSize(8)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(...MUTED)
      doc.text('ACTION ITEMS', margin, y)
      y += 5

      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...PRIMARY)
      doc.setFontSize(9)
      for (const item of includedItems) {
        if (y > doc.internal.pageSize.getHeight() - 20) {
          doc.addPage()
          y = 20
        }
        const lines = doc.splitTextToSize(item, contentWidth - 8)
        doc.text('•', margin + 2, y)
        doc.text(lines, margin + 8, y)
        y += lines.length * 4.5 + 2
      }
      y += 2
    }
  }

  return y + 4
}

export function generateReportPdf(options: PdfOptions) {
  const {
    report,
    insights,
    periodLabel,
    compareLabel,
    excludedActionItems,
    showListGrowthSection,
    hasGrowthMetrics,
  } = options

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const margin = 20
  const contentWidth = pageWidth - margin * 2

  // ─── Header ───
  let y = 25

  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...PRIMARY)
  doc.text(report.title, margin, y)
  y += 8

  doc.setFontSize(10)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(...MUTED)
  doc.text(`${report.accountLabel}  ·  ${periodLabel} vs ${compareLabel}`, margin, y)
  y += 5

  doc.setFontSize(8)
  doc.text(
    `Generated ${new Date(report.createdAt).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })}`,
    margin,
    y,
  )
  y += 8

  // Divider
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.3)
  doc.line(margin, y, pageWidth - margin, y)
  y += 10

  // ─── Revenue Overview ───
  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...PRIMARY)
  doc.text('Revenue Overview', margin, y)
  y += 8

  // Revenue cards as a simple table
  const totalGrowth = growthPct(report.analytics.totalRevenue, report.analytics.compTotalRevenue)
  const attrGrowth = growthPct(report.analytics.attributedRevenue, report.analytics.compAttributedRevenue)

  autoTable(doc, {
    startY: y,
    margin: { left: margin, right: margin },
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 4, textColor: PRIMARY },
    headStyles: {
      fillColor: LIGHT_BG,
      textColor: MUTED,
      fontStyle: 'bold',
      fontSize: 8,
    },
    head: [['Metric', 'Current Period', 'Comparison Period', 'Change']],
    body: [
      ['Total Revenue', fmtCurrency(report.analytics.totalRevenue), fmtCurrency(report.analytics.compTotalRevenue), totalGrowth],
      ['Attributed Revenue', fmtCurrency(report.analytics.attributedRevenue), fmtCurrency(report.analytics.compAttributedRevenue), attrGrowth],
    ],
  })

  y = (doc as any).lastAutoTable.finalY + 8

  // Revenue insights
  y = addInsightSection(doc, y, 'Insights: Revenue Overview', insights?.overview || null, 'overview', excludedActionItems, report.includeActionItems)

  // ─── Campaigns ───
  if (y > doc.internal.pageSize.getHeight() - 80) {
    doc.addPage()
    y = 20
  }

  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...PRIMARY)
  doc.text('Campaign Performance', margin, y)
  y += 8

  const campaigns = report.analytics.campaigns.slice(0, 5)
  if (campaigns.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 3, textColor: PRIMARY },
      headStyles: {
        fillColor: LIGHT_BG,
        textColor: MUTED,
        fontStyle: 'bold',
        fontSize: 8,
      },
      head: [['#', 'Campaign', 'Revenue', 'Open Rate', 'Click Rate']],
      body: campaigns.map((c, i) => [
        String(i + 1),
        c.name.length > 40 ? c.name.substring(0, 37) + '...' : c.name,
        fmtCurrency(c.revenue),
        fmtPct(c.openRate),
        fmtPct(c.clickRate),
      ]),
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 30 },
        3: { cellWidth: 25 },
        4: { cellWidth: 25 },
      },
    })
    y = (doc as any).lastAutoTable.finalY + 4

    // Aggregate rates
    const aggOpen = aggregateRate(report.analytics.campaigns, 'openRate')
    const compAggOpen = aggregateRate(report.analytics.compCampaigns, 'openRate')
    const aggClick = aggregateRate(report.analytics.campaigns, 'clickRate')
    const compAggClick = aggregateRate(report.analytics.compCampaigns, 'clickRate')

    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MUTED)
    doc.text(
      `Avg open rate: ${fmtPct(aggOpen)} (${growthPct(aggOpen, compAggOpen)})  ·  Avg click rate: ${fmtPct(aggClick)} (${growthPct(aggClick, compAggClick)})`,
      margin,
      y,
    )
    y += 8
  } else {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MUTED)
    doc.text('No campaign data available.', margin, y)
    y += 8
  }

  y = addInsightSection(doc, y, 'Insights: Campaign Performance', insights?.campaigns || null, 'campaigns', excludedActionItems, report.includeActionItems)

  // ─── Flows ───
  if (y > doc.internal.pageSize.getHeight() - 80) {
    doc.addPage()
    y = 20
  }

  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(...PRIMARY)
  doc.text('Flow Performance', margin, y)
  y += 8

  const flows = report.analytics.flows.slice(0, 5)
  if (flows.length > 0) {
    autoTable(doc, {
      startY: y,
      margin: { left: margin, right: margin },
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 3, textColor: PRIMARY },
      headStyles: {
        fillColor: LIGHT_BG,
        textColor: MUTED,
        fontStyle: 'bold',
        fontSize: 8,
      },
      head: [['#', 'Flow', 'Revenue', 'Open Rate', 'Click Rate']],
      body: flows.map((f, i) => [
        String(i + 1),
        f.name.length > 40 ? f.name.substring(0, 37) + '...' : f.name,
        fmtCurrency(f.revenue),
        fmtPct(f.openRate),
        fmtPct(f.clickRate),
      ]),
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 30 },
        3: { cellWidth: 25 },
        4: { cellWidth: 25 },
      },
    })
    y = (doc as any).lastAutoTable.finalY + 4

    const aggOpen = aggregateRate(report.analytics.flows, 'openRate')
    const compAggOpen = aggregateRate(report.analytics.compFlows, 'openRate')
    const aggClick = aggregateRate(report.analytics.flows, 'clickRate')
    const compAggClick = aggregateRate(report.analytics.compFlows, 'clickRate')

    doc.setFontSize(8)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MUTED)
    doc.text(
      `Avg open rate: ${fmtPct(aggOpen)} (${growthPct(aggOpen, compAggOpen)})  ·  Avg click rate: ${fmtPct(aggClick)} (${growthPct(aggClick, compAggClick)})`,
      margin,
      y,
    )
    y += 8
  } else {
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MUTED)
    doc.text('No flow data available.', margin, y)
    y += 8
  }

  y = addInsightSection(doc, y, 'Insights: Flow Performance', insights?.flows || null, 'flows', excludedActionItems, report.includeActionItems)

  // ─── List Growth ───
  if (showListGrowthSection) {
    if (y > doc.internal.pageSize.getHeight() - 80) {
      doc.addPage()
      y = 20
    }

    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(...PRIMARY)
    doc.text('Audience Growth', margin, y)
    y += 8

    if (hasGrowthMetrics) {
      autoTable(doc, {
        startY: y,
        margin: { left: margin, right: margin },
        theme: 'plain',
        styles: { fontSize: 9, cellPadding: 4, textColor: PRIMARY },
        headStyles: {
          fillColor: LIGHT_BG,
          textColor: MUTED,
          fontStyle: 'bold',
          fontSize: 8,
        },
        head: [['Total Profiles', 'New Subscribers', 'Unsubscribers', 'Net Growth', 'Net Growth %']],
        body: [[
          formatInteger(report.analytics.activeProfiles),
          formatInteger(report.analytics.newSubscribers),
          formatInteger(report.analytics.unsubscribers),
          formatSignedInteger(report.analytics.netGrowth),
          formatSignedPercent(report.analytics.netGrowthPercent),
        ]],
      })
      y = (doc as any).lastAutoTable.finalY + 8
    } else {
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(...MUTED)
      doc.text('Audience growth metrics were not included in this report.', margin, y)
      y += 8
    }

    y = addInsightSection(doc, y, 'Insights: List Growth', insights?.listGrowth || null, 'listGrowth', excludedActionItems, report.includeActionItems)
  }

  // ─── Footer on every page ───
  const totalPages = (doc as any).getNumberOfPages() as number
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    const pageHeight = doc.internal.pageSize.getHeight()
    doc.setFontSize(7)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(...MUTED)
    doc.text(
      `${report.title}  ·  ${report.accountLabel}  ·  Page ${i} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' },
    )
  }

  // Open in new tab
  const pdfBlob = doc.output('blob')
  const url = URL.createObjectURL(pdfBlob)
  window.open(url, '_blank')
}
