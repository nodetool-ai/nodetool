// APP
export const APP_NAME = "nodetool";
export const VERSION = "0.6.3-rc.33";

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
    // SD (Standard Definition)
    { label: "NTSC SD", width: 720, height: 480, aspectRatio: "3:2", category: "SD", description: "North America" },
    { label: "PAL SD", width: 720, height: 576, aspectRatio: "5:4", category: "SD", description: "Europe Asia" },

    // HD (High Definition)
    { label: "720p HD", width: 1280, height: 720, aspectRatio: "16:9", category: "HD", description: "HD Ready" },
    { label: "1080p Full HD", width: 1920, height: 1080, aspectRatio: "16:9", category: "HD", description: "" },

    // 2K
    { label: "DCI 2K Cinema", width: 2048, height: 1080, aspectRatio: "1.9:1", category: "2K", description: "" },
    { label: "QHD 2K", width: 2560, height: 1440, aspectRatio: "16:9", category: "2K", description: "1440p" },

    // UHD/4K
    { label: "4K UHD", width: 3840, height: 2160, aspectRatio: "16:9", category: "UHD/4K", description: "" },
    { label: "DCI 4K Cinema", width: 4096, height: 2160, aspectRatio: "1.9:1", category: "UHD/4K", description: "" },

    // 5K
    { label: "iMac 5K", width: 5120, height: 2880, aspectRatio: "16:9", category: "5K", description: "" },

    // 6K
    { label: "Cinema 6K RED BMPCC", width: 6144, height: 3160, aspectRatio: "1.94:1", category: "6K", description: "" },
    { label: "Canon R5C 6K", width: 6016, height: 3200, aspectRatio: "1.88:1", category: "6K", description: "" },

    // 8K
    { label: "8K UHD", width: 7680, height: 4320, aspectRatio: "16:9", category: "8K", description: "" },
    { label: "8K DCI Cinema", width: 8192, height: 4320, aspectRatio: "1.9:1", category: "8K", description: "" },

    // Vertical Video
    { label: "9:16 Social Media", width: 1080, height: 1920, aspectRatio: "9:16", category: "Vertical Video", description: "" },
    { label: "4K Vertical", width: 2160, height: 3840, aspectRatio: "9:16", category: "Vertical Video", description: "" },

    // Specialty Ratios
    { label: "2.39:1 Cinema Anamorphic", width: 2048, height: 858, aspectRatio: "2.39:1", category: "Specialty Ratios", description: "" },
    { label: "1.85:1 Cinema", width: 1998, height: 1080, aspectRatio: "1.85:1", category: "Specialty Ratios", description: "" },
    { label: "2.39:1 Cinema 4K", width: 4096, height: 1716, aspectRatio: "2.39:1", category: "Specialty Ratios", description: "" },

    // Devices (Phone)
    { label: "iPhone 16 Pro Max", width: 440, height: 956, aspectRatio: "19.5:9", category: "Phone", description: "" },
    { label: "iPhone 16 Pro", width: 402, height: 874, aspectRatio: "19.5:9", category: "Phone", description: "" },
    { label: "iPhone 16", width: 390, height: 844, aspectRatio: "19.5:9", category: "Phone", description: "" },
    { label: "iPhone SE", width: 375, height: 667, aspectRatio: "16:9", category: "Phone", description: "" },
    { label: "Android Large", width: 360, height: 800, aspectRatio: "20:9", category: "Phone", description: "" },

    // Tablet
    { label: "iPad Pro 13\"", width: 1032, height: 1376, aspectRatio: "3:4", category: "Tablet", description: "" },
    { label: "iPad Pro 11\"", width: 834, height: 1194, aspectRatio: "3:4", category: "Tablet", description: "" },
    { label: "iPad Mini", width: 744, height: 1133, aspectRatio: "2:3", category: "Tablet", description: "" },
    { label: "Surface Pro 8", width: 1368, height: 912, aspectRatio: "3:2", category: "Tablet", description: "" },

    // Desktop
    { label: "MacBook Pro 14\"", width: 1512, height: 982, aspectRatio: "16:10", category: "Desktop", description: "" },
    { label: "MacBook Pro 16\"", width: 1728, height: 1117, aspectRatio: "16:10", category: "Desktop", description: "" },
    { label: "iMac 24\"", width: 2240, height: 1260, aspectRatio: "16:9", category: "Desktop", description: "" },

    // Social Media
    { label: "Instagram Post", width: 1080, height: 1080, aspectRatio: "1:1", category: "Social Media", description: "" },
    { label: "Facebook Post", width: 1200, height: 630, aspectRatio: "1.91:1", category: "Social Media", description: "" },
    { label: "Twitter Post", width: 1200, height: 675, aspectRatio: "16:9", category: "Social Media", description: "" },
    { label: "YouTube Thumbnail", width: 1280, height: 720, aspectRatio: "16:9", category: "Social Media", description: "" },

    // Paper
    { label: "A4", width: 595, height: 842, aspectRatio: "1:1.414", category: "Paper", description: "" },
    { label: "A5", width: 420, height: 595, aspectRatio: "1:1.414", category: "Paper", description: "" },
    { label: "Letter", width: 612, height: 792, aspectRatio: "1:1.29", category: "Paper", description: "" },
];
