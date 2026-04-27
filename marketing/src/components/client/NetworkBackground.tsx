"use client";

import React, { useEffect, useRef } from "react";

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  baseRadius: number;
}

const NetworkBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const nodesRef = useRef<Node[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const nodes: Node[] = nodesRef.current;

    // Enhanced color palette with brighter colors - using only indigo shades
    const colors = [
      "rgba(99, 102, 241, ", // indigo
      "rgba(79, 70, 229, ", // indigo darker
      "rgba(67, 56, 202, ", // indigo darker
      "rgba(55, 48, 163, ", // indigo even darker
      "rgba(49, 46, 129, ", // indigo darkest
      "rgba(129, 140, 248, ", // indigo lighter
      "rgba(165, 180, 252, ", // indigo light
      "rgba(199, 210, 254, ", // indigo very light
      "rgba(224, 231, 255, ", // indigo lightest
      "rgba(238, 242, 255, ", // indigo faintest
    ];

    // Function to create a grid of nodes - defined before it's used
    const createGrid = () => {
      // Clear existing nodes
      nodes.length = 0;

      // Calculate grid dimensions
      const spacing = Math.min(window.innerWidth, window.innerHeight) * 0.05; // 5% of screen size for spacing
      const cols = Math.floor(window.innerWidth / spacing);
      const rows = Math.floor(window.innerHeight / spacing);

      // Add some margin
      const marginX = (window.innerWidth - (cols - 1) * spacing) / 2;
      const marginY = (window.innerHeight - (rows - 1) * spacing) / 2;

      // Create grid of nodes
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          // Calculate position
          const x = marginX + col * spacing;
          const y = marginY + row * spacing;

          // Add very slight position variation
          const xVariation = (Math.random() * 2 - 1) * 2; // ±2px
          const yVariation = (Math.random() * 2 - 1) * 2; // ±2px

          // Fixed radius for grid points
          const radius = Math.random() * 0.8 + 0.4;

          // Select color - use more subtle colors for grid
          const colorIndex = Math.floor(Math.random() * colors.length);

          nodes.push({
            x: x + xVariation,
            y: y + yVariation,
            vx: (Math.random() - 0.5) * 0.0005, // Almost no movement
            vy: (Math.random() - 0.5) * 0.0005, // Almost no movement
            radius: radius,
            baseRadius: radius,
            color: colors[colorIndex],
          });
        }
      }
    };

    // Set canvas to full screen
    const handleResize = () => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = window.innerWidth * dpr;
      canvas.height = window.innerHeight * dpr;
      ctx.scale(dpr, dpr);
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;

      // Recreate grid when resizing
      createGrid();
    };

    window.addEventListener("resize", handleResize);
    handleResize();

    // Animation function
    const animate = () => {
      // Clear with a very slight fade effect
      ctx.fillStyle = "rgba(15, 23, 42, 0.005)"; // Extremely reduced opacity
      ctx.fillRect(0, 0, window.innerWidth, window.innerHeight);

      // Update and draw nodes
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];

        // Update position - extremely minimal movement
        node.x += node.vx;
        node.y += node.vy;

        // Apply very strong friction to almost stop nodes
        node.vx *= 0.98;
        node.vy *= 0.98;

        // Bounce off edges with some padding - very gentle
        const padding = 10;
        if (node.x <= padding) {
          node.vx = Math.abs(node.vx) * 0.05; // Minimal bounce energy
          node.x = padding;
        } else if (node.x >= window.innerWidth - padding) {
          node.vx = -Math.abs(node.vx) * 0.05; // Minimal bounce energy
          node.x = window.innerWidth - padding;
        }

        if (node.y <= padding) {
          node.vy = Math.abs(node.vy) * 0.05; // Minimal bounce energy
          node.y = padding;
        } else if (node.y >= window.innerHeight - padding) {
          node.vy = -Math.abs(node.vy) * 0.05; // Minimal bounce energy
          node.y = window.innerHeight - padding;
        }

        // Draw node with fixed size (no pulsating)
        ctx.beginPath();
        const gradient = ctx.createRadialGradient(
          node.x,
          node.y,
          0,
          node.x,
          node.y,
          node.radius * 1.2 // Fixed size multiplier
        );

        gradient.addColorStop(0, node.color + "0.3)"); // More subtle nodes
        gradient.addColorStop(0.5, node.color + "0.1)");
        gradient.addColorStop(1, node.color + "0)");

        ctx.fillStyle = gradient;
        ctx.arc(
          node.x,
          node.y,
          node.radius * 1.2, // Fixed size multiplier
          0,
          Math.PI * 2
        );
        ctx.fill();
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    // Store references for cleanup
    nodesRef.current = nodes;

    animate();

    // Cleanup
    return () => {
      window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(animationRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        zIndex: -1,
        pointerEvents: "none",
      }}
    />
  );
};

export default NetworkBackground;
