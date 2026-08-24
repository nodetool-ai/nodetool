import React, { useEffect, useLayoutEffect } from 'react';
import { useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';

interface MobileClassProviderProps {
  children: React.ReactNode;
}

const noop = () => {};

const MobileClassProvider: React.FC<MobileClassProviderProps> = ({ children }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isCoarsePointer = useMediaQuery('(pointer: coarse)');

  // iOS Safari only lets `:hover`/`:active` apply to a tap once some element on
  // the page has a real touch listener bound; without one, tapping anything
  // that matches a `:hover` rule (e.g. any MUI ListItemButton row) just
  // "materializes" the hover state and needs a second tap to actually click —
  // the classic "double tap to select" bug (e.g. the model picker's rows).
  // Binding one no-op listener here, once, fixes it app-wide.
  useEffect(() => {
    document.addEventListener('touchstart', noop, { passive: true });
    return () => document.removeEventListener('touchstart', noop);
  }, []);

  // useLayoutEffect: apply class pre-paint so first frame is mobile-styled.
  useLayoutEffect(() => {
    const body = document.body;

    body.classList.toggle('mobile', isMobile);
    body.classList.toggle('coarse-pointer', isCoarsePointer);

    return () => {
      body.classList.remove('mobile');
      body.classList.remove('coarse-pointer');
    };
  }, [isMobile, isCoarsePointer]);

  return <>{children}</>;
};

export default MobileClassProvider;