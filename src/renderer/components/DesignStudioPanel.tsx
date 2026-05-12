import { useEffect, useMemo, useState, type FormEvent } from 'react';
import type { DesignReferenceImage, DesignReferenceMode } from '../../shared/contracts/bridge';

interface DesignStudioPanelProps {
  image: DesignReferenceImage | null;
  isGenerating: boolean;
  error: string | null;
  onGenerate: (request: {
    prompt: string;
    mode: DesignReferenceMode;
    size: '1024x1024' | '1536x1024' | '1024x1536';
    quality: 'low' | 'medium' | 'high';
  }) => void;
}

interface PromptPreset {
  id: string;
  label: string;
  prompt: string;
}

interface PinnedDesignReference {
  image: DesignReferenceImage;
  pinnedAt: number;
}

const DEFAULT_PROMPT = [
  'NOTHING / MONO / PLAYER LEFT / CURATOR RIGHT / DATA / RED SIGNAL'
].join(' ');

const PROMPT_PRESETS: PromptPreset[] = [
  {
    id: 'console',
    label: 'Console',
    prompt: [
      'NOTHING / MONO / TRACK HERO / FLAT BORDERS / DATA ROWS / RED DOT'
    ].join(' ')
  },
  {
    id: 'iteration',
    label: 'Iteration',
    prompt: [
      'NOTHING / PIN BAY / PRESETS / RENDER STATE / CURATOR TERMINAL'
    ].join(' ')
  },
  {
    id: 'player',
    label: 'Player',
    prompt: [
      'NOTHING / PLAYER DECK / TYPE FIRST / SEGMENTED PROGRESS / MECHANICAL CONTROLS'
    ].join(' ')
  },
  {
    id: 'mobile',
    label: 'Compact',
    prompt: [
      'NOTHING / COMPACT / PLAYER / QUEUE / PINS / INPUT / NO CHROME'
    ].join(' ')
  }
];

const toDataUrl = (image: DesignReferenceImage) => `data:${image.mimeType};base64,${image.imageBase64}`;

