async function loadBranding() {
  try {
    const res = await fetch('/api/health')
    const data = await res.json()

    const name = data.workshop || data.bot || 'CMaestro'
    const tagline = data.tagline || 'Booking, estimasi biaya & konsultasi — kapan saja.'

    document.title = `${name} — Asisten Bengkel Mobil`
    setOgMeta('og:title', `${name} — Asisten Bengkel Mobil`)
    setOgMeta('og:description', tagline)
    setText('brand-name', name)
    setText('hero-title', tagline)
    setText('hero-tagline', buildSubtitle(data))
    setText('footer-name', name)
    setText('footer-address', data.workshopAddress || '—')
    setText('footer-hours', formatHours(data))
    setText('footer-phone', data.workshopPhone || '—')

    const phoneEl = document.getElementById('footer-phone')
    if (phoneEl && data.workshopPhone && data.workshopPhone !== '-') {
      const digits = data.workshopPhone.replace(/\D/g, '')
      phoneEl.innerHTML = `<a href="tel:${digits}" class="phone-link">${data.workshopPhone}</a>`
    }
  } catch {
    // keep static fallbacks
  }
}

function setText(id, text) {
  const el = document.getElementById(id)
  if (el) el.textContent = text
}

function setOgMeta(property, content) {
  const el = document.querySelector(`meta[property="${property}"]`)
  if (el) el.setAttribute('content', content)
}

function buildSubtitle(data) {
  const spec = data.workshopSpec
  if (spec) return `${spec} · Tanya apa saja soal service mobil Anda.`
  return 'Tanya apa saja soal service mobil Anda.'
}

function formatHours(data) {
  const hours = data.workshopHours
  const days = data.workshopDays
  if (hours && days) return `${days}, ${hours} WIB`
  if (hours) return `${hours} WIB`
  if (days) return days
  return '—'
}

loadBranding()