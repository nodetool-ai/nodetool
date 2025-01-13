const contentElement = document.getElementById("content");
const logElement = document.getElementById("log");
const bootMessage = document.getElementById("boot-message");
const logContainer = document.getElementById("log-container");
const logToggle = document.getElementById("log-toggle");
const updateStepsElement = document.getElementById("update-steps");
const openLogFileButton = document.getElementById("open-log-file");

// Add these variables at the top with other declarations
const strokeInterval = { current: null };
const fillInterval = { current: null };
const colorfulStrokeInterval = { current: null };
const colorfulFillInterval = { current: null };

/**
 * Creates a simple logging utility
 * @param {HTMLElement} logElement - The DOM element to append log messages to
 * @returns {{ log: (message: string) => void }}
 */
function createSimpleLogger(logElement) {
  /**
   * Logs a message to the log element
   * @param {string} message - The message to log
   * @returns {void}
   */
  function log(message) {
    const logLine = document.createElement("p");
    logLine.className = "log-line";
    logLine.textContent = message;
    logElement.appendChild(logLine);
    logElement.scrollTop = logElement.scrollHeight;
  }

  return { log };
}

/**
 * Toggles the visibility of the log container
 * @returns {void}
 */
function toggleLog() {
  logContainer.classList.toggle("expanded");
  const isExpanded = logContainer.classList.contains("expanded");
  logToggle.innerHTML = isExpanded
    ? "<span>▼ Hide Log</span>"
    : "<span>▲ Show Log</span>";
}

const simpleLogger = createSimpleLogger(logElement);

/**
 * Loads content into an iframe with cache busting
 * @param {string} initialURL - The URL to load
 * @returns {void}
 */
function loadContentWithNoCaching(initialURL) {
  const timestamp = new Date().getTime();
  // if (!(contentElement instanceof HTMLIFrameElement)) {
  //   console.warn("Content element must be an HTMLIFrameElement");
  //   return;
  // }

  // contentElement.src = `${initialURL}?nocache=${timestamp}`;
  window.location.href = `${initialURL}?nocache=${timestamp}`;
}

/**
 * Updates the progress UI elements
 * @param {string} componentName - Name of the component being updated
 * @param {number} progress - Progress percentage (0-100)
 * @param {string} action - Current action being performed
 * @param {string} [eta] - Estimated time remaining
 * @returns {void}
 */
function updateProgress(componentName, progress, action, eta) {
  const updateStepsElement = document.getElementById("update-steps");
  const progressBar = document.querySelector(".progress");
  const progressPercentage = document.querySelector(".progress-percentage");
  const progressEta = document.querySelector(".progress-eta");
  const actionLabel = document.querySelector(".action-label");

  if (progress < 100) {
    updateStepsElement.style.display = "block";
  }

  if (progressBar && progressPercentage && actionLabel) {
    if (!(progressBar instanceof HTMLElement)) {
      console.warn("Progress bar element must be an HTMLElement");
      return;
    }

    if (!(progressPercentage instanceof HTMLElement)) {
      console.warn("Progress percentage element must be an HTMLElement");
      return;
    }

    if (!(actionLabel instanceof HTMLElement)) {
      console.warn("Action label element must be an HTMLElement");
      return;
    }

    progressBar.style.width = `${progress}%`;
    progressPercentage.textContent = `${Math.round(progress)}%`;
    actionLabel.textContent = `${action} ${componentName}`;

    // Add ETA display
    if (eta && progressEta) {
      progressEta.textContent = ` (${eta})`;
    } else {
      progressEta.textContent = "";
    }
  }

  if (progress === 100) {
    setTimeout(() => {
      updateStepsElement.style.display = "none";
    }, 5000);
  }
}

/**
 * Initializes the application by fetching server state
 * @returns {void}
 */
