// Generates and downloads a multi-page PDF "account statement" for one
// retailer over a date range — the okCredit-style "send statement"
// feature. Follows the same off-screen-render + html2canvas pattern as
// src/lib/invoicePdf.js, but unlike a one-page invoice this has to
// support arbitrarily many rows, so the captured canvas gets sliced into
// as many A4-height pages as it takes.

import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import LedgerStatementPrint from '../components/LedgerStatementPrint'

const A4_WIDTH_MM = 210
const A4_HEIGHT_MM = 297

async function renderStatementCanvas(props) {
  const [{ default: html2canvas }] = await Promise.all([import('html2canvas')])

  const container = document.createElement('div')
  container.style.position = 'fixed'
  container.style.top = '0'
  container.style.left = '-10000px'
  container.style.zIndex = '-1'
  document.body.appendChild(container)

  const root = createRoot(container)
  try {
    await new Promise((resolve) => {
      root.render(createElement(LedgerStatementPrint, { ...props, forCapture: true }))
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    })

    const node = container.firstChild
    const canvas = await html2canvas(node, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
    })
    return canvas
  } finally {
    root.unmount()
    document.body.removeChild(container)
  }
}

// Splits a tall canvas into A4-page-sized slices and writes each as its
// own PDF page, so a long statement (many transactions) prints/downloads
// cleanly instead of clipping after the first page.
function paginateCanvasIntoPdf(pdf, canvas) {
  const imgWidthMm = A4_WIDTH_MM
  const pxPerMm = canvas.width / imgWidthMm
  const pageHeightPx = Math.floor(A4_HEIGHT_MM * pxPerMm)
  const totalPages = Math.max(1, Math.ceil(canvas.height / pageHeightPx))

  for (let page = 0; page < totalPages; page++) {
    const sourceY = page * pageHeightPx
    const sliceHeightPx = Math.min(pageHeightPx, canvas.height - sourceY)

    const pageCanvas = document.createElement('canvas')
    pageCanvas.width = canvas.width
    pageCanvas.height = sliceHeightPx
    const ctx = pageCanvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height)
    ctx.drawImage(canvas, 0, sourceY, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx)

    const imgData = pageCanvas.toDataURL('image/jpeg', 0.95)
    const sliceHeightMm = sliceHeightPx / pxPerMm

    if (page > 0) pdf.addPage()
    pdf.addImage(imgData, 'JPEG', 0, 0, imgWidthMm, sliceHeightMm)
  }
}

// customer: the retailer record (name/phone/address)
// transactions: in-range rows, ascending by date (see fetchStatementData)
// openingBalance / closingBalance: numeric, positive = retailer owes you
// from / to: 'YYYY-MM-DD' strings
// generatedByName: signed-in staff member's name, for the footer
// Returns true/false rather than throwing, so the caller can toast on failure.
export async function downloadStatementPdf({
  customer,
  transactions,
  openingBalance,
  closingBalance,
  from,
  to,
  generatedByName,
}) {
  try {
    const { jsPDF } = await import('jspdf')
    const canvas = await renderStatementCanvas({
      customer,
      transactions,
      openingBalance,
      closingBalance,
      from,
      to,
      generatedByName,
    })

    const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' })
    paginateCanvasIntoPdf(pdf, canvas)

    const safeName = (customer?.name || 'retailer').replace(/[^a-z0-9]+/gi, '-').toLowerCase()
    pdf.save(`statement-${safeName}-${from}-to-${to}.pdf`)
    return true
  } catch (err) {
    console.error('Failed to generate statement PDF', err)
    return false
  }
}
