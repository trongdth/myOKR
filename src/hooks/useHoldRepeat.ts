import { useRef, useCallback } from 'react';

const INITIAL_DELAY = 400;
const SLOW_INTERVAL = 80;
const FAST_INTERVAL = 40;
const ACCELERATE_AFTER = 1200;

export function useHoldRepeat(step: () => void, canStep: () => boolean) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);
  const stepRef = useRef(step);
  const canStepRef = useRef(canStep);
  stepRef.current = step;
  canStepRef.current = canStep;

  const clearAll = useCallback(() => {
    if (timeoutRef.current !== null) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const tick = useCallback(() => {
    if (!canStepRef.current()) {
      clearAll();
      return;
    }
    stepRef.current();
  }, [clearAll]);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    clearAll();

    if (!canStepRef.current()) return;
    stepRef.current();

    startTimeRef.current = Date.now();

    // After initial delay, start repeating
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(() => {
        // Check if we should accelerate
        if (
          intervalRef.current &&
          Date.now() - startTimeRef.current > INITIAL_DELAY + ACCELERATE_AFTER
        ) {
          clearInterval(intervalRef.current);
          intervalRef.current = setInterval(tick, FAST_INTERVAL);
        }
        tick();
      }, SLOW_INTERVAL);
    }, INITIAL_DELAY);
  }, [clearAll, tick]);

  const onPointerUp = useCallback(() => clearAll(), [clearAll]);
  const onPointerLeave = useCallback(() => clearAll(), [clearAll]);
  const onPointerCancel = useCallback(() => clearAll(), [clearAll]);

  return { onPointerDown, onPointerUp, onPointerLeave, onPointerCancel };
}
