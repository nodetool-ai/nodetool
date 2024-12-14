const fs = require('fs').promises;

/**
 * Check file/directory permissions and accessibility
 * @param {string} path - Path to check
 * @param {number} mode - Permission mode to check (fs.constants.R_OK, W_OK, etc)
 * @returns {Promise<{accessible: boolean, error: string|null}>}
 */
async function checkPermissions(path, mode) {
  try {
    await fs.access(path, mode);
    return { accessible: true, error: null };
  } catch (error) {
    let errorMsg = `Cannot access ${path}: `;
    if (error.code === 'ENOENT') {
      errorMsg += 'File/directory does not exist';
    } else if (error.code === 'EACCES') {
      errorMsg += 'Permission denied';
    } else {
      errorMsg += error.message;
    }
    return { accessible: false, error: errorMsg };
  }
}

async function fileExists(filePath) {
  const { accessible } = await checkPermissions(filePath, fs.constants.F_OK);
  return accessible;
}

module.exports = {
  checkPermissions,
  fileExists
}; 