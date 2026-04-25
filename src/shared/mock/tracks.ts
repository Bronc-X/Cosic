import type { Track } from '../contracts/bridge';

export const mockTracks: Track[] = [
  {
    id: 'night-drive',
    title: 'Night Drive Protocol',
    artist: 'Signal Bureau',
    album: 'Midnight Control Deck',
    duration: 372,
    source: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3',
    year: '2026',
    mood: 'Focused',
    tags: ['night', 'warm synth', 'console glow'],
    theme: {
      primary: '#ff9a62',
      secondary: '#33160f',
      accent: '#ffd0a6'
    }
  },
  {
    id: 'harbor-line',
    title: 'Harbor Line FM',
    artist: 'Late Channel',
    album: 'Private Radio',
    duration: 389,
    source: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
    year: '2026',
    mood: 'Calm',
    tags: ['sea air', 'slow pulse', 'late city'],
    theme: {
      primary: '#7fd3cf',
      secondary: '#0f1f22',
      accent: '#d7f8f5'
    }
  },
  {
    id: 'weather-desk',
    title: 'Weather Desk After Hours',
    artist: 'North Ribbon',
    album: 'Static & Brass',
    duration: 405,
    source: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
    year: '2026',
    mood: 'Cinematic',
    tags: ['weather feed', 'copper haze', 'evening'],
    theme: {
      primary: '#f0cf78',
      secondary: '#2b2510',
      accent: '#fff0bb'
    }
  },
  {
    id: 'cast-window',
    title: 'Cast Window',
    artist: 'Glass Relay',
    album: 'Home Node Sessions',
    duration: 351,
    source: 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3',
    year: '2026',
    mood: 'Open',
    tags: ['home audio', 'thin air', 'weekend'],
    theme: {
      primary: '#84aaff',
      secondary: '#111a30',
      accent: '#d5e2ff'
    }
  }
];
