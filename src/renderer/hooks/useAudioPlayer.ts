import { useEffect, useMemo, useRef, useState } from 'react';
import type { Track } from '../../shared/contracts/bridge';

interface AudioPlayerState {
  currentTrack: Track | null;
  currentIndex: number;
  audioElement: HTMLAudioElement | null;
  resolvedSource: string | null;
  isPlaying: boolean;
  isBuffering: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  error: string | null;
  notice: string | null;
  playTrack: (index: number) => void;
  togglePlayback: () => Promise<void>;
  nextTrack: () => void;
  previousTrack: () => void;
  seekTo: (time: number) => void;
  setVolumeLevel: (volume: number) => void;
}

const formatPlaybackError = () => '当前音频源暂时不可用，你可以换一组歌单，或者稍后再试。';

export function useAudioPlayer(tracks: Track[], queueToken: string): AudioPlayerState {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [audioElement, setAudioElement] = useState<HTMLAudioElement | null>(null);
  const [resolvedSource, setResolvedSource] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(tracks[0]?.duration ?? 0);
  const [volume, setVolume] = useState(0.72);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoplayOnLoadRef = useRef(false);
  const queueResetPendingRef = useRef(false);
  const requestIdRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const failedTrackIdsRef = useRef<Set<string>>(new Set());
  const noticeTimerRef = useRef<number | null>(null);

  const currentTrack = useMemo(() => tracks[currentIndex] ?? null, [currentIndex, tracks]);

  const stopProgressLoop = () => {
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  };

  const clearNoticeTimer = () => {
    if (noticeTimerRef.current !== null) {
      window.clearTimeout(noticeTimerRef.current);
      noticeTimerRef.current = null;
    }
  };

  const pushNotice = (message: string) => {
    clearNoticeTimer();
    setNotice(message);
    noticeTimerRef.current = window.setTimeout(() => {
      setNotice((current) => (current === message ? null : current));
      noticeTimerRef.current = null;
    }, 3400);
  };

  const startProgressLoop = () => {
    if (rafRef.current !== null) {
      return;
    }

    const step = () => {
      const audio = audioRef.current;
      if (!audio) {
        rafRef.current = null;
        return;
      }

      setCurrentTime(audio.currentTime);

      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }

      if (audio.paused || audio.ended) {
        rafRef.current = null;
        return;
      }

      rafRef.current = window.requestAnimationFrame(step);
    };

    rafRef.current = window.requestAnimationFrame(step);
  };

  const findNextIndex = (fromIndex: number, offset: 1 | -1) => {
    if (tracks.length === 0) {
      return null;
    }

    for (let step = 1; step <= tracks.length; step += 1) {
      const candidate = (fromIndex + offset * step + tracks.length) % tracks.length;
      const track = tracks[candidate];

      if (!track) {
        continue;
      }

      if (!failedTrackIdsRef.current.has(track.id)) {
        return candidate;
      }
    }

    return null;
  };

  const skipUnavailableTrack = (failedTrack: Track | null) => {
    if (!failedTrack) {
      setError(formatPlaybackError());
      autoplayOnLoadRef.current = false;
      setIsPlaying(false);
      setIsBuffering(false);
      return;
    }

    failedTrackIdsRef.current.add(failedTrack.id);
    const nextIndex = findNextIndex(currentIndex, 1);

    if (nextIndex === null) {
      setNotice(null);
      setError('这组歌暂时没有可播音源了，可以换一组重新听。');
      autoplayOnLoadRef.current = false;
      setIsPlaying(false);
      setIsBuffering(false);
      return;
    }

    pushNotice(`《${failedTrack.title}》暂时不可播，已自动切到下一首。`);
    setError(null);
    autoplayOnLoadRef.current = true;
    setCurrentIndex(nextIndex);
  };

  useEffect(() => {
    const audio = new Audio();
    audio.preload = 'metadata';
    audio.volume = volume;
    audioRef.current = audio;
    setAudioElement(audio);

    return () => {
      clearNoticeTimer();
      stopProgressLoop();
      audio.pause();
      audio.src = '';
      audioRef.current = null;
      setAudioElement(null);
      setResolvedSource(null);
    };
  }, []);

  useEffect(() => {
    if (currentIndex > tracks.length - 1) {
      setCurrentIndex(0);
    }
  }, [currentIndex, tracks.length]);

  useEffect(() => {
    queueResetPendingRef.current = true;
    autoplayOnLoadRef.current = false;
    requestIdRef.current += 1;
    failedTrackIdsRef.current = new Set();
    clearNoticeTimer();
    setNotice(null);
    stopProgressLoop();
    setCurrentIndex(0);
    setCurrentTime(0);
    setDuration(tracks[0]?.duration ?? 0);
    setResolvedSource(null);
    setIsPlaying(false);
    setIsBuffering(false);
    setError(null);

    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
  }, [queueToken, tracks]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      } else {
        setDuration(currentTrack?.duration ?? 0);
      }
    };
    const onVolumeChange = () => {
      setVolume(audio.muted ? 0 : audio.volume);
    };
    const onWaiting = () => setIsBuffering(true);
    const onCanPlay = () => {
      setIsBuffering(false);

      if (!audio.paused) {
        startProgressLoop();
      }
    };
    const onPause = () => {
      setIsPlaying(false);
      stopProgressLoop();
    };
    const onPlay = () => {
      if (currentTrack?.id) {
        failedTrackIdsRef.current.delete(currentTrack.id);
      }

      setError(null);
      setIsPlaying(true);
      setIsBuffering(false);
      startProgressLoop();
    };
    const onEnded = () => {
      stopProgressLoop();

      const nextIndex = findNextIndex(currentIndex, 1);
      if (nextIndex === null) {
        autoplayOnLoadRef.current = false;
        setIsPlaying(false);
        setIsBuffering(false);
        return;
      }

      autoplayOnLoadRef.current = true;
      setCurrentIndex(nextIndex);
    };
    const onError = () => {
      stopProgressLoop();
      setIsPlaying(false);
      setIsBuffering(false);
      skipUnavailableTrack(currentTrack);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('volumechange', onVolumeChange);
    audio.addEventListener('waiting', onWaiting);
    audio.addEventListener('canplay', onCanPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('error', onError);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('volumechange', onVolumeChange);
      audio.removeEventListener('waiting', onWaiting);
      audio.removeEventListener('canplay', onCanPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('error', onError);
    };
  }, [currentIndex, currentTrack, tracks]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.volume = volume;
  }, [volume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    const loadTrack = async () => {
      if (queueResetPendingRef.current && currentIndex !== 0) {
        return;
      }

      if (queueResetPendingRef.current) {
        queueResetPendingRef.current = false;
      }

      const requestId = requestIdRef.current + 1;
      requestIdRef.current = requestId;
      setError(null);
      setCurrentTime(0);
      setDuration(currentTrack?.duration ?? 0);

      if (!currentTrack) {
        stopProgressLoop();
        audio.pause();
        audio.removeAttribute('src');
        audio.load();
        setResolvedSource(null);
        setIsPlaying(false);
        setIsBuffering(false);
        return;
      }

      audio.pause();
      stopProgressLoop();
      setIsBuffering(true);

      let source = currentTrack.source;

      try {
        source = (await window.cosic.resolveTrackSource(currentTrack.id)) || source;
      } catch {
        source = currentTrack.source;
      }

      if (requestId !== requestIdRef.current) {
        return;
      }

      if (!source) {
        setResolvedSource(null);
        setIsPlaying(false);
        setIsBuffering(false);
        skipUnavailableTrack(currentTrack);
        return;
      }

      setResolvedSource(source);
      audio.src = source;
      audio.load();

      if (!autoplayOnLoadRef.current) {
        setIsPlaying(false);
        setIsBuffering(false);
        return;
      }

      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
        setIsBuffering(false);
        skipUnavailableTrack(currentTrack);
      }
    };

    void loadTrack();
  }, [currentTrack, currentIndex, queueToken]);

  const togglePlayback = async () => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) {
      return;
    }

    if (audio.paused) {
      const requestId = requestIdRef.current;
      failedTrackIdsRef.current.delete(currentTrack.id);
      autoplayOnLoadRef.current = true;
      setIsBuffering(true);

      try {
        const source = (await window.cosic.resolveTrackSource(currentTrack.id)) || currentTrack.source;

        if (requestId !== requestIdRef.current) {
          return;
        }

        if (!source) {
          throw new Error('Track source unavailable.');
        }

        setResolvedSource(source);
        if (audio.src !== source) {
          audio.src = source;
          audio.load();
        }

        await audio.play();
        setError(null);
      } catch {
        if (requestId !== requestIdRef.current) {
          return;
        }

        setIsPlaying(false);
        setIsBuffering(false);
        skipUnavailableTrack(currentTrack);
      }
      return;
    }

    autoplayOnLoadRef.current = false;
    audio.pause();
    stopProgressLoop();
    setIsPlaying(false);
    setIsBuffering(false);
  };

  const moveTrack = (offset: 1 | -1) => {
    if (tracks.length === 0) {
      return;
    }

    autoplayOnLoadRef.current = isPlaying;
    const nextIndex = findNextIndex(currentIndex, offset);
    if (nextIndex !== null) {
      setCurrentIndex(nextIndex);
    }
  };

  const playTrack = (index: number) => {
    const selectedTrack = tracks[index];
    if (!selectedTrack) {
      return;
    }

    failedTrackIdsRef.current.delete(selectedTrack.id);

    if (index === currentIndex) {
      const audio = audioRef.current;

      if (audio?.paused) {
        autoplayOnLoadRef.current = true;
        void togglePlayback();
      }

      return;
    }

    autoplayOnLoadRef.current = true;
    setCurrentIndex(index);
  };

  const seekTo = (time: number) => {
    const audio = audioRef.current;
    if (!audio) {
      return;
    }

    audio.currentTime = time;
    setCurrentTime(time);
  };

  const setVolumeLevel = (nextVolume: number) => {
    const clamped = Math.max(0, Math.min(1, nextVolume));
    setVolume(clamped);
  };

  return {
    currentTrack,
    currentIndex,
    audioElement,
    resolvedSource,
    isPlaying,
    isBuffering,
    currentTime,
    duration,
    volume,
    error,
    notice,
    playTrack,
    togglePlayback,
    nextTrack: () => moveTrack(1),
    previousTrack: () => moveTrack(-1),
    seekTo,
    setVolumeLevel
  };
}
