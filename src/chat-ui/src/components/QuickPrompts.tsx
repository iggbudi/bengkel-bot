import { QUICK_PROMPTS } from '../types'

interface Props {
  onPromptClick: (text: string) => void
}

export function QuickPrompts({ onPromptClick }: Props) {
  return (
    <div className="quick-prompts">
      {QUICK_PROMPTS.map((text: string) => (
        <button
          key={text}
          type="button"
          className="quick-prompt"
          onClick={() => onPromptClick(text)}
        >
          {text}
        </button>
      ))}
    </div>
  )
}
