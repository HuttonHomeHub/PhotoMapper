import { useState, useEffect, useMemo } from 'react';

// ARCH-02: timeline playback state, derived data, and effects, extracted from
// App.jsx. Returns the state plus the chronological slice the map/list display.
export function useTimeline(photos) {
  const [active, setActive] = useState(false);
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

  // Reset to the start whenever the timeline is (re)activated.
  useEffect(() => {
    if (active) {
      setIndex(0);
      setPlaying(false);
    }
  }, [active]);

  // Auto-advance while playing, stopping at the end.
  useEffect(() => {
    if (!playing) return;
    if (index >= sorted.length - 1) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(() => setIndex((i) => i + 1), speed);
    return () => clearTimeout(timer);
  }, [playing, index, sorted.length, speed]);

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
    playing,
    setPlaying,
    speed,
    setSpeed,
    sorted,
    slicePhotos,
    currentPhoto,
    currentDate,
  };
}
