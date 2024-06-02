let mousePosition = { x: 0, y: 0 };

const updateMousePosition = (event: MouseEvent) => {
  mousePosition = { x: event.clientX, y: event.clientY };
};

document.addEventListener("mousemove", updateMousePosition);

export const getMousePosition = () => mousePosition;

export const cleanupMousePositionListener = () => {
  document.removeEventListener("mousemove", updateMousePosition);
};
