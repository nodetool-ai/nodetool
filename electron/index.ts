import { IntervalRef, ServerState, UpdateInfo } from "./src/types";

const contentElement = document.getElementById("content");
const logElement = document.getElementById("log")!;
const bootMessage = document.getElementById("boot-message")!;
const logContainer = document.getElementById("log-container")!;
const logToggle = document.getElementById("log-toggle")!;
const updateStepsElement = document.getElementById("update-steps")!;
const openLogFileButton = document.getElementById("open-log-file")!;

const strokeInterval: IntervalRef = { current: null };
const fillInterval: IntervalRef = { current: null };
const colorfulStrokeInterval: IntervalRef = { current: null };
const colorfulFillInterval: IntervalRef = { current: null };

interface SimpleLogger {
  log: (message: string) => void;
}

function createSimpleLogger(logElement: HTMLElement): SimpleLogger {
  function log(message: string): void {
    const logLine = document.createElement("p");
    logLine.className = "log-line";
    logLine.textContent = message;
    logElement.appendChild(logLine);
    logElement.scrollTop = logElement.scrollHeight;
  }

  return { log };
}

function toggleLog(): void {
  logContainer.classList.toggle("expanded");
  const isExpanded = logContainer.classList.contains("expanded");
  logToggle.innerHTML = isExpanded
    ? "<span>▼ Hide Log</span>"
    : "<span>▲ Show Log</span>";
}

const simpleLogger = createSimpleLogger(logElement);

function loadContentWithNoCaching(initialURL: string): void {
  const timestamp = new Date().getTime();
  window.location.href = `${initialURL}?nocache=${timestamp}`;
}

function updateProgress(
  componentName: string,
  progress: number,
  action: string,
  eta?: string
): void {
  const updateStepsElement = document.getElementById("update-steps");
  const progressBar = document.querySelector<HTMLElement>(".progress");
  const progressPercentage = document.querySelector<HTMLElement>(
    ".progress-percentage"
  );
  const progressEta = document.querySelector<HTMLElement>(".progress-eta");
  const actionLabel = document.querySelector<HTMLElement>(".action-label");

  if (
    !updateStepsElement ||
    !progressBar ||
    !progressPercentage ||
    !actionLabel ||
    !progressEta
  ) {
    console.warn("Required elements not found");
    return;
  }

  if (progress < 100) {
    updateStepsElement.style.display = "block";
  }

  progressBar.style.width = `${progress}%`;
  progressPercentage.textContent = `${Math.round(progress)}%`;
  actionLabel.textContent = `${action} ${componentName}`;

  progressEta.textContent = eta ? ` (${eta})` : "";

  if (progress === 100) {
    setTimeout(() => {
      if (updateStepsElement) {
        updateStepsElement.style.display = "none";
      }
    }, 5000);
  }
}

function initializeApp(): void {
  window.api
    .getServerState()
    .then(({ isStarted, bootMsg, logs, initialURL }) => {
      console.log("Server state:", { isStarted, bootMsg, logs });
      if (isStarted) {
        loadContentWithNoCaching(initialURL);
        bootMessage.style.display = "none";
        updateStepsElement.style.display = "none";
        logContainer.classList.remove("expanded");
        logToggle.innerHTML = "<span>▲ Show Log</span>";
        clearAllAnimations();
      } else {
        const bootTextElement = document.querySelector(".boot-text");
        if (bootTextElement) {
          bootTextElement.textContent = bootMsg;
        }
        startIconAnimations();
      }

      logs.forEach((log) => simpleLogger.log(log));
    });
}

window.api.onUpdateProgress(({ componentName, progress, action, eta }) => {
  updateProgress(componentName, progress, action, eta);
});

window.api.onServerStarted(() => {
  initializeApp();
});

window.api.onBootMessage((message) => {
  const bootTextElement = document.querySelector(".boot-text");
  if (bootTextElement) {
    bootTextElement.textContent = message;
  }
});

window.api.onServerLog((message) => {
  simpleLogger.log(message);
});

logToggle.addEventListener("click", toggleLog);
openLogFileButton.addEventListener("click", async () => {
  await window.api.openLogFile();
});
initializeApp();

window.api.onUpdateAvailable((info) => {
  const updateNotification = document.getElementById("update-notification");
  const releaseLink = document.getElementById(
    "release-link"
  ) as HTMLAnchorElement | null;

  if (!updateNotification || !releaseLink) {
    console.warn("Update notification elements not found");
    return;
  }

  updateNotification.style.display = "block";
  releaseLink.href = info.releaseUrl;
  releaseLink.onclick = (e) => {
    e.preventDefault();
    window.api.openExternal(info.releaseUrl);
  };
});

function getRandomGrayColor(): string {
  const grayValue = Math.floor(Math.random() * 100);
  return `#${grayValue.toString(16).padStart(2, "0").repeat(3)}`;
}

function getRandomColor(): string {
  const randomColor = Math.floor(Math.random() * 16777215).toString(16);
  return `#${randomColor.padStart(6, "0")}`;
}

function updateStroke(): void {
  const icon = document.querySelector<HTMLElement>(".nodetool-icon");
  if (!icon) {
    console.warn("Icon element not found or invalid");
    return;
  }

  icon.style.setProperty("--stroke-color", getRandomGrayColor());
}

function updateFill(): void {
  const icon = document.querySelector<HTMLElement>(".nodetool-icon");
  if (!icon) {
    console.warn("Icon element not found or invalid");
    return;
  }

  icon.style.setProperty("--fill-color", getRandomGrayColor());
}

function clearAllAnimations(): void {
  [
    strokeInterval,
    fillInterval,
    colorfulStrokeInterval,
    colorfulFillInterval,
  ].forEach((interval) => {
    if (interval.current) {
      clearInterval(interval.current);
      interval.current = null;
    }
  });
}

function startIconAnimations(): void {
  updateStroke();

  strokeInterval.current = setInterval(updateStroke, 5000);

  setTimeout(() => {
    fillInterval.current = setInterval(updateFill, 5000);
  }, 60000 + 2500);

  setTimeout(() => {
    colorfulStrokeInterval.current = setInterval(() => {
      const icon = document.querySelector<HTMLElement>(".nodetool-icon");
      if (!icon) {
        console.warn("Icon element not found or invalid");
        return;
      }
      icon.style.setProperty("--stroke-color", getRandomColor());
    }, 5000);
  }, 5 * 60000);

  setTimeout(() => {
    colorfulFillInterval.current = setInterval(() => {
      const icon = document.querySelector<HTMLElement>(".nodetool-icon");
      if (!icon) {
        console.warn("Icon element not found or invalid");
        return;
      }
      icon.style.setProperty("--fill-color", getRandomColor());
    }, 5000);
  }, 10 * 60000 + 2500);
}
