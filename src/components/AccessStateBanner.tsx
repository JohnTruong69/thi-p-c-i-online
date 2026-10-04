import { forwardRef } from 'react';
import { Button, type ButtonProps } from '@/components/ui/button';

/**
 * WriteButton: plain Button passthrough.
 *
 * The app is free now — every wedding is writable, so there is no
 * trial/read-only gating layer. This alias exists so existing screens
 * (Guests, Planner, Viewers, PhaseThree) keep their markup unchanged.
 */
export const WriteButton = forwardRef<HTMLButtonElement, ButtonProps>(function WriteButton(props, ref) {
  return <Button ref={ref} {...props} />;
});
