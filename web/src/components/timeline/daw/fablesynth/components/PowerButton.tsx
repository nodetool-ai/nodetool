// LED power toggle for bool params.

import { useStore } from '../store';
import { useTranslation } from 'react-i18next';

interface PowerButtonProps {
  paramId: string;
}

export function PowerButton({ paramId }: PowerButtonProps) {
  const { t } = useTranslation();
  const value = useStore((s) => s.params[paramId]);
  const setParam = useStore((s) => s.setParam);
  const on = !!value;
  return (
    <button
      className={`power-btn${on ? ' on' : ''}`}
      aria-label={t('i18n-next44-fablesynth-controls.powerButton.power')}
      onClick={() => setParam(paramId, on ? 0 : 1)}
    />
  );
}
