interface Props {
  visible: boolean
  onClick: () => void
}

export function ScrollToBottom({ visible, onClick }: Props) {
  if (!visible) return null
  return (
    <button
      type="button"
      className="scroll-to-bottom"
      onClick={onClick}
      aria-label="Scroll ke bawah"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
        <path
          d="M12 5v14M5 12l7 7 7-7"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  )
}
