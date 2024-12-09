import { onCLS, onINP, onLCP } from "web-vitals";

function reportWebVitals() {
  onCLS(console.log);
  onINP(console.log);
  onLCP(console.log);
}

export default reportWebVitals;
