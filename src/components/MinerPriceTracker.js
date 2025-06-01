import React, {
  useState,
  useEffect,
  useMemo,
  useCallback,
  useRef,
} from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar,
} from "recharts";
import {
  Upload,
  Download,
  Filter,
  TrendingUp,
  Activity,
  DollarSign,
  Zap,
  AlertCircle,
  Database,
  Search,
  FileSpreadsheet,
  Sparkles,
  Eye,
  EyeOff,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  FileWarning,
  Save,
  Trash2,
  Clock,
  RotateCcw, // For Rollback
  Layers, // For Merge Strategy
  CheckCircle, // For Success
  XCircle, // For Error
  Loader2, // For Processing
  Archive, // For Cleanup
} from "lucide-react";
import Papa from "papaparse";
import * as XLSX from "xlsx";

// Storage configuration
const STORAGE_VERSION = "1.1.0"; // Incremented version for new structure
const STORAGE_KEYS = {
  miners: "minerTracker_miners",
  priceHistory: "minerTracker_priceHistory",
  knownMiners: "minerTracker_knownMiners",
  minerSpecs: "minerTracker_minerSpecs",
  uploadHistory: "minerTracker_uploadHistory",
  maxPrices: "minerTracker_maxPrices",
  previousPrices: "minerTracker_previousPrices",
  version: "minerTracker_version",
  lastSaved: "minerTracker_lastSaved",
  dataMigrationV2: "minerTracker_dataMigrationV2_TimestampAndIntraday", // Migration flag
};

// Compression utilities (remains the same)
const compressData = (data) => {
  try {
    const jsonString = JSON.stringify(data);
    return jsonString; // Simple JSON stringify, was: .replace(/\s+/g, " ").trim();
  } catch (error) {
    console.error("Compression error:", error);
    return JSON.stringify(data);
  }
};
const decompressData = (data) => {
  try {
    return JSON.parse(data);
  } catch (error) {
    console.error("Decompression error:", error);
    return null;
  }
};

// Storage utilities (remains the same)
const storageUtils = {
  save: (key, data) => {
    try {
      const compressed = compressData(data);
      localStorage.setItem(key, compressed);
      localStorage.setItem(STORAGE_KEYS.lastSaved, new Date().toISOString());
      return true;
    } catch (error) {
      if (error.name === "QuotaExceededError" || (error.message && error.message.includes("quota"))) {
        console.error("LocalStorage quota exceeded for key:", key);
        alert("Error: LocalStorage quota exceeded. Unable to save data. Please clear some space or export your data.");
        return false;
      }
      console.error("Storage error for key ", key, ":", error);
      return false;
    }
  },
  load: (key, defaultValue = null) => {
    try {
      const item = localStorage.getItem(key);
      if (!item) return defaultValue;
      return decompressData(item) || defaultValue;
    } catch (error) {
      console.error("Load error for key ", key, ":", error);
      return defaultValue;
    }
  },
  remove: (key) => {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error("Remove error for key ", key, ":", error);
      return false;
    }
  },
  clearAll: () => {
    try {
      Object.values(STORAGE_KEYS).forEach((key) => {
        // Don't clear migration flag by default unless intended
        if (key !== STORAGE_KEYS.dataMigrationV2) {
            localStorage.removeItem(key);
        }
      });
      localStorage.removeItem(STORAGE_KEYS.version); // Clear version too
      localStorage.removeItem(STORAGE_KEYS.dataMigrationV2); // Clear migration flag too
      return true;
    } catch (error) {
      console.error("Clear all error:", error);
      return false;
    }
  },
  getStorageSize: () => {
    let total = 0;
    for (const key in localStorage) {
      if (localStorage.hasOwnProperty(key)) {
        total += (localStorage[key].length || 0) + (key.length || 0);
      }
    }
    return (total / 1024).toFixed(2); // KB
  },
};

