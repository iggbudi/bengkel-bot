import { QuickPrompts } from './QuickPrompts'

interface Props {
  customerName: string
  onPromptClick: (text: string) => void
}

export function EmptyState({ customerName, onPromptClick }: Props) {
  const greeting =
    customerName && customerName !== 'Pelanggan'
      ? `Halo, ${customerName}! 👋`
      : 'Halo! 👋'

  return (
    <div className="empty-state">
      <img src="/logo.svg" alt="" className="empty-logo" width="64" height="64" />
      <h2 className="empty-title">{greeting}</h2>
      <p className="empty-desc">
        Tanya harga, booking service, atau cek status perbaikan.
      </p>
      <QuickPrompts onPromptClick={onPromptClick} />
    </div>
  )
}
