import DOMPurify from 'dompurify'
import { marked } from 'marked'

marked.setOptions({ breaks: true, gfm: true })

export function renderMarkdown(text: string): string {
  try {
    const html = marked.parse(text) as string
    return DOMPurify.sanitize(html)
  } catch {
    return text
  }
}
