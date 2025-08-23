import React, { useEffect } from 'react';
import { useMediaQuery } from '@mui/material';
import { useTheme } from '@mui/material/styles';

interface MobileClassProviderProps {
  children: React.ReactNode;
}

const MobileClassProvider: React.FC<MobileClassProviderProps> = ({ children }) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  useEffect(() => {
    const body = document.body;
    
    if (isMobile) {
      body.classList.add('mobile');
    } else {
      body.classList.remove('mobile');
    }

    // Cleanup function to remove the class when component unmounts
    return () => {
      body.classList.remove('mobile');
    };
  }, [isMobile]);

  return <>{children}</>;
};

export default MobileClassProvider;