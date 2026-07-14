import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import App from './App';

// Mock dependencies that App relies on that might cause issues in JSDOM
vi.mock('./hooks/useSettings', () => ({
  useSettings: () => ({
    theme: 'dark',
    palette: 'default',
    accentColor: null,
    voiceVisualizerStyle: 'bars'
  })
}));

vi.mock('./components/ui/useToast', () => ({
  useToast: () => ({
    toast: vi.fn(),
    dismiss: vi.fn(),
    toasts: []
  })
}));

vi.mock('./hooks/useMicLevel', () => ({
  useMicLevel: () => 0.5
}));

vi.mock('./stores/transcriptionStore', () => ({
  useTranscriptionStore: vi.fn(() => ({
    isListening: true,
    interimText: 'Testing transcription...'
  }))
}));

vi.mock('./hooks/useAudioRecording', () => ({
  useAudioRecording: () => ({
    isRecording: false,
    startRecording: vi.fn(),
    stopRecording: vi.fn(),
  })
}));

describe('App Component', () => {
  it('renders without crashing', () => {
    // The App component renders a dictation pill.
    // We just want to ensure it mounts properly with the mock settings.
    const { container } = render(<App />);
    expect(container).toBeInTheDocument();
  });
});
