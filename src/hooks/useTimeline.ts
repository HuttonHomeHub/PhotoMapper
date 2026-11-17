import { useState, useEffect, useMemo, useCallback, type SetStateAction } from 'react';
import type { Photo } from '../../shared/api.ts';

export interface Timeline {
  active: boolean;
  setActive: (value: SetStateAction<boolean>) => void;
  index: number;
  setIndex: (value: SetStateAction<number>) => void;
  playing: boolean;
  setPlaying: (value: SetStateAction<boolean>) => void;
  speed: number;
  setSpeed: (value: SetStateAction<number>) => void;
  sorted: Photo[];
  slicePhotos: Photo[];
  currentPhoto: Photo | undefined;
  currentDate: string;
}

// ARCH-02: timeline playback state, derived data, and effects, extracted from
// App.tsx. Returns the state plus the chronological slice the map/list display.
export function useTimeline(photos: Photo[]): Timeline {
  const [active, setActiveState] = useState(false);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(800);

  const sorted = useMemo(
    () =>
      [...photos].sort((a, b) => {
        const dateA = a.dateTaken || a.uploadedAt || '';
        const dateB = b.dateTaken || b.uploadedAt || '';
        return dateA.localeCompare(dateB);
      }),
    [photos]
  );

  // Starts from the beginning, paused, whenever the timeline is (re)activated.
  const setActive = useCallback((value: SetStateAction<boolean>) => {
    setActiveState((was) => {
      const next = typeof value === 'function' ? value(was) : value;
      if (next && !was) {
        setIndex(0);
        setPlaying(false);
      }
      return next;
    });
  }, []);

  // Auto-advance while playing; playback stops at the end (see `playing` below).
  const atEnd = index >= sorted.length - 1;
  useEffect(() => {
    if (!playing || atEnd) return;
    const timer = setTimeout(() => setIndex((i) => i + 1), speed);
    return () => clearTimeout(timer);
  }, [playing, atEnd, index, speed]);

  const slicePhotos = sorted.slice(0, index + 1);
  const currentPhoto = sorted[index];
  const currentDate = currentPhoto
    ? currentPhoto.dateTaken
      ? new Date(currentPhoto.dateTaken).toLocaleDateString(undefined, {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
        })
      : `Photo ${index + 1}`
    : '';

  return {
    active,
    setActive,
    index,
    setIndex,
    // Reaching the last photo ends playback.
    playing: playing && !atEnd,
    setPlaying,
    speed,
    setSpeed,
    sorted,
    slicePhotos,
    currentPhoto,
    currentDate,
  };
}
