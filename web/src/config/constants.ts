// APP
export const APP_NAME = "nodetool";
export const VERSION = "0.6.3-rc.17";

// TOOLTIPS
export const TOOLTIP_ENTER_DELAY = 700;
export const TOOLTIP_LEAVE_DELAY = 0;
export const TOOLTIP_ENTER_NEXT_DELAY = 350;

export const DEBUG_RENDER_LOGGING = process.env.NODE_ENV !== "production";

// NOTIFICATIONS
export const NOTIFICATIONS_LIST_MAX_ITEMS = 100;

// CHAT
export const CHAT_HISTORY_AMOUNT = 10;

// EDITOR
export const DUPLICATE_SPACING = 50;
export const MIN_ZOOM = 0.12;
export const MAX_ZOOM = 4.0;
export const ZOOMED_OUT = 0.35;

// MODEL
export const DEFAULT_MODEL = "gpt-oss:20b";

// SEARCH
export const SEARCH_DEBOUNCE_MS = 500;
export const FUSE_THRESHOLD = 0.35;
export const FUSE_MIN_MATCH_FACTOR = 0.5;

// IMAGE PRESETS
export type PresetOption = {
    label: string;
    width: number;
    height: number;
    aspectRatio: string;
    category: string;
    description?: string;
};

export const IMAGE_SIZE_PRESETS: PresetOption[] = [
    // Phone
    { label: "440x956", width: 440, height: 956, aspectRatio: "19.5:9", category: "Phone", description: "iPhone 16 Pro Max" },
    { label: "402x874", width: 402, height: 874, aspectRatio: "19.5:9", category: "Phone", description: "iPhone 16 Pro" },
    { label: "390x844", width: 390, height: 844, aspectRatio: "19.5:9", category: "Phone", description: "iPhone 16" },
    { label: "375x667", width: 375, height: 667, aspectRatio: "16:9", category: "Phone", description: "iPhone SE" },
    { label: "360x800", width: 360, height: 800, aspectRatio: "20:9", category: "Phone", description: "Android Large" },
    { label: "360x640", width: 360, height: 640, aspectRatio: "16:9", category: "Phone", description: "Android Small" },

    // Tablet
    { label: "1032x1376", width: 1032, height: 1376, aspectRatio: "3:4", category: "Tablet", description: "iPad Pro 13\"" },
    { label: "834x1194", width: 834, height: 1194, aspectRatio: "3:4", category: "Tablet", description: "iPad Pro 11\"" },
    { label: "744x1133", width: 744, height: 1133, aspectRatio: "2:3", category: "Tablet", description: "iPad Mini" },
    { label: "1368x912", width: 1368, height: 912, aspectRatio: "3:2", category: "Tablet", description: "Surface Pro 8" },
    { label: "800x1280", width: 800, height: 1280, aspectRatio: "10:16", category: "Tablet", description: "Android Tablet" },

    // Desktop
    { label: "1440x1024", width: 1440, height: 1024, aspectRatio: "16:10", category: "Desktop", description: "Desktop" },
    { label: "1512x982", width: 1512, height: 982, aspectRatio: "16:10", category: "Desktop", description: "MacBook Pro 14\"" },
    { label: "1728x1117", width: 1728, height: 1117, aspectRatio: "16:10", category: "Desktop", description: "MacBook Pro 16\"" },
    { label: "2240x1260", width: 2240, height: 1260, aspectRatio: "16:9", category: "Desktop", description: "iMac 24\"" },
    { label: "2880x1920", width: 2880, height: 1920, aspectRatio: "3:2", category: "Desktop", description: "Surface Studio" },

    // Watch
    { label: "410x502", width: 410, height: 502, aspectRatio: "4:5", category: "Watch", description: "Apple Watch Ultra" },
    { label: "396x484", width: 396, height: 484, aspectRatio: "4:5", category: "Watch", description: "Series 9 (45mm)" },
    { label: "352x430", width: 352, height: 430, aspectRatio: "4:5", category: "Watch", description: "Series 9 (41mm)" },

    // Presentation
    { label: "1920x1080", width: 1920, height: 1080, aspectRatio: "16:9", category: "Presentation", description: "Slide" },
    { label: "1024x768", width: 1024, height: 768, aspectRatio: "4:3", category: "Presentation", description: "Slide" },

    // Social Media
    { label: "1080x1080", width: 1080, height: 1080, aspectRatio: "1:1", category: "Social Media", description: "Instagram Post" },
    { label: "1080x1920", width: 1080, height: 1920, aspectRatio: "9:16", category: "Social Media", description: "Instagram Story" },
    { label: "1200x630", width: 1200, height: 630, aspectRatio: "1.91:1", category: "Social Media", description: "Facebook Post" },
    { label: "820x312", width: 820, height: 312, aspectRatio: "2.6:1", category: "Social Media", description: "Facebook Cover" },
    { label: "1200x675", width: 1200, height: 675, aspectRatio: "16:9", category: "Social Media", description: "Twitter Post" },
    { label: "1280x720", width: 1280, height: 720, aspectRatio: "16:9", category: "Social Media", description: "YouTube Thumbnail" },

    // Paper
    { label: "595x842", width: 595, height: 842, aspectRatio: "1:1.414", category: "Paper", description: "A4" },
    { label: "420x595", width: 420, height: 595, aspectRatio: "1:1.414", category: "Paper", description: "A5" },
    { label: "298x420", width: 298, height: 420, aspectRatio: "1:1.414", category: "Paper", description: "A6" },
    { label: "612x792", width: 612, height: 792, aspectRatio: "1:1.29", category: "Paper", description: "Letter" },
];
