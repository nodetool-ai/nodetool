import { IntervalRef } from "./src/types";

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

function hideElement(element: HTMLElement | null): void {
  if (element) {
    element.style.display = "none";
  }
}

function showElement(
  element: HTMLElement | null,
  displayType: string = "block"
): void {
  if (element) {
    element.style.display = displayType;
  }
}

function hideBootMessage(): void {
  hideElement(bootMessage);
}

function showBootMessage(): void {
  showElement(bootMessage);
}

function hideUpdateSteps(): void {
  hideElement(updateStepsElement);
}

function showUpdateSteps(): void {
  showElement(updateStepsElement);
}

function hideInstallLocationPrompt(): void {
  hideElement(document.getElementById("install-location-prompt"));
}

function showInstallLocationPrompt(): void {
  showElement(document.getElementById("install-location-prompt"));
}

function hideUpdateNotification(): void {
  hideElement(document.getElementById("update-notification"));
}

function showUpdateNotification(): void {
  showElement(document.getElementById("update-notification"));
}

function hideLogs(): void {
  logContainer.classList.remove("expanded");
  logToggle.innerHTML = "<span>▲ Show Log</span>";
}

function showLogs(): void {
  logContainer.classList.add("expanded");
  logToggle.innerHTML = "<span>▼ Hide Log</span>";
}

function initializeApp(): void {
  window.api
    .getServerState()
    .then(({ isStarted, bootMsg, logs, initialURL }) => {
      console.log("Server state:", { isStarted, bootMsg, logs });
      if (isStarted) {
        loadContentWithNoCaching(initialURL);
        hideBootMessage();
        hideUpdateSteps();
        hideLogs();
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

  if (message.includes("Setting up Python")) {
    showLogs();
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

  showUpdateNotification();
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

window.api.onInstallLocationPrompt(
  async ({ defaultPath, downloadSize, installedSize }) => {
    const defaultLocationPath = document.querySelector(".location-path");
    const sizeInfo = document.querySelector(".size-info");

    if (!defaultLocationPath || !sizeInfo) {
      console.warn("Install location prompt elements not found");
      return;
    }

    defaultLocationPath.textContent = defaultPath;
    sizeInfo.textContent = `Download size: ${downloadSize}, Installed size: ${installedSize}`;
    hideBootMessage();
    showInstallLocationPrompt();

    const defaultLocationButton = document.querySelector(".default-location");
    const customLocationButton = document.querySelector(".custom-location");

    if (defaultLocationButton && customLocationButton) {
      defaultLocationButton.addEventListener("click", async () => {
        await window.api.selectDefaultInstallLocation();
        hideInstallLocationPrompt();
        showBootMessage();
      });

      customLocationButton.addEventListener("click", async () => {
        await window.api.selectCustomInstallLocation();
        hideInstallLocationPrompt();
        showBootMessage();
      });
    }
  }
);