const MinerPriceTracker = () => {
  const [miners, setMiners] = useState([]); // Current snapshot of miners for display
  const [priceHistory, setPriceHistory] = useState({}); // { minerName: { daily: [], intraday: [] } }
  const [selectedMiner, setSelectedMiner] = useState(null);
  const [filterEfficiency, setFilterEfficiency] = useState(20);
  const [searchTerm, setSearchTerm] = useState("");
  const [uploadDate, setUploadDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [knownMiners, setKnownMiners] = useState(new Set());
  const [newMinersLastUpload, setNewMinersLastUpload] = useState(new Set()); // Miners new in the very last upload batch
  const [showOnlyNew, setShowOnlyNew] = useState(false);
  const [minerSpecs, setMinerSpecs] = useState({});
  const [uploadHistory, setUploadHistory] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: "efficiency", direction: "asc" });
  const [maxPrices, setMaxPrices] = useState({});
  const [previousPrices, setPreviousPrices] = useState({}); // Stores price of a miner before its last update in the table
  const [lastSaved, setLastSaved] = useState(null);
  const [saveStatus, setSaveStatus] = useState("saved");
  const saveTimeoutRef = useRef(null);

  // --- Phase 2: Merge Strategy ---
  const [mergeStrategy, setMergeStrategy] = useState("merge"); // 'replace', 'merge', 'append'
  const [showUploadPreview, setShowUploadPreview] = useState(false);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [stagedNewMiners, setStagedNewMiners] = useState(null); // Parsed data from file, awaiting confirmation
  const [stagedUploadFileName, setStagedUploadFileName] = useState("");

  // --- UI State Management ---
  const [isProcessing, setIsProcessing] = useState(false);
  const [operationStatus, setOperationStatus] = useState({ message: '', type: 'info' }); // type: 'info', 'success', 'error'

  const powerDatabase = {
    // S21 Series (Most Efficient)
    "Antminer S21e XP Hyd 3U - 860 TH/s": 11180,
    "Antminer S23 Hyd - 580 TH/s": 5510,
    "Antminer S23 Hyd 3U - 1160 TH/s": 11020,
    "Antminer S19 XP Hyd - 512 TH/s": 10600,
    "Antminer S21 XP+ Hyd - 500 TH/s": 5500,
    "Antminer S19XP Hyd（Mix） - 473TH/s": 5676,
    "Antminer S19XP Hyd - 473TH/s": 5676,
    "Antminer S21 XP Hyd - 473 TH/s": 5676,
    "Antminer S21XP Hydro - 470 TH/s": 5676,
    "Antminer S21 Hyd - 395 TH/s": 6320,
    "Antminer S21+ Hydro - 395 TH/s": 6320,
    "Antminer S21+ Hydro - 358 TH/s": 5728,
    "Antminer S21 Hyd - 358 TH/s": 5728,
    "Antminer S21+ Hydro - 338 TH/s": 5574,
    "Antminer S21 Hydro - 335 TH/s": 5360,
    "Antminer S21 Hydro - 319 TH/s": 5104,
    "Antminer S21 Hydro - 302 TH/s": 4832,
    "Antminer S19XP+ Hyd - 293 TH/s": 5301,
    "Bitmain Antminer S21e Hyd - 288 TH/s": 4896,
    "Antminer S19 XP+ Hyd - 279 TH/s": 5301,
    "Antminer S21XP - 270 TH/s": 3645,
    "Antminer S21xp（Mix） - 270 TH/s": 3645,
    "Antminer S19 XP Hyd - 257 TH/s": 5345,
    "Antminer S19XP Hyd - 246 TH/s": 5346,
    "Antminer T21 - 233 TH/s": 3610,
    "Antminer S21+ - 235 TH/s": 3877,
    "Antminer S21 Pro（Mix） - 234 TH/s": 3510,
    "Antminer S21 Pro - 234 TH/s": 3510,
    "Antminer S21 Pro - 245 TH/s": 3675,
    "Antminer S21+ - 225 TH/s": 3712,
    "Antminer S21+ - 216 TH/s": 3564,
    "Antminer S21 Pro - 220 TH/s": 3300,
    "Antminer S21 - 200 TH/s": 3500,
    "Antminer S21 - 188 TH/s": 3290,
    "Antminer T21 - 190 TH/s": 3610,
    "Antminer T21 - 186 TH/s": 3534,
    "Antminer T21 - 180 TH/s": 3420,
    "Antminer S21 - 20 TH/s - shared": 350,
    // S19 Series
    "Antminer S19pro+ hyd - 198 TH/s": 5445,
    "Antminer S19pro hyd - 184 TH/s": 5060,
    "Antminer S19pro+ hyd - 191 TH/s": 5252,
    "Antminer S19 Pro+ Hyd - 177 TH/s": 5221,
    "Antminer S19j XP - 151 TH/s": 3247,
    "Antminer S19 XP - 134 TH/s": 2881,
    "Antminer S19 XP - 141 TH/s": 3010,
    "Antminer S19jpro+ - 120 TH/s": 3300,
    "Antminer S19J PRO+ - 117 TH/s": 3300,
    "Antminer S19 kpro - 115 TH/s": 2645,
    "Antminer S19 kpro - 110 TH/s": 2420,
    "BITMAIN ANTMINER S19jpro - 110 TH/s": 3250,
    "Antminer S19pro - 110 TH/s": 3250,
    "Antminer S19pro - 104 TH/s": 3068,
    "Antminer S19pro - 100 TH/s": 2950,
    "Antminer S19 j pro - 104 TH/s": 3068,
    "Antminer S19J PRO - 96 TH/s": 2832,
    "BITMAIN ANTMINER S19K Pro - 95 TH/s": 2760,
    "Antminer S19 - 95 TH/s": 3250,
    "Antminer S19 - 90 TH/s": 3420,
    "Antminer S19 - 86 TH/s": 3100,
    "Antminer S19 - 82 TH/s": 2950,
    "Antminer S19 - 78 TH/s": 2808,
    // Whatsminer M Series
    "Whatsminer M63S++ - 478 TH/s": 10000,
    "Whatsminer M66S++ - 356 TH/s": 5514,
    "Whatsminer M66S+ - 318 TH/s": 5406,
    "Whatsminer M66S - 298 TH/s": 5364,
    "Whatsminer M66 - 280 TH/s": 5492,
    "Whatsminer M63 - 334 TH/s": 6680,
    "Whatsminer M63S - 390 TH/s": 7800,
    "Whatsminer M63s - 406 TH/s": 7308,
    "Whatsminer M63 - 360 TH/s": 7200,
    "Whatsminer M66s - 310 TH/s": 5580,
    "Whatsminer M61 - 208 TH/s": 7072,
    "Whatsminer M60S（MIX） - 178 TH/s": 3204,
    "Whatsminer M60S++ - 220 TH/s": 3410,
    "Whatsminer M60S+ - 190 TH/s": 3230,
    "Whatsminer M60s - 184 TH/s": 3404,
    "Whatsminer M60 - 170 TH/s": 3383,
    // Exact name matches for user's data
    "WHATSMINER M50S+ - 138 TH/s": 3312,
    "Whatsminer M50S+ - 138 TH/s": 3312,
    "WHATSMINER M50 - 124 TH/s": 3224,
    "Whatsminer M50 - 124 TH/s": 3224,
    "WHATSMINER M30S++ - 96 TH/s": 3456,
    "Whatsminer M30S++ - 96 TH/s": 3456,
    "WHATSMINER M30S++ - 90 TH/s": 3456,
    "Whatsminer M30S++ - 90 TH/s": 3456,
    "WHATSMINER M30S++ - 85 TH/s": 3456,
    "Whatsminer M30S++ - 85 TH/s": 3456,
    "Whatsminer M50S - 134 TH/s": 3484,
    "Whatsminer M50S - 132 TH/s": 3432,
    "Whatsminer M50S - 128 TH/s": 3328,
    "WHATSMINER M50 - 118 TH/s": 3304,
    "Whatsminer M50s++ - 160 TH/s": 3520,
    "Whatsminer M53s - 260 TH/s": 6760,
    "Whatsminer M53 - 230 TH/s": 6670,
    "WHATSMINER M30S+ - 100 TH/s": 3400,
    "WHATSMINER M30S++ - 112 TH/s": 3472,
    // Avalon Series
    "Avalon A1566I - 249 TH/s": 4500,
    "Avalon A1566 - 203 TH/s": 3755,
    "Avalon A1566 - 200 TH/s": 3700,
    "Avalon A1566 - 197 TH/s": 3649,
    "Avalon A1566 - 194 TH/s": 3588,
    "Avalon A1566 - 191 TH/s": 3534,
    "Avalon A1566 - 185 TH/s": 3420,
    "Avalon A1566 - 188 TH/s": 3476,
    "Avalon A1566 - 182 TH/s": 3364,
    "Avalon A15XP-206T - 206 TH/s": 3667,
    "Avalon A15 Pro - 218 TH/s": 3662,
    "Avalon A15XP - 206 TH/s": 3667,
    "Avalon A15 - 194 TH/s": 3647,
    "Avalon A1466 - 150 TH/s": 3230,
    "Avalon A1366 - 130 TH/s": 3250,
    "Avalon A1366I - 122 TH/s": 3570,
    "Avalon A1346 - 107 TH/s": 3300,
    "Avalon A1346 - 110 TH/s": 3300,
    "Avalon A1246 - 85 TH/s": 3420,
    "Avalon Mini 3 - 37.5 TH/s": 800,
    "Avalon Nano 3S - 6 TH/s": 140,
    "Avalon Nano 3 - 4 TH/s": 140,
    // SealMiner A2 Series
    "SealMiner A2 - 234 TH/s": 3861,
    "SealMiner A2 - 232 TH/s": 3828,
    "SealMiner A2 - 230 TH/s": 3795,
    "SealMiner A2 - 228 TH/s": 3762,
    "SealMiner A2 - 226 TH/s": 3729,
    "SealMiner A2 - 224 TH/s": 3696,
    "SealMiner A2 - 222 TH/s": 3663,
    "SealMiner A2 - 220 TH/s": 3630,
    "Bitdeer SealMiner A2 - 226 TH/s": 3729,
    "Bitdeer SealMiner A2 Hyd - 446 TH/s": 7359,
    "Bitdeer SealMiner A2 Pro Air - 255 TH/s": 3790,
    "Bitdeer SealMiner A2 Pro Hyd - 500 TH/s": 7450,
    // Bitaxe Series (Lucky Miners)
    "Bitaxe Gamma 601 - Lucky miner - 1.2 TH/s": 17,
    "Bitaxe Gamma 601": 17,
    "Bitaxe Touch": 22,
    "Bitaxe Supra Hex 701": 90,
    "Lucky Miner LV07": 25,
    "Lucky Miner LV08": 120,
    "NerdMiner NerdQaxe++": 72,
  };

  const setStatus =(message, type = 'info', duration = 3000) => {
    setOperationStatus({ message, type });
    if (duration) {
        setTimeout(() => setOperationStatus({ message: '', type: 'info'}), duration);
    }
  }

  // --- Phase 1: Migration Strategy ---
  const migrateExistingData = useCallback(() => {
    if (storageUtils.load(STORAGE_KEYS.dataMigrationV2)) {
      return; // Migration already performed
    }

    console.log("Attempting data migration for new PriceHistory structure...");
    const oldRawHistory = storageUtils.load(STORAGE_KEYS.priceHistory, {});
    if (Object.keys(oldRawHistory).length === 0) {
      storageUtils.save(STORAGE_KEYS.dataMigrationV2, true);
      console.log("No price history to migrate.");
      return;
    }

    // Check if data is already in new format (e.g., if migration was partial or manual)
    const firstMinerKey = Object.keys(oldRawHistory)[0];
    if (firstMinerKey && oldRawHistory[firstMinerKey] && typeof oldRawHistory[firstMinerKey] === 'object' && oldRawHistory[firstMinerKey].hasOwnProperty('intraday')) {
      console.log("Price history already seems to be in the new format. Marking migration as complete.");
      storageUtils.save(STORAGE_KEYS.dataMigrationV2, true);
      return;
    }

    const newStructuredHistory = {};
    let migratedEntriesCount = 0;
    let totalMinersMigrated = 0;

    Object.entries(oldRawHistory).forEach(([minerName, entries]) => {
      if (Array.isArray(entries)) { // Old format: minerName: [entry, entry, ...]
        totalMinersMigrated++;
        const intradayEntries = entries.map((entry, index) => {
          migratedEntriesCount++;
          const entryDate = entry.date || new Date().toISOString().split("T")[0];
          return {
            ...entry,
            date: entryDate,
            // Ensure timestamp is unique and fallback if missing
            timestamp: entry.timestamp || `${entryDate}T12:00:00.000Z`,
            // Ensure uploadId is unique and fallback if missing
            uploadId: entry.uploadId || `legacy_${entryDate}_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 7)}`,
          };
        }).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)); // Sort by timestamp ASC

        const dailyEntriesMap = new Map();
        intradayEntries.forEach(entry => {
          const existing = dailyEntriesMap.get(entry.date);
          if (!existing || new Date(entry.timestamp) >= new Date(existing.timestamp)) {
            dailyEntriesMap.set(entry.date, entry);
          }
        });
        const dailyEntries = Array.from(dailyEntriesMap.values()).sort((a, b) => new Date(a.date) - new Date(b.date));

        newStructuredHistory[minerName] = {
          daily: dailyEntries,
          intraday: intradayEntries,
        };
      } else if (typeof entries === 'object' && entries !== null && entries.hasOwnProperty('intraday')) {
        // Already in new format, carry over
        newStructuredHistory[minerName] = entries;
      } else {
         console.warn(`Skipping migration for miner "${minerName}": unknown data format.`, entries);
      }
    });

    if (totalMinersMigrated > 0) {
      setPriceHistory(newStructuredHistory); // Update state immediately
      storageUtils.save(STORAGE_KEYS.priceHistory, newStructuredHistory); // Save migrated data
      console.log(`Successfully migrated ${migratedEntriesCount} price entries for ${totalMinersMigrated} miners to the new structure.`);
      setStatus(`Data migration complete for ${totalMinersMigrated} miners.`, 'success', 5000);
    } else {
      console.log("No data in old format found to migrate.");
    }
    storageUtils.save(STORAGE_KEYS.dataMigrationV2, true); // Mark migration as done
  }, []); // No direct state dependencies for definition, but will trigger setPriceHistory

  // Load data from localStorage on component mount
  useEffect(() => {
    const migrateFromWindowStorage = () => {
      // ... (existing migration from window storage, if any - current code has this)
    };
    migrateFromWindowStorage(); // Assuming this is still relevant from user's code.

    migrateExistingData(); // Run the new data migration

    const loadedVersion = storageUtils.load(STORAGE_KEYS.version);
    if (loadedVersion && loadedVersion !== STORAGE_VERSION) {
      console.warn(
        `Storage version mismatch. Current: ${STORAGE_VERSION}, Stored: ${loadedVersion}. Consider further migrations if needed.`
      );
      // Potentially trigger other migration steps based on version diff
    }

    setMiners(storageUtils.load(STORAGE_KEYS.miners, []));
    // Price history is set by migration or loaded if already new format
    if (!storageUtils.load(STORAGE_KEYS.dataMigrationV2)) { // If migration hasn't run yet (e.g. first load after this code update)
        setPriceHistory(storageUtils.load(STORAGE_KEYS.priceHistory, {})); // Load whatever is there, migration will fix it
    } else { // Migration has run, load the (potentially) new format
        const loadedHistory = storageUtils.load(STORAGE_KEYS.priceHistory, {});
        // Basic check to ensure it's the new structure, otherwise migration might have failed or data is corrupt
        const firstKey = Object.keys(loadedHistory)[0];
        if (firstKey && loadedHistory[firstKey] && !loadedHistory[firstKey].hasOwnProperty('intraday')) {
            console.warn("Loaded price history is not in the new format despite migration flag. Re-attempting migration or using empty.");
            // This case should ideally be handled by migrateExistingData, but as a safeguard:
            // migrateExistingData(); // or setPriceHistory({});
        } else {
            setPriceHistory(loadedHistory);
        }
    }
    setKnownMiners(new Set(storageUtils.load(STORAGE_KEYS.knownMiners, [])));
    setMinerSpecs(storageUtils.load(STORAGE_KEYS.minerSpecs, {}));
    setUploadHistory(storageUtils.load(STORAGE_KEYS.uploadHistory, []));
    setMaxPrices(storageUtils.load(STORAGE_KEYS.maxPrices, {}));
    setPreviousPrices(storageUtils.load(STORAGE_KEYS.previousPrices, {}));
    setLastSaved(storageUtils.load(STORAGE_KEYS.lastSaved));

    storageUtils.save(STORAGE_KEYS.version, STORAGE_VERSION);
  }, [migrateExistingData]);

  // Debounced save function
  const debouncedSave = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    setSaveStatus("saving");
    saveTimeoutRef.current = setTimeout(() => {
      const success =
        storageUtils.save(STORAGE_KEYS.miners, miners) &&
        storageUtils.save(STORAGE_KEYS.priceHistory, priceHistory) &&
        storageUtils.save(STORAGE_KEYS.knownMiners, Array.from(knownMiners)) &&
        storageUtils.save(STORAGE_KEYS.minerSpecs, minerSpecs) &&
        storageUtils.save(STORAGE_KEYS.uploadHistory, uploadHistory) &&
        storageUtils.save(STORAGE_KEYS.maxPrices, maxPrices) &&
        storageUtils.save(STORAGE_KEYS.previousPrices, previousPrices);

      if (success) {
        setSaveStatus("saved");
        setLastSaved(new Date().toISOString());
      } else {
        setSaveStatus("error");
        // Alert is handled by storageUtils.save on QuotaExceededError
      }
    }, 1000);
  }, [miners, priceHistory, knownMiners, minerSpecs, uploadHistory, maxPrices, previousPrices]);

  // Auto-save on data changes
  useEffect(() => {
    // Only save if there's actual data or history to prevent saving empty defaults on first load too early
    if (miners.length > 0 || Object.keys(priceHistory).length > 0 || uploadHistory.length > 0) {
      debouncedSave();
    }
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [miners, priceHistory, knownMiners, minerSpecs, uploadHistory, maxPrices, previousPrices, debouncedSave]);

  // Clear all data with confirmation
  const clearAllData = () => {
    const storageSize = storageUtils.getStorageSize();
    const confirmMessage = `Are you sure you want to clear all data?\n\nThis will permanently delete:\n- ${miners.length} miners\n- ${Object.keys(priceHistory).length} price histories\n- ${uploadHistory.length} upload records\n\nCurrent storage size: ${storageSize} KB\n\nThis action cannot be undone!`;
    if (window.confirm(confirmMessage)) {
      if (window.confirm("Are you REALLY sure? This will delete everything!")) {
        const success = storageUtils.clearAll();
        if (success) {
          setMiners([]);
          setPriceHistory({});
          setKnownMiners(new Set());
          setNewMinersLastUpload(new Set());
          setMinerSpecs({});
          setUploadHistory([]);
          setMaxPrices({});
          setPreviousPrices({});
          setSelectedMiner(null);
          setLastSaved(null);
          setSaveStatus("saved"); // Reset save status
          storageUtils.save(STORAGE_KEYS.version, STORAGE_VERSION); // Re-save current version
          setStatus("All data has been cleared successfully!", 'success');
        } else {
          setStatus("Failed to clear data. Please try again.", 'error');
        }
      }
    }
  };

  // --- Phase 1: Modify parseDataRows ---
  const parseDataRows = (rows, dateForData) => {
    const parsedMinerData = [];
    const uploadTime = new Date().toISOString(); // Timestamp for the entire upload operation

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 2) continue; // Basic check for some data
      let miner = {};

      // Handle different data formats (simplified from user's code)
      if (typeof row[0] === "string" && row[0].includes("http")) {
        miner.imageUrl = row[0];
        miner.name = row[1];
        const hashrateMatch = (row[2] || "").toString().match(/(\d+\.?\d*)\s*(TH\/s|GH\/s)/i);
        if (hashrateMatch) {
          miner.hashrate = parseFloat(hashrateMatch[1]);
          if (hashrateMatch[2].toLowerCase() === "gh/s") miner.hashrate /= 1000;
        }
        miner.algorithm = (row[3] || "").toString().replace("Algo:", "").trim();
        const priceMatch = (row[4] || "").toString().match(/(\d+\.?\d*)/);
        if (priceMatch) miner.price = parseFloat(priceMatch[1]);
        const earningsMatch = (row[5] || "").toString().match(/\$(\d+\.?\d*)/);
        if (earningsMatch) miner.dailyEarnings = parseFloat(earningsMatch[1]);
        if (row.length > 7) { // Power and efficiency might be further
          const powerMatch = (row[8] || "").toString().match(/(\d+)/);
          if (powerMatch) miner.powerConsumption = parseInt(powerMatch[1]);
          const efficiencyMatch = (row[9] || "").toString().match(/(\d+\.?\d*)/);
          if (efficiencyMatch) miner.efficiency = parseFloat(efficiencyMatch[1]);
        }
      } else { // Standard format assumption
        miner.name = String(row[0] || '').trim();
        miner.hashrate = parseFloat(row[1]) || 0;
        miner.price = parseFloat(row[2]) || 0;
        miner.dailyEarnings = parseFloat(row[3]) || 0;
        miner.powerConsumption = parseInt(row[4]) || 0;
        miner.efficiency = parseFloat(row[5]) || null;
      }

      if (!miner.powerConsumption && powerDatabase[miner.name]) {
        miner.powerConsumption = powerDatabase[miner.name];
      }
      if (miner.powerConsumption && miner.hashrate && (miner.efficiency === null || miner.efficiency === undefined || miner.efficiency === 0)) {
        miner.efficiency = miner.powerConsumption / miner.hashrate;
      }

      if (miner.name && miner.hashrate > 0 && miner.price > 0) {
        miner.date = dateForData; // Date for the data point (e.g., price on this day)
        miner.uploadTimestamp = uploadTime; // When this batch was uploaded
        miner.uploadId = `${dateForData}_${uploadTime}_${i}_${Math.random().toString(36).substring(2, 7)}`; // Unique ID for this specific data row
        parsedMinerData.push(miner);
      }
    }
    return parsedMinerData;
  };

  const parseUploadedData = async (file, date) => {
    const fileType = file.name.split(".").pop().toLowerCase();
    return new Promise((resolve, reject) => {
      if (fileType === "xlsx" || fileType === "xls") {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = e.target.result;
            const workbook = XLSX.read(data, { type: "array" });
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
            resolve(parseDataRows(jsonData, date));
          } catch (err) { reject(err); }
        };
        reader.onerror = (err) => reject(err);
        reader.readAsArrayBuffer(file);
      } else if (fileType === "csv" || fileType === "txt") {
        Papa.parse(file, {
          complete: (results) => resolve(parseDataRows(results.data, date)),
          error: (error) => {
            console.error("Error parsing CSV:", error);
            reject(error);
          },
        });
      } else {
        reject(new Error("Unsupported file type. Please use .xlsx, .xls, .csv, or .txt"));
      }
    });
  };

  // --- Phase 3: Upload Preview ---
  const generateUploadPreview = (newMinerEntries, currentMinersList, currentMergeStrategy) => {
    const preview = {
      new: [], updated: [], unchanged: [], removed: [], errors: [], warnings: [],
      summary: { newCount: 0, updatedCount: 0, unchangedCount: 0, removedCount: 0 }
    };

    newMinerEntries.forEach((newMiner, index) => {
      if (!newMiner.name || !(newMiner.price > 0) || !(newMiner.hashrate > 0)) {
        preview.errors.push(`Row ${index + 1} (Name: ${newMiner.name || 'N/A'}): Missing required fields (Name, Price > 0, Hashrate > 0) or invalid values.`);
        return;
      }

      const existing = currentMinersList.find(m => m.name === newMiner.name);
      if (!existing) {
        preview.new.push(newMiner);
        preview.summary.newCount++;
      } else {
        const priceChange = newMiner.price !== existing.price ? ((newMiner.price - existing.price) / existing.price * 100) : 0;
        // Consider other fields for "updated" status if necessary
        if (Math.abs(priceChange) < 0.01 && newMiner.hashrate === existing.hashrate) { // Example: only price change matters for this preview status
          preview.unchanged.push(newMiner.name);
          preview.summary.unchangedCount++;
        } else {
          preview.updated.push({
            name: newMiner.name,
            oldPrice: existing.price,
            newPrice: newMiner.price,
            change: parseFloat(priceChange.toFixed(1)), // Ensure number for sorting/coloring
            oldHashrate: existing.hashrate,
            newHashrate: newMiner.hashrate,
            efficiency: newMiner.efficiency,
          });
          preview.summary.updatedCount++;
        }
      }
    });

    if (currentMergeStrategy === 'replace') {
      currentMinersList.forEach(existingMiner => {
        if (!newMinerEntries.find(nm => nm.name === existingMiner.name)) {
          preview.removed.push(existingMiner.name);
          preview.summary.removedCount++;
        }
      });
    }
    return preview;
  };

  // --- Revised handleFileUpload (Error Handling, Preview Trigger) ---
  const handleFileUpload = async (event) => {
    setIsProcessing(true);
    setStatus('Reading file...', 'info', 0); // Persist until processing finishes

    const file = event.target.files[0];
    if (!file) {
      setIsProcessing(false);
      setStatus('', 'info');
      return;
    }
    
    // Reset file input value so same file can be re-uploaded after cancellation
    event.target.value = null;


    if (file.size > 10 * 1024 * 1024) { // 10MB limit
      setStatus("File too large. Please upload files smaller than 10MB.", 'error');
      setIsProcessing(false);
      setSelectedFile(null);
      return;
    }

    try {
      setSelectedFile(file); // For display purposes
      const parsedMiners = await parseUploadedData(file, uploadDate); // uploadDate from state

      if (!parsedMiners || parsedMiners.length === 0) {
        setStatus("No valid miner data found in the file.", 'warning');
        setIsProcessing(false);
        setSelectedFile(null); // Clear if file is empty or invalid
        return;
      }
      
      setStagedNewMiners(parsedMiners);
      setStagedUploadFileName(file.name);

      const currentPreview = generateUploadPreview(parsedMiners, miners, mergeStrategy);
      setUploadPreview(currentPreview);
      setShowUploadPreview(true);
      setStatus('File processed. Review preview below.', 'success');

    } catch (error) {
      console.error("Upload error:", error);
      setStatus(`Failed to process file: ${error.message}`, 'error');
      setSelectedFile(null);
      setStagedNewMiners(null);
      setStagedUploadFileName("");
    } finally {
      setIsProcessing(false);
    }
  };
  
  // --- Central data update logic ---
  const actuallyUpdateData = async (uploadedEntries, fileName, currentStrategy, dateOfUploadData) => {
    setIsProcessing(true);
    setStatus('Processing upload...', 'info', 0);
  
    try {
      // Create snapshot for potential rollback (Phase 4)
      const snapshotForHistory = {
        miners: JSON.parse(JSON.stringify(miners)),
        priceHistory: JSON.parse(JSON.stringify(priceHistory)),
        knownMiners: Array.from(knownMiners),
        minerSpecs: JSON.parse(JSON.stringify(minerSpecs)),
        maxPrices: JSON.parse(JSON.stringify(maxPrices)),
        previousPrices: JSON.parse(JSON.stringify(previousPrices)),
        // Add any other critical state pieces here
      };
  
      let currentMinersList = [...miners]; // Start with current miners for manipulation
      const tempPriceHistory = JSON.parse(JSON.stringify(priceHistory));
      const tempKnownMiners = new Set(knownMiners);
      const tempMinerSpecs = JSON.parse(JSON.stringify(minerSpecs));
      const tempMaxPrices = JSON.parse(JSON.stringify(maxPrices));
      const tempPreviousPrices = JSON.parse(JSON.stringify(previousPrices)); // Prices before this specific update batch
  
      let countTrulyNewMiners = 0; // New to the system overall
      const minersInThisUploadBatch = new Set(); // For tracking which miners were updated/added in THIS batch for `newMinersLastUpload` state
  
      uploadedEntries.forEach(entry => {
        const key = entry.name;
        minersInThisUploadBatch.add(key);
  
        if (!snapshotForHistory.knownMiners.includes(key)) { // Use snapshot for "truly new"
          countTrulyNewMiners++;
        }
        tempKnownMiners.add(key);
  
        // Update specs with latest data from upload
        tempMinerSpecs[key] = {
          powerConsumption: entry.powerConsumption,
          efficiency: entry.efficiency,
          algorithm: entry.algorithm,
        };
  
        // --- Phase 1: Price History Update (Daily/Intraday) ---
        if (!tempPriceHistory[key]) {
          tempPriceHistory[key] = { daily: [], intraday: [] };
        }
        const newHistEntry = {
          date: entry.date, // Date of data point
          timestamp: entry.uploadTimestamp, // Actual upload time
          uploadId: entry.uploadId, // Unique ID for this specific entry
          price: entry.price,
          hashrate: entry.hashrate,
          dailyEarnings: entry.dailyEarnings,
          efficiency: entry.efficiency,
          powerConsumption: entry.powerConsumption,
        };
        tempPriceHistory[key].intraday.push(newHistEntry);
        tempPriceHistory[key].intraday.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  
        // Update daily array (latest entry per date based on timestamp)
        const entriesForDate = tempPriceHistory[key].intraday.filter(h => h.date === entry.date);
        if (entriesForDate.length > 0) {
          const latestForDate = entriesForDate.reduce((latest, current) =>
            new Date(current.timestamp) > new Date(latest.timestamp) ? current : latest
          );
          const dailyIdx = tempPriceHistory[key].daily.findIndex(d => d.date === entry.date);
          if (dailyIdx >= 0) {
            tempPriceHistory[key].daily[dailyIdx] = latestForDate;
          } else {
            tempPriceHistory[key].daily.push(latestForDate);
          }
          tempPriceHistory[key].daily.sort((a, b) => new Date(a.date) - new Date(b.date));
        }
        
        // Update max price
        tempMaxPrices[key] = Math.max(tempMaxPrices[key] || 0, entry.price);
      });
  
      // --- Phase 2: Merge Strategy for `miners` (current display list) ---
      if (currentStrategy === 'replace') {
        const newSnapshotMiners = [];
        uploadedEntries.forEach(newMiner => {
            const oldMinerData = miners.find(m => m.name === newMiner.name);
            if (oldMinerData) tempPreviousPrices[newMiner.name] = oldMinerData.price;
            else delete tempPreviousPrices[newMiner.name]; // New miner, no previous price in this context
            newSnapshotMiners.push(newMiner);
        });
        currentMinersList = newSnapshotMiners;
      } else if (currentStrategy === 'merge') {
        const merged = [...currentMinersList];
        uploadedEntries.forEach(newMiner => {
          const idx = merged.findIndex(m => m.name === newMiner.name);
          if (idx >= 0) {
            tempPreviousPrices[newMiner.name] = merged[idx].price; // Capture before overwrite
            merged[idx] = { ...merged[idx], ...newMiner }; // Update existing
          } else {
            merged.push(newMiner); // Add new
            delete tempPreviousPrices[newMiner.name];
          }
        });
        currentMinersList = merged;
      } else if (currentStrategy === 'append') {
        // Append: Add new, update existing if already there. Similar to merge for the snapshot list.
        const appended = [...currentMinersList];
        uploadedEntries.forEach(newMiner => {
          const idx = appended.findIndex(m => m.name === newMiner.name);
          if (idx >= 0) {
            tempPreviousPrices[newMiner.name] = appended[idx].price;
            appended[idx] = { ...appended[idx], ...newMiner}; // Update if exists
          } else {
            appended.push(newMiner); // Add if new
            delete tempPreviousPrices[newMiner.name];
          }
        });
        currentMinersList = appended;
      }
  
      // Update states
      setMiners(currentMinersList);
      setPriceHistory(tempPriceHistory);
      setKnownMiners(tempKnownMiners);
      setMinerSpecs(tempMinerSpecs);
      setNewMinersLastUpload(minersInThisUploadBatch); // Highlight miners processed in this batch
      setMaxPrices(tempMaxPrices);
      setPreviousPrices(tempPreviousPrices);
  
      // --- Phase 4: Enhanced Upload History ---
      const newUploadRecord = {
        id: crypto.randomUUID ? crypto.randomUUID() : `upload_${Date.now()}`,
        date: dateOfUploadData, // The date the user specified for the data
        timestamp: new Date().toISOString(), // Actual time of upload confirmation
        fileName: fileName,
        minerCount: uploadedEntries.length,
        newMinerCount: countTrulyNewMiners, // Truly new to the system
        updatedCount: uploadPreview?.summary?.updatedCount || 0, // From preview
        strategy: currentStrategy,
        snapshot: snapshotForHistory, // State *before* this upload
      };
      setUploadHistory(prev => [...prev, newUploadRecord]);
      
      setStatus('Upload successful!', 'success');
    } catch (error) {
      console.error("Error during data update:", error);
      setStatus(`Upload processing failed: ${error.message}`, 'error');
      throw error; // Re-throw for confirmUpload's catch block
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Confirm Upload (called from Preview Modal) ---
  const confirmUpload = async () => {
    if (!stagedNewMiners || stagedNewMiners.length === 0) {
      setStatus("No data staged for upload.", 'warning');
      return;
    }
    if (uploadPreview && uploadPreview.errors.length > 0) {
        setStatus("Cannot confirm upload due to errors in data. Please check the preview.", 'error');
        return;
    }

    try {
      await actuallyUpdateData(stagedNewMiners, stagedUploadFileName, mergeStrategy, uploadDate);
      // Clear staged data & close preview on success
      setStagedNewMiners(null);
      setStagedUploadFileName("");
      setUploadPreview(null);
      setShowUploadPreview(false);
      setSelectedFile(null);
      // setUploadDate(new Date().toISOString().split("T")[0]); // Reset date for next upload
    } catch (error) {
      // Error status is set within actuallyUpdateData or its callees
      console.error("Confirmation of upload failed:", error);
      // Do not clear staged data on failure, user might want to retry or adjust
    }
  };
  
  const cancelUpload = () => {
    setStagedNewMiners(null);
    setStagedUploadFileName("");
    setUploadPreview(null);
    setShowUploadPreview(false);
    setSelectedFile(null);
    setStatus("Upload cancelled.", 'info');
  };

  // --- Phase 4: Rollback Functionality ---
  const rollbackUpload = (uploadIdToRollback) => {
    const uploadToRestore = uploadHistory.find(u => u.id === uploadIdToRollback);
    if (!uploadToRestore || !uploadToRestore.snapshot) {
      setStatus("Cannot rollback: Snapshot not found or invalid.", 'error');
      return;
    }

    const confirmMessage = `Are you sure you want to rollback to the state before the upload on ${new Date(uploadToRestore.timestamp).toLocaleString()} (File: ${uploadToRestore.fileName})?\nThis will revert all data to that point.`;
    if (window.confirm(confirmMessage)) {
      setIsProcessing(true);
      setStatus('Rolling back data...', 'info', 0);
      try {
        const snap = uploadToRestore.snapshot;
        setMiners(snap.miners || []);
        setPriceHistory(snap.priceHistory || {});
        setKnownMiners(new Set(snap.knownMiners || []));
        setMinerSpecs(snap.minerSpecs || {});
        setMaxPrices(snap.maxPrices || {});
        setPreviousPrices(snap.previousPrices || {});
        setNewMinersLastUpload(new Set()); // Clear last upload highlights

        // Optional: Prune upload history *after* the rollback point.
        // This is a design choice. For now, we keep all history.
        // const rollbackIndex = uploadHistory.findIndex(u => u.id === uploadIdToRollback);
        // setUploadHistory(prev => prev.slice(0, rollbackIndex + 1));

        setStatus("Rollback successful!", 'success');
      } catch (e) {
        console.error("Rollback error:", e);
        setStatus(`Rollback failed: ${e.message}`, 'error');
      } finally {
        setIsProcessing(false);
      }
    }
  };
  
  // --- Phase 5: Storage Optimization ---
  const optimizePriceHistory = useCallback((currentPriceHistory) => {
    const optimized = {};
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
    Object.entries(currentPriceHistory).forEach(([minerName, historyData]) => {
      if (!historyData || !historyData.intraday || !Array.isArray(historyData.intraday)) {
        optimized[minerName] = historyData; // Preserve if not in expected format
        return;
      }
  
      // Sort intraday: newest first for easier processing of latest daily
      const sortedIntradayDesc = [...historyData.intraday].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  
      const latestDailyMap = new Map(); // Stores the absolute latest entry for each date
      sortedIntradayDesc.forEach(entry => {
        if (!latestDailyMap.has(entry.date)) {
          latestDailyMap.set(entry.date, entry);
        }
      });
  
      const finalIntradayEntries = new Set();
      // Add all entries that are the latest for their specific day
      latestDailyMap.forEach(entry => finalIntradayEntries.add(entry));
  
      // Add all intraday entries from the last 30 days (even if not the latest for their day)
      historyData.intraday.forEach(entry => { // Iterate original to ensure all are checked
        if (new Date(entry.timestamp) >= thirtyDaysAgo) {
          finalIntradayEntries.add(entry);
        }
      });
      
      const newDailyArray = Array.from(latestDailyMap.values()).sort((a, b) => new Date(a.date) - new Date(b.date));
      const newIntradayArray = Array.from(finalIntradayEntries).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  
      optimized[minerName] = {
        daily: newDailyArray,
        intraday: newIntradayArray,
      };
    });
    return optimized;
  }, []);

  const cleanupStorage = () => {
    if (!window.confirm("Are you sure you want to perform storage cleanup? This will optimize price history (keeping daily latest + last 30 days intraday) and keep only the last 10 upload snapshots.")) {
        return;
    }
    setIsProcessing(true);
    setStatus("Cleaning up storage...", 'info', 0);
    try {
      const optimized = optimizePriceHistory(priceHistory);
      setPriceHistory(optimized);
  
      if (uploadHistory.length > 10) {
        setUploadHistory(prev => prev.slice(-10));
      }
      setStatus("Storage cleanup successful!", 'success');
    } catch (e) {
        console.error("Cleanup error:", e);
        setStatus(`Storage cleanup failed: ${e.message}`, 'error');
    } finally {
        setIsProcessing(false);
    }
  };

  // Calculate price changes (uses `previousPrices` state)
  const calculatePriceChanges = useCallback((miner) => {
    const currentPrice = miner.price;
    const maxPrice = maxPrices[miner.name] || currentPrice;
    const prevPrice = previousPrices[miner.name]; // Price before last update in table

    const changeFromMax = maxPrice > 0 ? (((currentPrice - maxPrice) / maxPrice) * 100) : 0;
    const changeFromPrevious = (prevPrice !== undefined && prevPrice !== null && prevPrice !== currentPrice)
      ? (((currentPrice - prevPrice) / prevPrice) * 100)
      : null;

    return {
      changeFromMax: parseFloat(changeFromMax.toFixed(1)),
      changeFromPrevious: changeFromPrevious !== null ? parseFloat(changeFromPrevious.toFixed(1)) : null,
    };
  }, [maxPrices, previousPrices]);


  // Sort miners
  const sortedMiners = useMemo(() => {
    const filtered = miners.filter((miner) => {
      const nameMatch = miner.name && miner.name.toLowerCase().includes(searchTerm.toLowerCase());
      const efficiencyMatch = miner.efficiency === null || miner.efficiency === undefined || miner.efficiency <= filterEfficiency;
      const newMatch = !showOnlyNew || newMinersLastUpload.has(miner.name);
      return nameMatch && efficiencyMatch && newMatch;
    });

    if (!sortConfig.key) return filtered;

    return [...filtered].sort((a, b) => {
      let aValue, bValue;
      const getSortableValue = (miner, key) => {
        switch (key) {
          case "name": return miner.name || "";
          case "hashrate": return miner.hashrate || 0;
          case "power": return miner.powerConsumption || 0;
          case "efficiency": return miner.efficiency === null || miner.efficiency === undefined ? Infinity : miner.efficiency; // Sort N/A last for asc
          case "price": return miner.price || 0;
          case "dailyEarnings": return miner.dailyEarnings || 0;
          case "changeFromMax": return calculatePriceChanges(miner).changeFromMax;
          case "changeFromPrevious": return calculatePriceChanges(miner).changeFromPrevious === null ? (sortConfig.direction === 'asc' ? Infinity : -Infinity) : calculatePriceChanges(miner).changeFromPrevious;
          default: return 0;
        }
      };
      aValue = getSortableValue(a, sortConfig.key);
      bValue = getSortableValue(b, sortConfig.key);

      if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [miners, searchTerm, filterEfficiency, showOnlyNew, newMinersLastUpload, sortConfig, calculatePriceChanges]);

  const handleSort = (key) => {
    setSortConfig((prevConfig) => ({
      key,
      direction:
        prevConfig.key === key && prevConfig.direction === "asc"
          ? "desc"
          : "asc",
    }));
  };

  const efficientMiners = useMemo(() => {
    return sortedMiners.filter((m) => m.efficiency && m.efficiency < 20);
  }, [sortedMiners]);

    const applyResearchedPowerData = () => {
    // ... (Existing function - assumed to be working, keeping as is)
    // This function should now also update tempMinerSpecs and tempPriceHistory if it changes efficiency
    // For simplicity, it currently modifies `miners` state directly, then `minerSpecs` and `priceHistory`.
    // This might need refactoring to go through the `actuallyUpdateData` flow if it's considered an "upload" or modification.
    // For now, direct update:
    let updatedCount = 0;
    const updatedMinersList = miners.map((miner) => {
      const updatedMiner = { ...miner };
      let powerValue = powerDatabase[updatedMiner.name.trim()] || powerDatabase[updatedMiner.name.replace(/\s+/g, " ").trim()];
      // Fallback to check all keys in powerDatabase with normalized names
      if (!powerValue) {
        const normalizedMinerName = updatedMiner.name.replace(/\s+/g, " ").trim();
        for (const [dbKey, dbVal] of Object.entries(powerDatabase)) {
            if (dbKey.replace(/\s+/g, " ").trim() === normalizedMinerName) {
                powerValue = dbVal;
                break;
            }
        }
      }

      if (powerValue && (!updatedMiner.efficiency || updatedMiner.powerConsumption !== powerValue)) {
        updatedMiner.powerConsumption = powerValue;
        if (updatedMiner.hashrate) {
          updatedMiner.efficiency = updatedMiner.powerConsumption / updatedMiner.hashrate;
          updatedCount++;
        }
      }
      return updatedMiner;
    });

    if (updatedCount > 0) {
        const newSpecs = { ...minerSpecs };
        const newHistory = JSON.parse(JSON.stringify(priceHistory));

        updatedMinersList.forEach(miner => {
            if (miner.efficiency) { // Only update if efficiency could be calculated
                newSpecs[miner.name] = {
                    ...newSpecs[miner.name],
                    powerConsumption: miner.powerConsumption,
                    efficiency: miner.efficiency,
                };
                if (newHistory[miner.name] && newHistory[miner.name].intraday) {
                    newHistory[miner.name].intraday.forEach(entry => {
                        entry.powerConsumption = miner.powerConsumption;
                        entry.efficiency = miner.efficiency;
                    });
                    newHistory[miner.name].daily.forEach(entry => {
                        entry.powerConsumption = miner.powerConsumption;
                        entry.efficiency = miner.efficiency;
                    });
                }
            }
        });
        setMiners(updatedMinersList);
        setMinerSpecs(newSpecs);
        setPriceHistory(newHistory);
        setStatus(`Applied researched power data to ${updatedCount} miners.`, 'success');
    } else {
        setStatus("No miners updated with researched power data. Ensure names match database.", 'info');
    }
  };


  const exportData = () => { /* ... (Existing function - good) ... */ 
    const dataToExport = {
      version: STORAGE_VERSION,
      miners: miners,
      priceHistory: priceHistory,
      knownMiners: Array.from(knownMiners),
      minerSpecs: minerSpecs,
      uploadHistory: uploadHistory,
      maxPrices: maxPrices,
      previousPrices: previousPrices,
      exportDate: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `miner-tracker-data-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setStatus("Data exported successfully.", "success");
  };


  const recalculateEfficiency = () => { /* ... (Existing function - good, but ensure it updates history too) ... */
    let updatedCount = 0;
    const updatedMinersList = miners.map((miner) => {
      const updatedMiner = { ...miner };
      const powerVal = powerDatabase[updatedMiner.name.trim()] || powerDatabase[updatedMiner.name.replace(/\s+/g, " ").trim()];
      if (powerVal) {
        updatedMiner.powerConsumption = powerVal;
      }
      if (updatedMiner.powerConsumption && updatedMiner.hashrate) {
        const newEfficiency = updatedMiner.powerConsumption / updatedMiner.hashrate;
        if (updatedMiner.efficiency !== newEfficiency) {
            updatedMiner.efficiency = newEfficiency;
            updatedCount++;
        }
      }
      return updatedMiner;
    });

    if (updatedCount > 0) {
        const newSpecs = { ...minerSpecs };
        const newHistory = JSON.parse(JSON.stringify(priceHistory));
        updatedMinersList.forEach(miner => {
            if (miner.efficiency) {
                 newSpecs[miner.name] = { ...newSpecs[miner.name], powerConsumption: miner.powerConsumption, efficiency: miner.efficiency };
                 if (newHistory[miner.name] && newHistory[miner.name].intraday) {
                    newHistory[miner.name].intraday.forEach(e => { e.powerConsumption = miner.powerConsumption; e.efficiency = miner.efficiency; });
                    newHistory[miner.name].daily.forEach(e => { e.powerConsumption = miner.powerConsumption; e.efficiency = miner.efficiency; });
                 }
            }
        });
        setMiners(updatedMinersList);
        setMinerSpecs(newSpecs);
        setPriceHistory(newHistory);
        setStatus(`Recalculated efficiency for ${updatedCount} miners.`, 'success');
    } else {
        setStatus("No efficiency values changed. All up to date or data missing.", 'info');
    }
  };
  
  const exportMinersWithoutEfficiency = () => { /* ... (Existing function - good) ... */
    const toExport = miners.filter(m => m.efficiency === null || m.efficiency === undefined || m.efficiency <=0 || isNaN(m.efficiency));
    if (toExport.length === 0) {
      setStatus("All miners have efficiency ratings!", 'info');
      return;
    }
    const escapeCSV = (field) => { /* ... */ };
    const headers = [ /* ... */ ];
    const rows = toExport.map( /* ... */ );
    const csvContent = [headers, ...rows].map((row) => row.map(escapeCSV).join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `miners-without-efficiency-${new Date().toISOString().split("T")[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setStatus(`Exported ${toExport.length} miners without efficiency.`, 'success');
  };

  const stats = useMemo(() => {
    const efficientCount = miners.filter(m => m.efficiency && m.efficiency <= 20).length;
    const withoutEfficiencyCount = miners.filter(m => !m.efficiency || m.efficiency <= 0 || isNaN(m.efficiency)).length;
    const avgPrice = miners.reduce((sum, m) => sum + (m.price || 0), 0) / (miners.length || 1);
    const avgHashrate = miners.reduce((sum, m) => sum + (m.hashrate || 0), 0) / (miners.length || 1);
    const efficientMinersForAvg = miners.filter(m => m.efficiency && m.efficiency > 0 && !isNaN(m.efficiency));
    const avgEfficiency = efficientMinersForAvg.reduce((sum, m) => sum + m.efficiency, 0) / (efficientMinersForAvg.length || 1);
    return {
      totalMiners: miners.length,
      efficientMiners: efficientCount,
      withoutEfficiency: withoutEfficiencyCount,
      avgPrice: avgPrice.toFixed(2),
      avgHashrate: avgHashrate.toFixed(2),
      avgEfficiency: avgEfficiency.toFixed(2),
      newMinerCount: newMinersLastUpload.size, // Display new from last upload
    };
  }, [miners, newMinersLastUpload]);

  const efficiencyDistribution = useMemo(() => { /* ... (Existing function - good) ... */ 
    const ranges = [
      { range: "< 15 J/TH", count: 0, color: "#10B981" }, // Emerald 600
      { range: "15-20 J/TH", count: 0, color: "#3B82F6" }, // Blue 500
      { range: "20-25 J/TH", count: 0, color: "#F59E0B" }, // Amber 500
      { range: "25-30 J/TH", count: 0, color: "#EF4444" }, // Red 500
      { range: "> 30 J/TH", count: 0, color: "#DC2626" }, // Red 600
    ];
    miners.forEach((miner) => {
      if (miner.efficiency && miner.efficiency > 0 && !isNaN(miner.efficiency)) {
        if (miner.efficiency < 15) ranges[0].count++;
        else if (miner.efficiency < 20) ranges[1].count++;
        else if (miner.efficiency < 25) ranges[2].count++;
        else if (miner.efficiency < 30) ranges[3].count++;
        else ranges[4].count++;
      }
    });
    return ranges.filter((r) => r.count > 0);
  }, [miners]);

  const SortIndicator = ({ column }) => { /* ... (Existing component - good) ... */ 
    if (sortConfig.key !== column) return <ArrowUpDown size={14} className="opacity-30 group-hover:opacity-70" />;
    return sortConfig.direction === "asc" ? (<ArrowUp size={14} className="text-blue-400" />) : (<ArrowDown size={14} className="text-blue-400" />);
  };

  const formatLastSaved = () => { /* ... (Existing function - good) ... */ 
    if (!lastSaved) return "Never";
    const date = new Date(lastSaved);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSeconds = Math.floor(diffMs / 1000);
    if (diffSeconds < 5) return "Just now";
    if (diffSeconds < 60) return `${diffSeconds}s ago`;
    const diffMins = Math.floor(diffSeconds / 60);
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  // --- JSX ---
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 p-4 md:p-6 font-sans">
      <div className="max-w-full mx-auto"> {/* Changed to max-w-full for wider view */}
        <header className="mb-6">
            <h1 className="text-3xl md:text-4xl font-bold text-center bg-gradient-to-r from-sky-400 to-indigo-500 text-transparent bg-clip-text">
            Cryptocurrency Miner Price Tracker
            </h1>
             {/* Operation Status Bar */}
            {operationStatus.message && (
                <div className={`mt-4 p-3 rounded-md text-sm text-center ${
                    operationStatus.type === 'success' ? 'bg-green-600/80 text-white' :
                    operationStatus.type === 'error' ? 'bg-red-600/80 text-white' :
                    operationStatus.type === 'warning' ? 'bg-yellow-500/80 text-black' :
                    'bg-blue-500/80 text-white'
                }`}>
                    {operationStatus.message}
                </div>
            )}
        </header>

        {/* Storage Status Bar */}
        <div className="bg-gray-800/70 backdrop-blur-sm shadow-lg rounded-lg p-3 mb-6 border border-gray-700 flex flex-wrap items-center justify-between gap-y-2">
          <div className="flex items-center gap-3 text-xs">
            <div className="flex items-center gap-1">
              {isProcessing || saveStatus === "saving" ? <Loader2 className="animate-spin text-yellow-400" size={14} /> : 
               saveStatus === "saved" ? <CheckCircle className="text-green-400" size={14} /> :
               <AlertCircle className="text-red-400" size={14} />}
              <span className="text-gray-400">
                {isProcessing ? "Processing..." :
                 saveStatus === "saving" ? "Saving..." :
                 saveStatus === "saved" ? "All changes saved" : "Error saving"}
              </span>
            </div>
            <div className="flex items-center gap-1 text-gray-500"> <Clock size={12} /> <span>Last saved: {formatLastSaved()}</span></div>
            <div className="text-gray-500">Storage: {storageUtils.getStorageSize()} KB</div>
          </div>
          <div className="flex gap-2 items-center">
            <button onClick={cleanupStorage} className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50" title="Optimize history and cleanup old snapshots" disabled={isProcessing}> <Archive size={14} /> Cleanup</button>
            <button onClick={clearAllData} className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded text-xs flex items-center gap-1.5 transition-colors disabled:opacity-50" disabled={isProcessing}> <Trash2 size={14} /> Clear All</button>
          </div>
        </div>

        {/* Stats Dashboard */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4 mb-6">
          {/* Total Miners, Efficient, No Efficiency, New Miners, Avg Price, Avg J/TH */}
          {/* Example Stat Card: */}
          {[
            { title: "Total Miners", value: stats.totalMiners, icon: <Database className="text-sky-400" size={20}/> },
            { title: "Efficient (<20 J/TH)", value: stats.efficientMiners, icon: <Zap className="text-green-400" size={20}/> },
            { title: "No Efficiency Data", value: stats.withoutEfficiency, icon: <FileWarning className="text-orange-400" size={20}/> },
            { title: "New (Last Upload)", value: stats.newMinerCount, icon: <Sparkles className="text-yellow-400" size={20}/> },
            { title: "Avg Price", value: `$${stats.avgPrice}`, icon: <DollarSign className="text-amber-400" size={20}/> },
            { title: "Avg Efficiency", value: `${stats.avgEfficiency} J/TH`, icon: <Activity className="text-purple-400" size={20}/> },
          ].map(stat => (
            <div key={stat.title} className="bg-gray-800/70 backdrop-blur-sm shadow-md rounded-lg p-3 md:p-4 border border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-400 text-xs md:text-sm">{stat.title}</p>
                  <p className="text-xl md:text-2xl font-bold text-gray-100">{stat.value}</p>
                </div>
                {stat.icon}
              </div>
            </div>
          ))}
        </div>
        
        {/* Upload Section */}
        <div className="bg-gray-800/70 backdrop-blur-sm shadow-lg rounded-lg p-4 md:p-6 mb-6 border border-gray-700">
          <h2 className="text-lg md:text-xl font-semibold mb-4 flex items-center gap-2"><FileSpreadsheet size={20} /> Upload & Manage Data</h2>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div>
                <label htmlFor="uploadDate" className="block text-xs text-gray-400 mb-1">Date of Data</label>
                <input id="uploadDate" type="date" value={uploadDate} onChange={(e) => setUploadDate(e.target.value)} className="bg-gray-700 border border-gray-600 rounded px-3 py-2 w-full text-sm focus:ring-2 focus:ring-sky-500 outline-none" />
              </div>
              <div>
                <label htmlFor="mergeStrategy" className="block text-xs text-gray-400 mb-1">Upload Strategy</label>
                <select id="mergeStrategy" value={mergeStrategy} onChange={(e) => setMergeStrategy(e.target.value)} className="bg-gray-700 border border-gray-600 rounded px-3 py-2 w-full text-sm focus:ring-2 focus:ring-sky-500 outline-none">
                  <option value="merge">Merge (Update existing, add new)</option>
                  <option value="replace">Replace All (Replace current list with upload)</option>
                  <option value="append">Append (Add new, update existing - like merge)</option>
                </select>
              </div>
              <label className={`bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors ${isProcessing ? "opacity-50 cursor-not-allowed" : ""}`}>
                <Upload size={16} /> {selectedFile ? `Reselect File` : `Select Excel/CSV`}
                <input type="file" onChange={handleFileUpload} className="hidden" accept=".xlsx,.xls,.csv,.txt" disabled={isProcessing} />
              </label>
            </div>
            {selectedFile && !showUploadPreview && <p className="text-xs text-gray-400 mt-1">Selected for upload: {selectedFile.name}. Preview will show after processing.</p>}

            <div className="flex flex-wrap gap-2 pt-2">
                <button onClick={exportData} className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-xs flex items-center gap-1.5 transition-colors" disabled={isProcessing}> <Download size={14} /> Export All Data </button>
                <button onClick={exportMinersWithoutEfficiency} className="bg-orange-600 hover:bg-orange-700 text-white px-3 py-1.5 rounded text-xs flex items-center gap-1.5 transition-colors" disabled={isProcessing || stats.withoutEfficiency === 0}> <FileWarning size={14} /> Export No Efficiency ({stats.withoutEfficiency}) </button>
                <button onClick={recalculateEfficiency} className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded text-xs flex items-center gap-1.5 transition-colors" disabled={isProcessing}> <Zap size={14} /> Recalculate All Efficiency </button>
                <button onClick={applyResearchedPowerData} className="bg-teal-600 hover:bg-teal-700 text-white px-3 py-1.5 rounded text-xs flex items-center gap-1.5 transition-colors" disabled={isProcessing}> <Database size={14} /> Apply Researched Power </button>
            </div>
          </div>
        </div>

        {/* --- Phase 3: Upload Preview Modal/Section --- */}
        {showUploadPreview && uploadPreview && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 transition-opacity duration-300 ease-in-out">
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 md:p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl">
              <h3 className="text-xl font-semibold mb-4 text-gray-100">Upload Preview: <span className="text-sky-400 text-base font-normal">{stagedUploadFileName}</span></h3>
              
              {uploadPreview.errors.length > 0 && (
                <div className="bg-red-700/30 border border-red-500 rounded p-3 mb-3">
                  <p className="text-red-300 font-semibold flex items-center gap-2"><AlertCircle size={16}/> Errors ({uploadPreview.errors.length}):</p>
                  <ul className="text-xs text-red-200 list-disc list-inside mt-1 max-h-32 overflow-y-auto">
                    {uploadPreview.errors.map((error, idx) => <li key={idx}>{error}</li>)}
                  </ul>
                </div>
              )}
              {uploadPreview.warnings.length > 0 && ( /* Warnings if implemented */
                <div className="bg-yellow-600/30 border border-yellow-500 rounded p-3 mb-3">
                  <p className="text-yellow-300 font-semibold">Warnings:</p>
                  <ul className="text-xs text-yellow-200 list-disc list-inside mt-1">{uploadPreview.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                </div>
              )}

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm mb-4">
                {[
                    {label: "New Miners", count: uploadPreview.summary.newCount, color: "text-green-400"},
                    {label: "Updated", count: uploadPreview.summary.updatedCount, color: "text-sky-400"},
                    {label: "Unchanged", count: uploadPreview.summary.unchangedCount, color: "text-gray-400"},
                    {label: "Removed (on Replace)", count: uploadPreview.summary.removedCount, color: "text-orange-400"},
                ].map(item => (
                    <div key={item.label} className="bg-gray-700/50 rounded p-2 text-center border border-gray-600">
                        <p className="text-gray-300 text-xs">{item.label}</p>
                        <p className={`text-2xl font-bold ${item.color}`}>{item.count}</p>
                    </div>
                ))}
              </div>

              {/* --- Conflict Resolution UI / Price Changes --- */}
              {uploadPreview.updated.length > 0 && (
                <div className="mt-3 mb-4">
                  <h4 className="text-sm font-semibold text-gray-300 mb-1">Price/Data Changes:</h4>
                  <div className="max-h-40 overflow-y-auto space-y-1 text-xs bg-gray-700/30 p-2 rounded border border-gray-600">
                    {uploadPreview.updated.slice(0, 20).map((update, idx) => ( // Show first 20
                      <div key={idx} className="bg-gray-700/80 rounded p-1.5 flex justify-between items-center text-[0.7rem]">
                        <span className="font-medium truncate w-1/2" title={update.name}>{update.name}</span>
                        <div className="flex flex-col items-end">
                            <span className="text-gray-400">${update.oldPrice.toFixed(2)} <span className="text-gray-500">→</span> ${update.newPrice.toFixed(2)}</span>
                            <span className={update.change > 0 ? 'text-red-400' : update.change < 0 ? 'text-green-400' : 'text-gray-400'}>
                            {update.change > 0 ? '+' : ''}{update.change}%
                            </span>
                        </div>
                      </div>
                    ))}
                    {uploadPreview.updated.length > 20 && <p className="text-xs text-gray-400 text-center">... and {uploadPreview.updated.length - 20} more updates.</p>}
                  </div>
                </div>
              )}

              <div className="mt-6 flex gap-3 justify-end">
                <button onClick={confirmUpload} className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded text-sm flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed" disabled={isProcessing || uploadPreview.errors.length > 0}>
                  {isProcessing ? <Loader2 className="animate-spin" size={16}/> : <CheckCircle size={16}/>} Confirm Upload
                </button>
                <button onClick={cancelUpload} className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded text-sm" disabled={isProcessing}> Cancel </button>
              </div>
            </div>
          </div>
        )}


        {/* Upload History & Rollback */}
        {uploadHistory.length > 0 && (
          <div className="bg-gray-800/70 backdrop-blur-sm shadow-lg rounded-lg p-4 md:p-6 mb-6 border border-gray-700">
            <h2 className="text-lg md:text-xl font-semibold mb-3">Recent Uploads</h2>
            <div className="space-y-2 max-h-60 overflow-y-auto text-xs">
              {uploadHistory.slice().reverse().map((upload) => ( // Show latest first
                <div key={upload.id} className="bg-gray-700/50 p-2.5 rounded flex flex-wrap justify-between items-center gap-2 border border-gray-600">
                  <div>
                    <p className="font-medium text-gray-200">{upload.fileName} <span className="text-gray-400 text-[0.7rem]">({new Date(upload.timestamp).toLocaleString()})</span></p>
                    <p className="text-gray-400">Strategy: <span className="text-sky-300">{upload.strategy}</span>, Miners: {upload.minerCount}, New: {upload.newMinerCount}, Updated: {upload.updatedCount}</p>
                  </div>
                  <button onClick={() => rollbackUpload(upload.id)} title="Rollback to state before this upload"
                    className="bg-red-700 hover:bg-red-800 text-white px-2.5 py-1 rounded text-[0.7rem] flex items-center gap-1 transition-colors" disabled={isProcessing}>
                    <RotateCcw size={12} /> Rollback
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        
        {/* Efficiency Distribution Chart */}
        {efficiencyDistribution.length > 0 && ( /* ... (Existing JSX - good, small style tweaks possible) ... */ 
            <div className="bg-gray-800/70 backdrop-blur-sm shadow-lg rounded-lg p-4 md:p-6 mb-6 border border-gray-700">
                <h2 className="text-lg md:text-xl font-semibold mb-4">Efficiency Distribution (J/TH)</h2>
                <ResponsiveContainer width="100%" height={200}>
                <BarChart data={efficiencyDistribution} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#4A5568" />
                    <XAxis dataKey="range" stroke="#A0AEC0" fontSize={10} />
                    <YAxis stroke="#A0AEC0" fontSize={10} allowDecimals={false}/>
                    <Tooltip contentStyle={{ backgroundColor: "#1A202C", border: "1px solid #2D3748", borderRadius:"0.25rem" }} labelStyle={{ color: "#E2E8F0" }} itemStyle={{color: "#CBD5E0"}}/>
                    <Bar dataKey="count" name="Miners" unit="">
                        {efficiencyDistribution.map((entry, index) => (
                            <Bar key={`cell-${index}`} dataKey="count" fill={entry.color} />
                        ))}
                    </Bar>
                </BarChart>
                </ResponsiveContainer>
            </div>
        )}

        {/* Filters */}
        <div className="bg-gray-800/70 backdrop-blur-sm shadow-lg rounded-lg p-4 md:p-6 mb-6 border border-gray-700">
            <h2 className="text-lg md:text-xl font-semibold mb-4 flex items-center gap-2"><Filter size={20} /> Filters & View Options</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                    <label htmlFor="searchMiners" className="block text-xs text-gray-400 mb-1">Search Miners</label>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500" size={14}/>
                        <input id="searchMiners" type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} placeholder="Filter by name..." className="bg-gray-700 border border-gray-600 rounded pl-9 pr-3 py-2 w-full text-sm focus:ring-2 focus:ring-sky-500 outline-none"/>
                    </div>
                </div>
                <div>
                    <label htmlFor="filterEfficiencyRange" className="block text-xs text-gray-400 mb-1">Max Efficiency (J/TH): <span className="font-semibold text-sky-400">{filterEfficiency}</span></label>
                    <input id="filterEfficiencyRange" type="range" min="10" max="100" step="1" value={filterEfficiency} onChange={(e) => setFilterEfficiency(parseInt(e.target.value))} className="w-full h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-sky-500"/>
                    <div className="flex justify-between text-xs text-gray-500 mt-1"><span>10</span><span>Efficient Zone</span><span>100</span></div>
                </div>
                <div className="flex items-end">
                <button onClick={() => setShowOnlyNew(!showOnlyNew)} className={`w-full px-3 py-2 rounded text-sm flex items-center justify-center gap-2 transition-colors ${ showOnlyNew ? "bg-yellow-600 hover:bg-yellow-700 text-white" : "bg-gray-700 hover:bg-gray-600 text-gray-300"}`}>
                    {showOnlyNew ? <Eye size={16} /> : <EyeOff size={16} />} {showOnlyNew ? "Showing New Only" : "Show All Miners"}
                </button>
                </div>
            </div>
        </div>
        
        {/* Efficient Miners Summary - if any */}
        {efficientMiners.length > 0 && ( /* ... (Existing JSX - good, minor style tweaks) ... */ 
            <div className="bg-green-800/30 backdrop-blur-sm border border-green-600 rounded-lg p-4 md:p-6 mb-6">
                <h2 className="text-lg md:text-xl font-semibold mb-3 text-green-300 flex items-center gap-2"><Zap size={20} /> Top Efficient Miners (&lt;20 J/TH)</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 md:gap-3">
                {efficientMiners.slice(0, 6).map((miner, idx) => (
                    <div key={idx} className="bg-gray-800/60 rounded p-2.5 border border-gray-700">
                    <p className="font-semibold text-sm text-gray-200 truncate" title={miner.name}>{miner.name}</p>
                    <div className="text-xs text-gray-400 mt-1">
                        <span className="text-green-400 font-medium">{miner.efficiency?.toFixed(1)} J/TH</span> •
                        <span> {miner.hashrate} TH/s</span> •
                        <span> ${miner.price?.toFixed(2)}</span>
                    </div>
                    </div>
                ))}
                </div>
            </div>
        )}

        {/* Miner List */}
        <div className="bg-gray-800/70 backdrop-blur-sm shadow-lg rounded-lg p-0 md:p-0 border border-gray-700 overflow-hidden">
          <h2 className="text-lg md:text-xl font-semibold mb-0 p-4 md:p-6">Miner Overview ({sortedMiners.length} displayed)</h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px]"> {/* min-w for horizontal scroll on small screens */}
              <thead className="bg-gray-700/50">
                <tr className="border-b border-gray-600 text-xs text-gray-400 uppercase">
                  {/* Table Headers */}
                  {[
                    {label: "Name", key: "name", align: "left"},
                    {label: "Hashrate", key: "hashrate", unit: "TH/s"},
                    {label: "Power", key: "power", unit: "W"},
                    {label: "Efficiency", key: "efficiency", unit: "J/TH"},
                    {label: "Price", key: "price", unit: "$"},
                    {label: "vs Max", key: "changeFromMax", unit: "%"},
                    {label: "vs Prior", key: "changeFromPrevious", unit: "%"},
                    {label: "Daily $", key: "dailyEarnings", unit: "$"},
                    {label: "Chart", key: "action", noSort: true},
                  ].map(col => (
                    <th key={col.key} className={`py-3 px-2 md:px-4 ${col.align === 'left' ? 'text-left' : 'text-right'} ${!col.noSort ? 'cursor-pointer group hover:bg-gray-600/50' : ''}`}
                        onClick={!col.noSort ? () => handleSort(col.key) : undefined}>
                      <div className={`flex items-center ${col.align === 'left' ? 'justify-start' : 'justify-end'} gap-1`}>
                        {col.label} {!col.noSort && <SortIndicator column={col.key} />}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {sortedMiners.map((miner, index) => {
                  const priceChanges = calculatePriceChanges(miner);
                  const isNew = newMinersLastUpload.has(miner.name);
                  return (
                    <tr key={miner.uploadId || `${miner.name}-${index}`} className={`hover:bg-gray-700/40 transition-colors duration-150 ${isNew ? "bg-yellow-700/10" : ""}`}>
                      <td className="py-2.5 px-2 md:px-4 text-sm text-gray-200">
                        {miner.name} {isNew && <Sparkles className="inline ml-1 text-yellow-400" size={12} />}
                      </td>
                      <td className="text-right py-2.5 px-2 md:px-4 text-sm text-gray-300">{miner.hashrate?.toFixed(1)}</td>
                      <td className="text-right py-2.5 px-2 md:px-4 text-sm text-gray-300">{miner.powerConsumption || "N/A"}</td>
                      <td className="text-right py-2.5 px-2 md:px-4 text-sm">
                        {miner.efficiency && miner.efficiency > 0 && !isNaN(miner.efficiency) ? (
                          <span className={ miner.efficiency < 15 ? "text-green-400 font-bold" : miner.efficiency <= 20 ? "text-green-400" : miner.efficiency <= 25 ? "text-yellow-400" : "text-red-400"}>
                            {miner.efficiency.toFixed(1)}
                          </span>
                        ) : (<span className="text-gray-500">N/A</span>)}
                      </td>
                      <td className="text-right py-2.5 px-2 md:px-4 text-sm text-gray-300">${miner.price?.toFixed(2)}</td>
                      <td className="text-right py-2.5 px-2 md:px-4 text-sm">
                        <span className={ priceChanges.changeFromMax < 0 ? "text-green-400" : priceChanges.changeFromMax > 0 ? "text-red-400" : "text-gray-400"}>
                          {priceChanges.changeFromMax > 0 ? "+" : ""}{priceChanges.changeFromMax}%
                        </span>
                      </td>
                      <td className="text-right py-2.5 px-2 md:px-4 text-sm">
                        {priceChanges.changeFromPrevious !== null ? (
                          <span className={ priceChanges.changeFromPrevious < 0 ? "text-green-400" : priceChanges.changeFromPrevious > 0 ? "text-red-400" : "text-gray-400"}>
                            {priceChanges.changeFromPrevious > 0 ? "+" : ""}{priceChanges.changeFromPrevious}%
                          </span>
                        ) : (<span className="text-gray-500">-</span>)}
                      </td>
                      <td className="text-right py-2.5 px-2 md:px-4 text-sm text-gray-300">${miner.dailyEarnings?.toFixed(2)}</td>
                      <td className="text-center py-2.5 px-2 md:px-4">
                        <button onClick={() => setSelectedMiner(miner.name)} className="text-sky-400 hover:text-sky-300 p-1" title="View Price History"> <TrendingUp size={16} /> </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {sortedMiners.length === 0 && <p className="text-center py-8 text-gray-500">No miners match your current filters.</p>}
          </div>
        </div>

        {/* Price History Chart Modal */}
        {selectedMiner && priceHistory[selectedMiner] && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-40">
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 md:p-6 w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl">
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-lg md:text-xl font-semibold text-gray-100">Price History: <span className="text-sky-400">{selectedMiner}</span></h2>
                <button onClick={() => setSelectedMiner(null)} className="text-gray-400 hover:text-gray-200">&times;</button>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-3 text-xs mb-4">
                {[
                    {label: "Current Efficiency", value: minerSpecs[selectedMiner]?.efficiency ? `${minerSpecs[selectedMiner].efficiency.toFixed(1)} J/TH` : "N/A", color: minerSpecs[selectedMiner]?.efficiency <=20 ? "text-green-400" : "text-yellow-400"},
                    {label: "Power Draw", value: minerSpecs[selectedMiner]?.powerConsumption ? `${minerSpecs[selectedMiner].powerConsumption} W` : "N/A"},
                    {label: "Latest Price", value: priceHistory[selectedMiner]?.daily.slice(-1)[0]?.price ? `$${priceHistory[selectedMiner].daily.slice(-1)[0].price.toFixed(2)}` : "N/A"},
                    {label: "Data Points (Intraday)", value: priceHistory[selectedMiner]?.intraday?.length || 0}
                ].map(item=>(
                    <div key={item.label} className="bg-gray-700/50 rounded p-2 border border-gray-600">
                        <p className="text-gray-400 truncate">{item.label}</p>
                        <p className={`text-base font-bold ${item.color || 'text-gray-200'} truncate`}>{item.value}</p>
                    </div>
                ))}
              </div>

              <div className="flex-grow min-h-[250px]"> {/* Ensure chart has space */}
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={priceHistory[selectedMiner].intraday} margin={{ top: 5, right: 20, left: -15, bottom: 5 }}> {/* Use intraday for full history */}
                    <CartesianGrid strokeDasharray="3 3" stroke="#4A5568" />
                    <XAxis dataKey="timestamp" stroke="#A0AEC0" fontSize={10} tickFormatter={(ts) => new Date(ts).toLocaleDateString()} />
                    <YAxis stroke="#A0AEC0" fontSize={10} domain={['auto', 'auto']}/>
                    <Tooltip contentStyle={{ backgroundColor: "#1A202C", border: "1px solid #2D3748", borderRadius:"0.25rem" }} labelStyle={{ color: "#E2E8F0" }} itemStyle={{color: "#CBD5E0"}}
                        formatter={(value, name) => [typeof value === 'number' ? value.toFixed(2) : value, name]}
                        labelFormatter={(label) => new Date(label).toLocaleString()}
                    />
                    <Legend wrapperStyle={{fontSize: "0.8rem"}} />
                    <Line type="monotone" dataKey="price" stroke="#38BDF8" strokeWidth={1.5} dot={{r:2, fill: "#38BDF8"}} name="Price (USD)" />
                    <Line type="monotone" dataKey="dailyEarnings" stroke="#34D399" strokeWidth={1.5} dot={{r:2, fill: "#34D399"}} name="Daily Earnings (USD)" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
        
        {/* Instructions (simplified) */}
        <div className="bg-gray-800/70 backdrop-blur-sm shadow-lg rounded-lg p-4 md:p-6 mt-6 border border-gray-700 text-xs text-gray-400">
          <h2 className="text-base font-semibold mb-2 text-gray-200">Quick Guide</h2>
          <ul className="list-disc list-inside space-y-1">
            <li>Upload Excel/CSV: Use the 'Date of Data' for the values in the file. Choose an 'Upload Strategy'.</li>
            <li>Timestamps ensure multiple same-day uploads are stored individually.</li>
            <li>'Merge' updates existing miners and adds new ones. 'Replace' replaces the current list with file contents. 'Append' acts like 'Merge' for the list. All data points are saved to history.</li>
            <li>Preview uploads before confirming. Errors will prevent confirmation.</li>
            <li>Rollback data from 'Recent Uploads' section if needed.</li>
            <li>Data is saved automatically. Use 'Export All Data' for backups. 'Clear All Data' is permanent.</li>
          </ul>
        </div>

      </div>
    </div>
  );
};
export default MinerPriceTracker;