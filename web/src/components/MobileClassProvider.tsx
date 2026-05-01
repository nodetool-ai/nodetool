import React, { useLayoutEffect } from 'react';
import { useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';

interface MobileClassProviderProps {
  children: React.ReactNode;
}

const MobileClassProvider: React.FC<MobileClassProviderProps> = ({ children }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isCoarsePointer = useMediaQuery('(pointer: coarse)');

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