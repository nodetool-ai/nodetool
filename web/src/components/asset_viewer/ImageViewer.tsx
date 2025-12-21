/** @jsxImportSource @emotion/react */
import { css } from "@emotion/react";
import { useTheme } from "@mui/material/styles";
import type { Theme } from "@mui/material/styles";
import React, { useState, useEffect, useRef, MouseEventHandler } from "react";
import { Typography } from "@mui/material";
import { Asset } from "../../stores/ApiTypes";

interface ImageViewerProps {
  asset?: Asset;
  url?: string;
}

const styles = (theme: Theme) =>
  css({
    "&": {
      width: "100%",
      height: "calc(100% - 120px)",
      overflow: "hidden",
      margin: "0",
      position: "relative",
      pointerEvents: "all"
    },
    ".image-info": {
      position: "absolute",
      bottom: "0",
      right: "1em",
      zIndex: 1000
    },
    ".image-info p": {
      fontSize: theme.fontSizeSmall,
      textAlign: "right",
      color: theme.vars.palette.grey[100],
      textShadow: "0 0 4px rgba(0,0,0,0.9)"
    }
  });

/**
 * ImageViewer component, used to display an image viewer for a given asset.
 *
 * The viewer supports zooming and panning.
 */
const ImageViewer: React.FC<ImageViewerProps> = ({ asset, url }) => {
  const theme = useTheme();
  const viewerStyles = styles(theme);

  const imageRef = useRef<HTMLImageElement>(null);
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [imageWidth, setImageWidth] = useState<number>(0);
  const [imageHeight, setImageHeight] = useState<number>(0);
  const maxZoom = 16;

  useEffect(() => {
    if (imageRef.current) {
      const img = imageRef.current;
      img.style.transformOrigin = "center center";
      img.style.transform = `translate(${translate.x}px, ${translate.y}px) scale(${zoom})`;
    }
  }, [zoom, translate]);

  useEffect(() => {
    if (imageRef.current) {
      setZoom(1);
      imageRef.current.style.transform = "translate(0, 0) scale(1)";
    }
  }, []);

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    // event.preventDefault(); // > Unable to preventDefault inside passive event listener invocation.
    const scaleChange = event.deltaY * -0.003;
    const rect = imageRef.current?.getBoundingClientRect();
    if (rect) {
      const mouseX = event.clientX;
      const mouseY = event.clientY;
      const imgCenterX = rect.left + rect.width / 2;
      const imgCenterY = rect.top + rect.height / 2;
      const offsetX = mouseX - imgCenterX;
      const offsetY = mouseY - imgCenterY;
      const newZoom = Math.min(maxZoom, Math.max(1.0, zoom + scaleChange));
      const zoomRatio = newZoom / zoom;
      const translateX = translate.x + offsetX * (1 - zoomRatio);
      const translateY = translate.y + offsetY * (1 - zoomRatio);
      setZoom(newZoom);
      setTranslate({ x: translateX, y: translateY });
    }
  };

  const handleMouseDown = (event: React.MouseEvent<HTMLImageElement>) => {
    event.preventDefault();
    imageRef.current?.style.setProperty("cursor", "grabbing");
    const { clientX, clientY } = event;
    setPosition({ x: clientX, y: clientY });
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLImageElement>) => {
    if (event.buttons !== 1) {return;}
    const { clientX, clientY } = event;
    const deltaX = clientX - position.x;
    const deltaY = clientY - position.y;

    setTranslate((prevTranslate) => {
      const img = imageRef.current;
      if (img) {
        // margin for the bounds
        const marginX = window.innerWidth * 0.5;
        const marginY = window.innerHeight * 0.5;

        // bounds with added margins
        const bounds = {
          minX: window.innerWidth / 2 - (img.naturalWidth * zoom) / 2 - marginX,
          maxX: (img.naturalWidth * zoom) / 2 - window.innerWidth / 2 + marginX,
          minY:
            window.innerHeight / 2 - (img.naturalHeight * zoom) / 2 - marginY,
          maxY:
            (img.naturalHeight * zoom) / 2 - window.innerHeight / 2 + marginY
        };

        // translation within bounds
        const newTranslateX = Math.max(
          Math.min(prevTranslate.x + deltaX, bounds.maxX),
          bounds.minX
        );
        const newTranslateY = Math.max(
          Math.min(prevTranslate.y + deltaY, bounds.maxY),
          bounds.minY
        );

        return {
          x: newTranslateX,
          y: newTranslateY
        };
      } else {
        return prevTranslate;
      }
    });

    setPosition({ x: clientX, y: clientY });
  };

  const handleMouseUp = () => {
    imageRef.current?.style.setProperty("cursor", "grab");
  };

  const handleDoubleClick: React.MouseEventHandler<HTMLImageElement> = (
    event
  ) => {
    event.preventDefault();

    const rect = imageRef.current?.getBoundingClientRect();
    if (rect) {
      const mouseX = event.clientX;
      const mouseY = event.clientY;
      const imgCenterX = rect.left + rect.width / 2;
      const imgCenterY = rect.top + rect.height / 2;
      const offsetX = mouseX - imgCenterX;
      const offsetY = mouseY - imgCenterY;
      const newZoom = Math.min(maxZoom, zoom * 2);
      const zoomRatio = newZoom / zoom;
      const translateX = translate.x + offsetX * (1 - zoomRatio);
      const translateY = translate.y + offsetY * (1 - zoomRatio);

      setZoom(newZoom);
      setTranslate({ x: translateX, y: translateY });
    }
  };

  const handleRightClick: MouseEventHandler<HTMLImageElement> = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setPosition({ x: 0, y: 0 });
    setTranslate({ x: 0, y: 0 });
    setZoom(1);
  };

  return (
    <div css={viewerStyles} className="image-viewer">
      <div className="image-info">
        <Typography variant="body2">{`${imageWidth} x ${imageHeight}`}</Typography>
      </div>
      <div
        style={{
          margin: "0",
          height: "100%",
          width: "100%",
          top: "0",
          display: "block"
        }}
        onMouseMove={handleMouseMove}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleRightClick}
      >
        <img
          ref={imageRef}
          src={asset?.get_url || url}
          alt=""
          onLoad={() => {
            if (imageRef.current) {
              setImageWidth(imageRef.current.naturalWidth);
              setImageHeight(imageRef.current.naturalHeight);
            }
          }}
          style={{
            position: "absolute",
            transform: `translate(0px, 0px)`,
            cursor: "grab",
            objectFit: "contain",
            width: "100%",
            height: "100%"
          }}
        />
      </div>
    </div>
  );
};

export default ImageViewer;
