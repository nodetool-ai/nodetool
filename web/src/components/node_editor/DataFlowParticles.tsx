/**
 * Experimental Data Flow Particles Component
 *
 * Visualizes real-time data flow through workflow edges using animated particles.
 * This provides visual feedback about data movement and helps users understand
 * workflow execution at a glance.
 *
 * NOTE: This is an EXPERIMENTAL feature. Performance characteristics with
 * large workflows (100+ nodes, 200+ edges) are still being evaluated.
 *
 * @experimental
 */

import { memo } from "react";

export interface DataFlowParticlesProps {
  /** Whether data is actively flowing on this edge */
  isActive: boolean;
}

/**
 * Data Flow Particles Component
 *
 * Renders animated particles along an edge path to visualize data flow.
 * Particles travel from source to target using CSS animations for performance.
 */
export const DataFlowParticles = memo(({ isActive }: DataFlowParticlesProps) => {
  if (!isActive) {
    return null;
  }

  return (
    <g className="data-flow-particles">
      {/* Particles are rendered via CSS pseudo-elements for performance */}
      <circle
        r="3"
        className="particle-1"
        fill="var(--palette-primary-main)"
        opacity="0.9"
      />
      <circle
        r="3"
        className="particle-2"
        fill="var(--palette-primary-main)"
        opacity="0.9"
      />
      <circle
        r="3"
        className="particle-3"
        fill="var(--palette-primary-main)"
        opacity="0.9"
      />
    </g>
  );
});

DataFlowParticles.displayName = "DataFlowParticles";

export default DataFlowParticles;
