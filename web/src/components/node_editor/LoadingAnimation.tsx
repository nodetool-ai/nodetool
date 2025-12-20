import React, { useState, useEffect, useCallback, memo } from "react";
import "../../styles/loading_animation.css";
import isEqual from "lodash/isEqual";

const gradients = ["gradient1", "gradient2", "gradient3", "gradient4"];

const LoadingAnimation = () => {
  const duration = 4000;
  const [currentGradient, setCurrentGradient] = useState(gradients[0]);
  const [randomWidth, setRandomWidth] = useState("140px");
  const isLoading = true; //state === "running";

  const getRandomGradient = useCallback(() => {
    const randomIndex = Math.floor(Math.random() * gradients.length);
    setRandomWidth(`${Math.floor(Math.random() * 50) + 50}px`);
    return gradients[randomIndex];
  }, []);

  useEffect(() => {
    let intervalId: number | undefined;
    if (isLoading) {
      intervalId = window.setInterval(() => {
        setCurrentGradient(getRandomGradient());
      }, duration);
    }
    return () => {
      if (intervalId) {
        clearInterval(intervalId);
      }
    };
  }, [isLoading, getRandomGradient]);

  return (
    <div
      className={`loading-indicator ${isLoading ? " loading" : ""}`}
      style={{ display: isLoading ? "block" : "block" }}
    >
      <div
        className="loading-mask"
        style={{ WebkitMaskSize: randomWidth + " 15px" }}
      >
        <div className={`loading-gradient ${currentGradient}`}></div>
      </div>
    </div>
  );
};

export default memo(LoadingAnimation, isEqual);
