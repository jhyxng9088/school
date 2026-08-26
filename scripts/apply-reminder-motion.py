from pathlib import Path


def replace_once(path, old, new, label):
    file = Path(path)
    text = file.read_text()
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected 1 match, found {count}')
    file.write_text(text.replace(old, new, 1))

# AI working ellipsis: leave the copy calm and animate only the dots.
replace_once(
    'src/todo-stage5-ai.jsx',
    "{attachmentFile ? '텍스트는 이해했고, 첨부 내용을 읽는 중…' : 'AI가 오타와 문맥을 확인하는 중…'}",
    "{attachmentFile ? '텍스트는 이해했고, 첨부 내용을 읽는 중' : 'AI가 오타와 문맥을 확인하는 중'}",
    'ai working copy',
)
replace_once(
    'src/reminder-summary.jsx',
    "? '첨부 내용을 읽고 정리하는 중…'",
    "? '첨부 내용을 읽고 정리하는 중'",
    'attachment working copy',
)

# Fade the actual original image in only after the browser has decoded/loaded it.
replace_once(
    'src/reminder-summary.jsx',
    '''function OriginalImageViewer({ original, onClose }) {
  const [saving, setSaving] = useState(false)
''',
    '''function OriginalImageViewer({ original, onClose }) {
  const [saving, setSaving] = useState(false)
  const [imageReady, setImageReady] = useState(false)
''',
    'original viewer state',
)
replace_once(
    'src/reminder-summary.jsx',
    '''        <div className="reminder-original-image-wrap">
          <img src={original.url} alt={original.name || '원본 사진'} />
        </div>''',
    '''        <div className={`reminder-original-image-wrap ${imageReady ? 'is-image-ready' : ''}`}>
          <img
            src={original.url}
            alt={original.name || '원본 사진'}
            onLoad={() => setImageReady(true)}
          />
        </div>''',
    'original image fade markup',
)

# Subtle three-dot progress indicator, no bouncing or large movement.
with Path('src/todo-ai.css').open('a') as file:
    file.write('''

.reminder-ai-status.is-working::after,
.reminder-attachment-status.is-working > span::after {
  content: '...';
  display: inline-block;
  width: 1.1em;
  overflow: hidden;
  margin-left: 1px;
  color: currentColor;
  white-space: nowrap;
  clip-path: inset(0 100% 0 0);
  animation: reminder-analysis-dots 1.35s steps(4, end) infinite;
}

@keyframes reminder-analysis-dots {
  0% { clip-path: inset(0 100% 0 0); opacity: 0.45; }
  24% { clip-path: inset(0 66% 0 0); opacity: 0.62; }
  48% { clip-path: inset(0 33% 0 0); opacity: 0.8; }
  72%, 100% { clip-path: inset(0 0 0 0); opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .reminder-ai-status.is-working::after,
  .reminder-attachment-status.is-working > span::after {
    clip-path: none;
    animation: none;
  }
}
''')

with Path('src/reminder-summary.css').open('a') as file:
    file.write('''

/* The viewer shell can appear first; the image itself eases in after load to avoid a flash. */
.reminder-original-image-wrap img {
  opacity: 0;
  transform: scale(0.994);
  transition:
    opacity 480ms cubic-bezier(0.16, 1, 0.3, 1),
    transform 620ms cubic-bezier(0.16, 1, 0.3, 1);
  will-change: opacity, transform;
}

.reminder-original-image-wrap.is-image-ready img {
  opacity: 1;
  transform: scale(1);
}

@media (prefers-reduced-motion: reduce) {
  .reminder-original-image-wrap img {
    opacity: 1;
    transform: none;
    transition: none;
  }
}
''')

replace_once(
    'public/sw.js',
    "const CACHE_NAME = 'school-shell-v73'",
    "const CACHE_NAME = 'school-shell-v74'",
    'service worker cache bump',
)

print('reminder motion patch applied')