function initializeApp() {
  // @ts-ignore
  window.api
    .getServerState()
    .then(({ isStarted, bootMsg, logs, initialURL }) => {
      console.log("Server state:", { isStarted, bootMsg, logs });
      if (isStarted) {
        loadContentWithNoCaching(initialURL);
        bootMessage.style.display = "none";
        updateStepsElement.style.display = "none";
        // Hide the log pane
        logContainer.classList.remove("expanded");
        logToggle.innerHTML = "<span>▲ Show Log</span>";

        // Clear all animation intervals when server starts
        clearAllAnimations();
      } else {
        const bootTextElement = document.querySelector(".boot-text");
        bootTextElement.textContent = bootMsg;
        // Start animations only if server hasn't started
        startIconAnimations();
      }

      logs.forEach((log) => simpleLogger.log(log));
    });
}

// @ts-ignore
window.api.onUpdateProgress(({ componentName, progress, action, eta }) => {
  updateProgress(componentName, progress, action, eta);
});

// @ts-ignore
window.api.onServerStarted(() => {
  initializeApp();
});

// @ts-ignore
window.api.onBootMessage((message) => {
  const bootTextElement = document.querySelector(".boot-text");
  bootTextElement.textContent = message;
});

// @ts-ignore
window.api.onServerLog((message) => {
  simpleLogger.log(message);
});

logToggle.addEventListener("click", toggleLog);
openLogFileButton.addEventListener("click", async () => {
  // @ts-ignore
  await window.api.openLogFile();
});
initializeApp();

// @ts-ignore
window.api.onUpdateAvailable((info) => {
  const updateNotification = document.getElementById("update-notification");
  const releaseLink = document.getElementById("release-link");
  if (!(releaseLink instanceof HTMLAnchorElement)) {
    console.warn("Release Link element must be an HTML anchor element");
    return;
  }

  updateNotification.style.display = "block";
  releaseLink.href = info.releaseUrl;
  releaseLink.onclick = (e) => {
    e.preventDefault();
    // @ts-ignore
    window.api.openExternal(info.releaseUrl);
  };
});

/**
 * Generates a random gray color in hexadecimal format
 * @returns {string} Hex color code
 */
function getRandomGrayColor() {
  const grayValue = Math.floor(Math.random() * 100);
  return `#${grayValue.toString(16).padStart(2, "0").repeat(3)}`;
}

/**
 * Generates a random color in hexadecimal format
 * @returns {string} Hex color code
 */
function getRandomColor() {
  const randomColor = Math.floor(Math.random() * 16777215).toString(16);
  return `#${randomColor.padStart(6, "0")}`;
}

/**
 * Updates the stroke color of the nodetool icon
 * @returns {void}
 */
function updateStroke() {
  const icon = document.querySelector(".nodetool-icon");
  if (!(icon instanceof HTMLElement)) {
    console.warn("Icon element not found or invalid");
    return;
  }

  icon.style.setProperty("--stroke-color", getRandomGrayColor());
}

/**
 * Updates the fill color of the nodetool icon
 * @returns {void}
 */
function updateFill() {
  const icon = document.querySelector(".nodetool-icon");
  if (!(icon instanceof HTMLElement)) {
    console.warn("Icon element not found or invalid");
    return;
  }

  icon.style.setProperty("--fill-color", getRandomGrayColor());
}

function clearAllAnimations() {
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

function startIconAnimations() {
  updateStroke(); // Initial stroke update

  strokeInterval.current = setInterval(updateStroke, 5000);

  setTimeout(() => {
    fillInterval.current = setInterval(updateFill, 5000);
  }, 60000 + 2500);

  setTimeout(() => {
    colorfulStrokeInterval.current = setInterval(() => {
      const icon = document.querySelector(".nodetool-icon");
      if (!(icon instanceof HTMLElement)) {
        console.warn("Icon element not found or invalid");
        return;
      }
      icon.style.setProperty("--stroke-color", getRandomColor());
    }, 5000);
  }, 5 * 60000);

  setTimeout(() => {
    colorfulFillInterval.current = setInterval(() => {
      const icon = document.querySelector(".nodetool-icon");
      if (!(icon instanceof HTMLElement)) {
        console.warn("Icon element not found or invalid");
        return;
      }
      icon.style.setProperty("--fill-color", getRandomColor());
    }, 5000);
  }, 10 * 60000 + 2500);
}
