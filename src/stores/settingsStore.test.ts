import { describe, it, expect, beforeEach } from 'vitest';
import { useSettingsStore } from './settingsStore';

describe('settingsStore', () => {
  beforeEach(() => {
    // Reset Zustand store state before each test if needed
    // Assuming the initial state has 'plasma' or some default for voiceVisualizerStyle
    useSettingsStore.setState({ voiceVisualizerStyle: 'bars' });
  });

  it('initializes with a voice visualizer style', () => {
    const state = useSettingsStore.getState();
    expect(state.voiceVisualizerStyle).toBeDefined();
  });

  it('setVoiceVisualizerStyle updates the style correctly', () => {
    const { setVoiceVisualizerStyle } = useSettingsStore.getState();
    
    // Change to neon
    setVoiceVisualizerStyle('neon');
    expect(useSettingsStore.getState().voiceVisualizerStyle).toBe('neon');

    // Change to particles
    setVoiceVisualizerStyle('particles');
    expect(useSettingsStore.getState().voiceVisualizerStyle).toBe('particles');
  });

  it('setTheme updates the theme correctly', () => {
    const { setTheme } = useSettingsStore.getState();

    setTheme('dark');
    expect(useSettingsStore.getState().theme).toBe('dark');
  });

  it('initializes with an idle orb animation', () => {
    const state = useSettingsStore.getState();
    expect(state.idleOrbAnimation).toBeDefined();
  });

  it('setIdleOrbAnimation updates the animation correctly', () => {
    const { setIdleOrbAnimation } = useSettingsStore.getState();

    setIdleOrbAnimation('glow-ring');
    expect(useSettingsStore.getState().idleOrbAnimation).toBe('glow-ring');

    setIdleOrbAnimation('shimmer');
    expect(useSettingsStore.getState().idleOrbAnimation).toBe('shimmer');
  });

  it('setVoiceVisualizerStyle accepts the 2 new styles', () => {
    const { setVoiceVisualizerStyle } = useSettingsStore.getState();

    setVoiceVisualizerStyle('waveline');
    expect(useSettingsStore.getState().voiceVisualizerStyle).toBe('waveline');

    setVoiceVisualizerStyle('spectrum');
    expect(useSettingsStore.getState().voiceVisualizerStyle).toBe('spectrum');
  });
});
