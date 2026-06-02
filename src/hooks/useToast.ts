import { useState, useCallback, useRef } from 'react';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const addToast = useCallback((message: string, type: Toast['type'] = 'info') => {
    const id = `toast-${++counter.current}`;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const success = useCallback((msg: string) => addToast(msg, 'success'), [addToast]);
  const error   = useCallback((msg: string) => addToast(msg, 'error'),   [addToast]);
  const info    = useCallback((msg: string) => addToast(msg, 'info'),    [addToast]);

  return { toasts, success, error, info };
}