export function DesignStudioPanel({
  image,
  isGenerating,
  error,
  onGenerate
}: DesignStudioPanelProps) {
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [mode, setMode] = useState<DesignReferenceMode>('dark');
  const [size, setSize] = useState<'1024x1024' | '1536x1024' | '1024x1536'>('1536x1024');
  const [quality, setQuality] = useState<'low' | 'medium' | 'high'>('medium');
  const [activePresetId, setActivePresetId] = useState('console');
  const [pinnedReferences, setPinnedReferences] = useState<PinnedDesignReference[]>([]);
  const [activePinnedId, setActivePinnedId] = useState<string | null>(null);

  useEffect(() => {
    if (image) {
      setMode(image.mode);
      setSize(image.size);
      setQuality(image.quality);
    }
  }, [image]);

  const previewUrl = useMemo(() => (image ? toDataUrl(image) : null), [image]);
  const activePinned = pinnedReferences.find((item) => item.image.id === activePinnedId) ?? null;

  const submitPrompt = (
    nextPrompt = prompt,
    nextOptions?: {
      mode?: DesignReferenceMode;
      size?: '1024x1024' | '1536x1024' | '1024x1536';
      quality?: 'low' | 'medium' | 'high';
    }
  ) => {
    const trimmed = nextPrompt.trim();
    if (!trimmed || isGenerating) {
      return;
    }

    onGenerate({
      prompt: trimmed,
      mode: nextOptions?.mode ?? mode,
      size: nextOptions?.size ?? size,
      quality: nextOptions?.quality ?? quality
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submitPrompt();
  };

  const applyPreset = (preset: PromptPreset) => {
    setActivePresetId(preset.id);
    setPrompt(preset.prompt);
  };

  const pinCurrentReference = () => {
    if (!image) {
      return;
    }

    setPinnedReferences((current) => {
      const next = [
        {
          image,
          pinnedAt: Date.now()
        },
        ...current.filter((item) => item.image.id !== image.id)
      ].slice(0, 4);

      return next;
    });
    setActivePinnedId(image.id);
  };

  const continueFromPinned = (reference: DesignReferenceImage) => {
    const nextPrompt = [
      reference.prompt,
      'PIN CONTINUE / TIGHTER HIERARCHY / LESS NOISE / PLAYER CURATOR'
    ].join(' ');

    setPrompt(nextPrompt);
    setMode(reference.mode);
    setSize(reference.size);
    setQuality(reference.quality);
    submitPrompt(nextPrompt, {
      mode: reference.mode,
      size: reference.size,
      quality: reference.quality
    });
  };

  return (
    <section className="design-studio-panel panel" aria-label="Studio">
      <div className="design-studio-head">
        <div>
          <p className="panel-label">Studio</p>
          <h3>IMG-2</h3>
        </div>
        <span className={`design-status-pill${isGenerating ? ' is-live' : ''}${error ? ' is-error' : ''}`}>
          {error ? 'ERROR' : isGenerating ? 'RENDERING' : image ? 'READY' : 'IDLE'}
        </span>
      </div>

      <div className="design-preset-rail" aria-label="Presets">
        {PROMPT_PRESETS.map((preset) => (
          <button
            key={preset.id}
            className={preset.id === activePresetId ? 'design-preset-button is-active' : 'design-preset-button'}
            type="button"
            disabled={isGenerating}
            onClick={() => applyPreset(preset)}
          >
            {preset.label}
          </button>
        ))}
      </div>

      <form className="design-studio-form" onSubmit={handleSubmit}>
        <label className="design-field">
          <span className="design-field-label">Seed</span>
          <textarea
            className="design-textarea"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            rows={4}
            placeholder="Seed"
          />
        </label>

        <div className="design-control-grid">
          <label className="design-field">
            <span className="design-field-label">Tone</span>
            <select
              className="design-select"
              value={mode}
              onChange={(event) => setMode(event.target.value as DesignReferenceMode)}
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </label>

          <label className="design-field">
            <span className="design-field-label">Frame</span>
            <select
              className="design-select"
              value={size}
              onChange={(event) =>
                setSize(event.target.value as '1024x1024' | '1536x1024' | '1024x1536')
              }
            >
              <option value="1536x1024">Wide</option>
              <option value="1024x1024">Square</option>
              <option value="1024x1536">Portrait</option>
            </select>
          </label>

          <label className="design-field">
            <span className="design-field-label">Grade</span>
            <select
              className="design-select"
              value={quality}
              onChange={(event) => setQuality(event.target.value as 'low' | 'medium' | 'high')}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
        </div>

        <div className="design-studio-actions">
          <button className="primary-action" type="submit" disabled={isGenerating || !prompt.trim()}>
            {isGenerating ? 'Rendering' : 'Render'}
          </button>
          <button
            className="secondary-action"
            type="button"
            disabled={!image || isGenerating}
            onClick={pinCurrentReference}
          >
            Pin
          </button>
          <button
            className="ghost-action"
            type="button"
            disabled={isGenerating}
            onClick={() => {
              setActivePresetId('console');
              setPrompt(DEFAULT_PROMPT);
            }}
          >
            Reset
          </button>
        </div>
      </form>

      <div className="design-preview-shell">
        {previewUrl ? (
          <img className="design-preview-image" src={previewUrl} alt="Render" />
        ) : (
          <div className="design-preview-empty">
            <span>[ 000 ]</span>
          </div>
        )}
      </div>

      <div className="design-iteration-zone">
        <div className="design-iteration-head">
          <span>Pins</span>
          <strong>{String(pinnedReferences.length).padStart(2, '0')}</strong>
        </div>

        {pinnedReferences.length > 0 ? (
          <div className="design-pin-grid">
            {pinnedReferences.map((reference, index) => (
              <button
                key={reference.image.id}
                className={reference.image.id === activePinned?.image.id ? 'design-pin-card is-active' : 'design-pin-card'}
                type="button"
                disabled={isGenerating}
                onClick={() => {
                  setActivePinnedId(reference.image.id);
                  continueFromPinned(reference.image);
                }}
              >
                <img src={toDataUrl(reference.image)} alt={`Pinned reference ${index + 1}`} />
                <span>{String(index + 1).padStart(2, '0')}</span>
              </button>
            ))}
          </div>
        ) : (
          <div className="design-pin-empty">[ 00 ]</div>
        )}
      </div>

      {error ? <p className="design-error-copy">{error}</p> : null}
    </section>
  );
}
