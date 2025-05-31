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
} from "lucide-react";
import Papa from "papaparse";
import * as XLSX from "xlsx";

// Storage configuration
const STORAGE_VERSION = "1.0.0";
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
};

// Compression utilities
const compressData = (data) => {
  try {
    const jsonString = JSON.stringify(data);
    // Simple compression: remove unnecessary whitespace
    return jsonString.replace(/\s+/g, " ").trim();
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

// Storage utilities
const storageUtils = {
  save: (key, data) => {
    try {
      const compressed = compressData(data);
      localStorage.setItem(key, compressed);
      localStorage.setItem(STORAGE_KEYS.lastSaved, new Date().toISOString());
      return true;
    } catch (error) {
      if (error.name === "QuotaExceededError") {
        console.error("LocalStorage quota exceeded");
        return false;
      }
      console.error("Storage error:", error);
      return false;
    }
  },

  load: (key, defaultValue = null) => {
    try {
      const item = localStorage.getItem(key);
      if (!item) return defaultValue;
      return decompressData(item) || defaultValue;
    } catch (error) {
      console.error("Load error:", error);
      return defaultValue;
    }
  },

  remove: (key) => {
    try {
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error("Remove error:", error);
      return false;
    }
  },

  clearAll: () => {
    try {
      Object.values(STORAGE_KEYS).forEach((key) => {
        localStorage.removeItem(key);
      });
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
        total += localStorage[key].length + key.length;
      }
    }
    return (total / 1024).toFixed(2); // KB
  },
};

const MinerPriceTracker = () => {
  const [miners, setMiners] = useState([]);
  const [priceHistory, setPriceHistory] = useState({});
  const [selectedMiner, setSelectedMiner] = useState(null);
  const [filterEfficiency, setFilterEfficiency] = useState(20);
  const [searchTerm, setSearchTerm] = useState("");
  const [uploadDate, setUploadDate] = useState("");
  const [knownMiners, setKnownMiners] = useState(new Set());
  const [newMiners, setNewMiners] = useState(new Set());
  const [showOnlyNew, setShowOnlyNew] = useState(false);
  const [minerSpecs, setMinerSpecs] = useState({});
  const [uploadHistory, setUploadHistory] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: "asc" });
  const [maxPrices, setMaxPrices] = useState({});
  const [previousPrices, setPreviousPrices] = useState({});
  const [lastSaved, setLastSaved] = useState(null);
  const [saveStatus, setSaveStatus] = useState("saved"); // 'saved', 'saving', 'error'
  const saveTimeoutRef = useRef(null);

  // Power consumption database (watts) - compiled from research
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
    "Antminer S21XP Hydro - 470 TH/s": 5676,
    "Antminer S21XP - 270 TH/s": 3645,
    "Antminer S19 XP Hyd - 257 TH/s": 5345,
    "Antminer S19XP Hyd - 246 TH/s": 5346,
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
    "WHATSMINER M30S++ - 96 TH/s": 3456,
    "WHATSMINER M30S++ - 90 TH/s": 3456,
    "WHATSMINER M30S++ - 85 TH/s": 3456,
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

  // Migration from window storage to localStorage
  useEffect(() => {
    const migrateFromWindowStorage = () => {
      let migrated = false;

      // Check if we need to migrate
      const version = storageUtils.load(STORAGE_KEYS.version);
      if (!version && window.minerData) {
        console.log("Migrating from window storage to localStorage...");

        // Migrate all data
        if (window.minerData) {
          storageUtils.save(STORAGE_KEYS.miners, window.minerData);
          migrated = true;
        }
        if (window.priceHistory) {
          storageUtils.save(STORAGE_KEYS.priceHistory, window.priceHistory);
        }
        if (window.knownMiners) {
          storageUtils.save(
            STORAGE_KEYS.knownMiners,
            Array.from(window.knownMiners)
          );
        }
        if (window.minerSpecs) {
          storageUtils.save(STORAGE_KEYS.minerSpecs, window.minerSpecs);
        }
        if (window.uploadHistory) {
          storageUtils.save(STORAGE_KEYS.uploadHistory, window.uploadHistory);
        }
        if (window.maxPrices) {
          storageUtils.save(STORAGE_KEYS.maxPrices, window.maxPrices);
        }
        if (window.previousPrices) {
          storageUtils.save(STORAGE_KEYS.previousPrices, window.previousPrices);
        }

        // Save version
        storageUtils.save(STORAGE_KEYS.version, STORAGE_VERSION);

        // Clean up window storage
        delete window.minerData;
        delete window.priceHistory;
        delete window.knownMiners;
        delete window.minerSpecs;
        delete window.uploadHistory;
        delete window.maxPrices;
        delete window.previousPrices;

        if (migrated) {
          alert("Data successfully migrated to persistent storage!");
        }
      }
    };

    migrateFromWindowStorage();
  }, []);

  // Load data from localStorage on component mount
  useEffect(() => {
    const loadFromStorage = () => {
      const version = storageUtils.load(STORAGE_KEYS.version);

      // Handle version mismatch in the future
      if (version && version !== STORAGE_VERSION) {
        console.log(
          `Storage version mismatch. Current: ${STORAGE_VERSION}, Stored: ${version}`
        );
        // Add migration logic here if needed
      }

      // Load all data
      const savedMiners = storageUtils.load(STORAGE_KEYS.miners, []);
      const savedHistory = storageUtils.load(STORAGE_KEYS.priceHistory, {});
      const savedKnown = storageUtils.load(STORAGE_KEYS.knownMiners, []);
      const savedSpecs = storageUtils.load(STORAGE_KEYS.minerSpecs, {});
      const savedUploadHistory = storageUtils.load(
        STORAGE_KEYS.uploadHistory,
        []
      );
      const savedMaxPrices = storageUtils.load(STORAGE_KEYS.maxPrices, {});
      const savedPreviousPrices = storageUtils.load(
        STORAGE_KEYS.previousPrices,
        {}
      );
      const savedLastSaved = storageUtils.load(STORAGE_KEYS.lastSaved);

      setMiners(savedMiners);
      setPriceHistory(savedHistory);
      setKnownMiners(new Set(savedKnown));
      setMinerSpecs(savedSpecs);
      setUploadHistory(savedUploadHistory);
      setMaxPrices(savedMaxPrices);
      setPreviousPrices(savedPreviousPrices);
      setLastSaved(savedLastSaved);

      // Save current version
      storageUtils.save(STORAGE_KEYS.version, STORAGE_VERSION);
    };

    loadFromStorage();
  }, []);

  // Debounced save function
  const debouncedSave = useCallback(() => {
    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Set saving status
    setSaveStatus("saving");

    // Set new timeout
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
        alert("Failed to save data. LocalStorage might be full.");
      }
    }, 1000); // 1 second debounce
  }, [
    miners,
    priceHistory,
    knownMiners,
    minerSpecs,
    uploadHistory,
    maxPrices,
    previousPrices,
  ]);

  // Auto-save on data changes
  useEffect(() => {
    if (miners.length > 0 || Object.keys(priceHistory).length > 0) {
      debouncedSave();
    }

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [
    miners,
    priceHistory,
    knownMiners,
    minerSpecs,
    uploadHistory,
    maxPrices,
    previousPrices,
    debouncedSave,
  ]);

  // Clear all data with confirmation
  const clearAllData = () => {
    const storageSize = storageUtils.getStorageSize();
    const confirmMessage = `Are you sure you want to clear all data?\n\nThis will permanently delete:\n- ${
      miners.length
    } miners\n- ${Object.keys(priceHistory).length} price histories\n- ${
      uploadHistory.length
    } upload records\n\nCurrent storage size: ${storageSize} KB\n\nThis action cannot be undone!`;

    if (window.confirm(confirmMessage)) {
      if (window.confirm("Are you REALLY sure? This will delete everything!")) {
        const success = storageUtils.clearAll();

        if (success) {
          // Reset all state
          setMiners([]);
          setPriceHistory({});
          setKnownMiners(new Set());
          setNewMiners(new Set());
          setMinerSpecs({});
          setUploadHistory([]);
          setMaxPrices({});
          setPreviousPrices({});
          setSelectedMiner(null);
          setLastSaved(null);
          setSaveStatus("saved");

          alert("All data has been cleared successfully!");
        } else {
          alert("Failed to clear data. Please try again.");
        }
      }
    }
  };

  // Parse Excel/CSV data
  const parseUploadedData = async (file, date) => {
    const fileType = file.name.split(".").pop().toLowerCase();

    if (fileType === "xlsx" || fileType === "xls") {
      // Parse Excel file
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      return parseDataRows(jsonData, date);
    } else if (fileType === "csv" || fileType === "txt") {
      // Parse CSV/TXT file
      return new Promise((resolve) => {
        Papa.parse(file, {
          complete: (results) => {
            resolve(parseDataRows(results.data, date));
          },
          error: (error) => {
            console.error("Error parsing CSV:", error);
            resolve([]);
          },
        });
      });
    }
  };

  // Parse data rows into miner objects
  const parseDataRows = (rows, date) => {
    const minerData = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 7) continue;

      let miner = {};

      // Handle different data formats
      if (typeof row[0] === "string" && row[0].includes("http")) {
        // Format from the user's data
        miner.imageUrl = row[0];
        miner.name = row[1];

        // Extract hashrate
        const hashrateMatch = (row[2] || "")
          .toString()
          .match(/(\d+\.?\d*)\s*(TH\/s|GH\/s)/i);
        if (hashrateMatch) {
          miner.hashrate = parseFloat(hashrateMatch[1]);
          if (hashrateMatch[2].toLowerCase() === "gh/s") {
            miner.hashrate = miner.hashrate / 1000; // Convert GH/s to TH/s
          }
        }

        // Extract algorithm
        miner.algorithm = (row[3] || "").toString().replace("Algo:", "").trim();

        // Extract price
        const priceMatch = (row[4] || "").toString().match(/(\d+\.?\d*)/);
        if (priceMatch) {
          miner.price = parseFloat(priceMatch[1]);
        }

        // Extract daily earnings
        const earningsMatch = (row[5] || "").toString().match(/\$(\d+\.?\d*)/);
        if (earningsMatch) {
          miner.dailyEarnings = parseFloat(earningsMatch[1]);
        }

        // Check for power consumption in extended data
        if (row.length > 7) {
          const powerMatch = (row[8] || "").toString().match(/(\d+)/);
          if (powerMatch) {
            miner.powerConsumption = parseInt(powerMatch[1]);
          }

          const efficiencyMatch = (row[9] || "")
            .toString()
            .match(/(\d+\.?\d*)/);
          if (efficiencyMatch) {
            miner.efficiency = parseFloat(efficiencyMatch[1]);
          }
        }
      } else {
        // Standard format: Name, Hashrate, Price, Daily Earnings, Power, Efficiency
        miner.name = row[0];
        miner.hashrate = parseFloat(row[1]) || 0;
        miner.price = parseFloat(row[2]) || 0;
        miner.dailyEarnings = parseFloat(row[3]) || 0;
        miner.powerConsumption = parseInt(row[4]) || 0;
        miner.efficiency = parseFloat(row[5]) || null;
      }

      // Look up power consumption from database if not provided
      if (!miner.powerConsumption && powerDatabase[miner.name]) {
        miner.powerConsumption = powerDatabase[miner.name];
      }

      // Calculate efficiency if we have power and hashrate
      if (miner.powerConsumption && miner.hashrate && !miner.efficiency) {
        miner.efficiency = miner.powerConsumption / miner.hashrate;
      }

      // Only add valid miners
      if (miner.name && miner.hashrate && miner.price) {
        miner.date = date || new Date().toISOString().split("T")[0];
        minerData.push(miner);
      }
    }

    return minerData;
  };

  // Handle file upload
  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (file) {
      setSelectedFile(file);
      const newMiners = await parseUploadedData(file, uploadDate);
      updatePriceHistory(newMiners, file.name);
    }
  };

  // Update price history and track new miners
  const updatePriceHistory = (newMiners, fileName = "Manual Upload") => {
    const updatedHistory = { ...priceHistory };
    const updatedSpecs = { ...minerSpecs };
    const currentlyKnown = new Set(knownMiners);
    const currentlyNew = new Set();
    const updatedMaxPrices = { ...maxPrices };
    const updatedPreviousPrices = { ...previousPrices };

    // Save current prices as previous prices before updating
    miners.forEach((miner) => {
      updatedPreviousPrices[miner.name] = miner.price;
    });

    newMiners.forEach((miner) => {
      const key = miner.name;

      // Track if this is a new miner
      if (!currentlyKnown.has(key)) {
        currentlyNew.add(key);
      }
      currentlyKnown.add(key);

      // Store miner specifications
      updatedSpecs[key] = {
        powerConsumption: miner.powerConsumption,
        efficiency: miner.efficiency,
        algorithm: miner.algorithm,
      };

      // Update price history
      if (!updatedHistory[key]) {
        updatedHistory[key] = [];
      }

      const existingIndex = updatedHistory[key].findIndex(
        (h) => h.date === miner.date
      );
      if (existingIndex >= 0) {
        updatedHistory[key][existingIndex] = {
          date: miner.date,
          price: miner.price,
          hashrate: miner.hashrate,
          dailyEarnings: miner.dailyEarnings,
          efficiency: miner.efficiency,
          powerConsumption: miner.powerConsumption,
        };
      } else {
        updatedHistory[key].push({
          date: miner.date,
          price: miner.price,
          hashrate: miner.hashrate,
          dailyEarnings: miner.dailyEarnings,
          efficiency: miner.efficiency,
          powerConsumption: miner.powerConsumption,
        });
      }

      updatedHistory[key].sort((a, b) => new Date(a.date) - new Date(b.date));

      // Update max price
      const currentMax = updatedMaxPrices[key] || 0;
      updatedMaxPrices[key] = Math.max(currentMax, miner.price);
    });

    // Add to upload history
    const newUpload = {
      date: uploadDate || new Date().toISOString().split("T")[0],
      fileName: fileName,
      minerCount: newMiners.length,
      newMinerCount: currentlyNew.size,
      timestamp: new Date().toISOString(),
    };

    const updatedUploadHistory = [...uploadHistory, newUpload];

    setMiners(newMiners);
    setPriceHistory(updatedHistory);
    setKnownMiners(currentlyKnown);
    setNewMiners(currentlyNew);
    setMinerSpecs(updatedSpecs);
    setUploadHistory(updatedUploadHistory);
    setMaxPrices(updatedMaxPrices);
    setPreviousPrices(updatedPreviousPrices);
    setUploadDate("");
    setSelectedFile(null);
  };

  // Calculate price changes
  const calculatePriceChanges = (miner) => {
    const currentPrice = miner.price;
    const maxPrice = maxPrices[miner.name] || currentPrice;
    const previousPrice = previousPrices[miner.name];

    const changeFromMax =
      maxPrice > 0
        ? (((currentPrice - maxPrice) / maxPrice) * 100).toFixed(1)
        : 0;
    const changeFromPrevious = previousPrice
      ? (((currentPrice - previousPrice) / previousPrice) * 100).toFixed(1)
      : null;

    return {
      changeFromMax: parseFloat(changeFromMax),
      changeFromPrevious: changeFromPrevious
        ? parseFloat(changeFromPrevious)
        : null,
    };
  };

  // Sort miners
  const sortedMiners = useMemo(() => {
    const filtered = miners.filter((miner) => {
      const matchesSearch = miner.name
        .toLowerCase()
        .includes(searchTerm.toLowerCase());
      const matchesEfficiency =
        !miner.efficiency || miner.efficiency <= filterEfficiency;
      const matchesNewFilter = !showOnlyNew || newMiners.has(miner.name);
      return matchesSearch && matchesEfficiency && matchesNewFilter;
    });

    if (!sortConfig.key) return filtered;

    return [...filtered].sort((a, b) => {
      let aValue, bValue;

      switch (sortConfig.key) {
        case "name":
          aValue = a.name;
          bValue = b.name;
          break;
        case "hashrate":
          aValue = a.hashrate || 0;
          bValue = b.hashrate || 0;
          break;
        case "power":
          aValue = a.powerConsumption || 0;
          bValue = b.powerConsumption || 0;
          break;
        case "efficiency":
          aValue = a.efficiency || 999;
          bValue = b.efficiency || 999;
          break;
        case "price":
          aValue = a.price || 0;
          bValue = b.price || 0;
          break;
        case "dailyEarnings":
          aValue = a.dailyEarnings || 0;
          bValue = b.dailyEarnings || 0;
          break;
        case "changeFromMax":
          aValue = calculatePriceChanges(a).changeFromMax;
          bValue = calculatePriceChanges(b).changeFromMax;
          break;
        case "changeFromPrevious":
          aValue = calculatePriceChanges(a).changeFromPrevious || -999;
          bValue = calculatePriceChanges(b).changeFromPrevious || -999;
          break;
        default:
          return 0;
      }

      if (aValue < bValue) return sortConfig.direction === "asc" ? -1 : 1;
      if (aValue > bValue) return sortConfig.direction === "asc" ? 1 : -1;
      return 0;
    });
  }, [
    miners,
    searchTerm,
    filterEfficiency,
    showOnlyNew,
    newMiners,
    sortConfig,
    maxPrices,
    previousPrices,
  ]);

  // Handle sort
  const handleSort = (key) => {
    setSortConfig((prevConfig) => ({
      key,
      direction:
        prevConfig.key === key && prevConfig.direction === "asc"
          ? "desc"
          : "asc",
    }));
  };

  // Get efficient miners (< 20 J/TH)
  const efficientMiners = useMemo(() => {
    return sortedMiners.filter((m) => m.efficiency && m.efficiency < 20);
  }, [sortedMiners]);

  // Apply researched power data for specific miners
  const applyResearchedPowerData = () => {
    // Specific power data for the researched miners
    const researchedPowerData = {
      "Antminer S21XP Hydro - 470 TH/s": 5676,
      "Antminer S21XP - 270 TH/s": 3645,
      "Antminer S19 XP Hyd - 257 TH/s": 5345,
      "Antminer S19XP Hyd - 246 TH/s": 5346,
      "WHATSMINER M50S+ - 138 TH/s": 3312,
      "WHATSMINER M50 - 124 TH/s": 3224,
      "Antminer S19k pro - 120 TH/s": 2760,
      "WHATSMINER M30S++ - 96 TH/s": 3456,
      "WHATSMINER M30S++ - 90 TH/s": 3456,
      "WHATSMINER M30S++ - 85 TH/s": 3456,
    };

    // Debug: Log all miner names that don't have efficiency
    const minersWithoutEfficiency = miners.filter((m) => !m.efficiency);
    console.log(
      "Miners without efficiency:",
      minersWithoutEfficiency.map((m) => ({
        name: m.name,
        nameLength: m.name.length,
        nameChars: Array.from(m.name).map((c) => c.charCodeAt(0)),
      }))
    );

    // Debug: Log researched data keys
    console.log("Researched data keys:", Object.keys(researchedPowerData));

    let updatedCount = 0;
    const notFoundMiners = [];

    const updatedMiners = miners.map((miner) => {
      const updatedMiner = { ...miner };

      // Try exact match first
      let powerValue = researchedPowerData[updatedMiner.name];

      // If no exact match, try trimming whitespace
      if (!powerValue) {
        const trimmedName = updatedMiner.name.trim();
        powerValue = researchedPowerData[trimmedName];
      }

      // If still no match, try normalizing spaces
      if (!powerValue) {
        const normalizedName = updatedMiner.name.replace(/\s+/g, " ").trim();
        powerValue = researchedPowerData[normalizedName];

        // Also check if any key in researchedPowerData matches after normalization
        if (!powerValue) {
          for (const [key, value] of Object.entries(researchedPowerData)) {
            if (key.replace(/\s+/g, " ").trim() === normalizedName) {
              powerValue = value;
              break;
            }
          }
        }
      }

      if (powerValue && !updatedMiner.efficiency) {
        console.log(`Updating ${updatedMiner.name} with power ${powerValue}W`);
        updatedMiner.powerConsumption = powerValue;

        // Calculate efficiency
        if (updatedMiner.hashrate) {
          updatedMiner.efficiency =
            updatedMiner.powerConsumption / updatedMiner.hashrate;
          updatedCount++;
        }
      } else if (
        !updatedMiner.efficiency &&
        researchedPowerData.hasOwnProperty(updatedMiner.name)
      ) {
        // This miner should have been updated but wasn't
        notFoundMiners.push(updatedMiner.name);
      }

      return updatedMiner;
    });

    // Log any miners that should have been updated but weren't
    if (notFoundMiners.length > 0) {
      console.error("Failed to update these miners:", notFoundMiners);
    }

    // Update miner specs
    const updatedSpecs = { ...minerSpecs };
    updatedMiners.forEach((miner) => {
      if (miner.efficiency) {
        updatedSpecs[miner.name] = {
          powerConsumption: miner.powerConsumption,
          efficiency: miner.efficiency,
          algorithm: miner.algorithm,
        };
      }
    });

    // Update price history
    const updatedHistory = { ...priceHistory };
    Object.keys(updatedHistory).forEach((minerName) => {
      const miner = updatedMiners.find((m) => m.name === minerName);
      if (miner && miner.efficiency) {
        updatedHistory[minerName] = updatedHistory[minerName].map((entry) => ({
          ...entry,
          efficiency: miner.efficiency,
          powerConsumption: miner.powerConsumption,
        }));
      }
    });

    setMiners(updatedMiners);
    setMinerSpecs(updatedSpecs);
    setPriceHistory(updatedHistory);

    // Show detailed results
    const stillMissing = updatedMiners.filter((m) => !m.efficiency).length;
    alert(
      `Applied power data to ${updatedCount} miners!\n${
        stillMissing > 0
          ? `Still missing efficiency for ${stillMissing} miners. Check console for details.`
          : "All miners now have efficiency data!"
      }`
    );
  };

  // Export data
  const exportData = () => {
    const data = {
      miners: miners,
      priceHistory: priceHistory,
      knownMiners: Array.from(knownMiners),
      minerSpecs: minerSpecs,
      uploadHistory: uploadHistory,
      maxPrices: maxPrices,
      previousPrices: previousPrices,
      exportDate: new Date().toISOString(),
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `miner-prices-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
  };

  // Recalculate efficiency for all miners
  const recalculateEfficiency = () => {
    const updatedMiners = miners.map((miner) => {
      const updatedMiner = { ...miner };

      // Always look up power consumption from database if available
      if (powerDatabase[updatedMiner.name]) {
        updatedMiner.powerConsumption = powerDatabase[updatedMiner.name];
      }

      // Calculate efficiency if we have power and hashrate
      if (updatedMiner.powerConsumption && updatedMiner.hashrate) {
        updatedMiner.efficiency =
          updatedMiner.powerConsumption / updatedMiner.hashrate;
      }

      return updatedMiner;
    });

    // Debug: Show miners without efficiency
    const minersWithoutEfficiency = updatedMiners.filter((m) => !m.efficiency);
    if (minersWithoutEfficiency.length > 0) {
      console.log(
        "Miners without efficiency:",
        minersWithoutEfficiency.map((m) => ({
          name: m.name,
          inDatabase: powerDatabase.hasOwnProperty(m.name),
          powerConsumption: m.powerConsumption,
          hashrate: m.hashrate,
        }))
      );
    }

    // Update miner specs
    const updatedSpecs = { ...minerSpecs };
    updatedMiners.forEach((miner) => {
      updatedSpecs[miner.name] = {
        powerConsumption: miner.powerConsumption,
        efficiency: miner.efficiency,
        algorithm: miner.algorithm,
      };
    });

    // Update price history with new efficiency data
    const updatedHistory = { ...priceHistory };
    Object.keys(updatedHistory).forEach((minerName) => {
      const miner = updatedMiners.find((m) => m.name === minerName);
      if (miner && miner.efficiency) {
        updatedHistory[minerName] = updatedHistory[minerName].map((entry) => ({
          ...entry,
          efficiency: miner.efficiency,
          powerConsumption: miner.powerConsumption,
        }));
      }
    });

    setMiners(updatedMiners);
    setMinerSpecs(updatedSpecs);
    setPriceHistory(updatedHistory);

    // Show success message
    const minersUpdated =
      updatedMiners.filter((m) => m.efficiency).length -
      miners.filter((m) => m.efficiency).length;
    if (minersUpdated > 0) {
      alert(`Successfully calculated efficiency for ${minersUpdated} miners!`);
    } else if (minersWithoutEfficiency.length > 0) {
      alert(
        `Could not calculate efficiency for ${minersWithoutEfficiency.length} miners. Check console for details.`
      );
    } else {
      alert("All miners already have efficiency calculated!");
    }
  };

  // Export miners without efficiency
  const exportMinersWithoutEfficiency = () => {
    const minersWithoutEfficiency = miners.filter((m) => !m.efficiency);

    if (minersWithoutEfficiency.length === 0) {
      alert("All miners have efficiency ratings!");
      return;
    }

    // Function to escape CSV fields
    const escapeCSV = (field) => {
      if (field === null || field === undefined) return "";
      const str = String(field);
      if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return '"' + str.replace(/"/g, '""') + '"';
      }
      return str;
    };

    // Create CSV header
    const headers = [
      "Name",
      "Hashrate (TH/s)",
      "Price (USD)",
      "Daily Earnings (USD)",
      "Power (W)",
      "Efficiency (J/TH)",
    ];

    // Create CSV rows
    const rows = minersWithoutEfficiency.map((m) => [
      escapeCSV(m.name),
      escapeCSV(m.hashrate),
      escapeCSV(m.price),
      escapeCSV(m.dailyEarnings),
      escapeCSV(m.powerConsumption || ""),
      escapeCSV(m.efficiency || ""),
    ]);

    // Combine header and rows
    const csvContent = [headers, ...rows]
      .map((row) => row.join(","))
      .join("\n");

    // Create and download file
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `miners-without-efficiency-${new Date().toISOString().split("T")[0]}.csv`
    );
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Calculate statistics
  const stats = useMemo(() => {
    const efficientCount = miners.filter(
      (m) => m.efficiency && m.efficiency <= 20
    ).length;
    const withoutEfficiencyCount = miners.filter((m) => !m.efficiency).length;
    const avgPrice =
      miners.reduce((sum, m) => sum + (m.price || 0), 0) / (miners.length || 1);
    const avgHashrate =
      miners.reduce((sum, m) => sum + (m.hashrate || 0), 0) /
      (miners.length || 1);
    const avgEfficiency =
      miners
        .filter((m) => m.efficiency)
        .reduce((sum, m) => sum + m.efficiency, 0) /
      (miners.filter((m) => m.efficiency).length || 1);

    return {
      totalMiners: miners.length,
      efficientMiners: efficientCount,
      withoutEfficiency: withoutEfficiencyCount,
      avgPrice: avgPrice.toFixed(2),
      avgHashrate: avgHashrate.toFixed(2),
      avgEfficiency: avgEfficiency.toFixed(2),
      newMinerCount: newMiners.size,
    };
  }, [miners, newMiners]);

  // Efficiency distribution chart data
  const efficiencyDistribution = useMemo(() => {
    const ranges = [
      { range: "< 15 J/TH", count: 0, color: "#10B981" },
      { range: "15-20 J/TH", count: 0, color: "#3B82F6" },
      { range: "20-25 J/TH", count: 0, color: "#F59E0B" },
      { range: "25-30 J/TH", count: 0, color: "#EF4444" },
      { range: "> 30 J/TH", count: 0, color: "#991B1B" },
    ];

    miners.forEach((miner) => {
      if (miner.efficiency) {
        if (miner.efficiency < 15) ranges[0].count++;
        else if (miner.efficiency < 20) ranges[1].count++;
        else if (miner.efficiency < 25) ranges[2].count++;
        else if (miner.efficiency < 30) ranges[3].count++;
        else ranges[4].count++;
      }
    });

    return ranges.filter((r) => r.count > 0);
  }, [miners]);

  // Sort indicator component
  const SortIndicator = ({ column }) => {
    if (sortConfig.key !== column) {
      return <ArrowUpDown size={14} className="opacity-50" />;
    }
    return sortConfig.direction === "asc" ? (
      <ArrowUp size={14} className="text-blue-400" />
    ) : (
      <ArrowDown size={14} className="text-blue-400" />
    );
  };

  // Format last saved time
  const formatLastSaved = () => {
    if (!lastSaved) return "Never";

    const date = new Date(lastSaved);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)} hours ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-8 text-center bg-gradient-to-r from-blue-400 to-purple-600 text-transparent bg-clip-text">
          Cryptocurrency Miner Price Tracker
        </h1>

        {/* Storage Status Bar */}
        <div className="bg-gray-800 rounded-lg p-4 mb-4 border border-gray-700 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              {saveStatus === "saved" && (
                <Save className="text-green-400" size={16} />
              )}
              {saveStatus === "saving" && (
                <Save className="text-yellow-400 animate-pulse" size={16} />
              )}
              {saveStatus === "error" && (
                <AlertCircle className="text-red-400" size={16} />
              )}
              <span className="text-sm text-gray-400">
                {saveStatus === "saved" && "All changes saved"}
                {saveStatus === "saving" && "Saving..."}
                {saveStatus === "error" && "Error saving data"}
              </span>
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <Clock size={14} />
              <span>Last saved: {formatLastSaved()}</span>
            </div>
            <div className="text-sm text-gray-500">
              Storage: {storageUtils.getStorageSize()} KB
            </div>
          </div>
          <button
            onClick={clearAllData}
            className="bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-sm flex items-center gap-2 transition-colors"
          >
            <Trash2 size={14} />
            Clear All Data
          </button>
        </div>

        {/* Stats Dashboard */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Total Miners</p>
                <p className="text-2xl font-bold">{stats.totalMiners}</p>
              </div>
              <Database className="text-blue-400" size={24} />
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Efficient</p>
                <p className="text-2xl font-bold">{stats.efficientMiners}</p>
              </div>
              <Zap className="text-green-400" size={24} />
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">No Efficiency</p>
                <p className="text-2xl font-bold">{stats.withoutEfficiency}</p>
              </div>
              <FileWarning className="text-orange-400" size={24} />
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">New Miners</p>
                <p className="text-2xl font-bold">{stats.newMinerCount}</p>
              </div>
              <Sparkles className="text-yellow-400" size={24} />
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Avg Price</p>
                <p className="text-2xl font-bold">${stats.avgPrice}</p>
              </div>
              <DollarSign className="text-yellow-400" size={24} />
            </div>
          </div>

          <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Avg J/TH</p>
                <p className="text-2xl font-bold">{stats.avgEfficiency}</p>
              </div>
              <Activity className="text-purple-400" size={24} />
            </div>
          </div>
        </div>

        {/* Upload Section */}
        <div className="bg-gray-800 rounded-lg p-6 mb-8 border border-gray-700">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <FileSpreadsheet size={20} />
            Upload Data
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Date of Data
              </label>
              <input
                type="date"
                value={uploadDate}
                onChange={(e) => setUploadDate(e.target.value)}
                className="bg-gray-700 border border-gray-600 rounded px-3 py-2 w-full md:w-auto"
              />
            </div>

            <div className="flex gap-4 flex-wrap items-center">
              <label className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded flex items-center gap-2 cursor-pointer transition-colors">
                <Upload size={16} />
                Upload Excel/CSV
                <input
                  type="file"
                  onChange={handleFileUpload}
                  className="hidden"
                  accept=".xlsx,.xls,.csv,.txt"
                />
              </label>

              {selectedFile && (
                <span className="text-sm text-gray-400">
                  Selected: {selectedFile.name}
                </span>
              )}

              <button
                onClick={exportData}
                className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded flex items-center gap-2 transition-colors"
              >
                <Download size={16} />
                Export All Data
              </button>

              <button
                onClick={exportMinersWithoutEfficiency}
                className="bg-orange-600 hover:bg-orange-700 px-4 py-2 rounded flex items-center gap-2 transition-colors"
                disabled={stats.withoutEfficiency === 0}
              >
                <FileWarning size={16} />
                Export No Efficiency ({stats.withoutEfficiency})
              </button>

              <button
                onClick={recalculateEfficiency}
                className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded flex items-center gap-2 transition-colors"
              >
                <Zap size={16} />
                Recalculate Efficiency
              </button>

              <button
                onClick={applyResearchedPowerData}
                className="bg-green-600 hover:bg-green-700 px-4 py-2 rounded flex items-center gap-2 transition-colors"
              >
                <Database size={16} />
                Apply Researched Data
              </button>
            </div>

            {newMiners.size > 0 && (
              <div className="bg-yellow-900/20 border border-yellow-600 rounded p-3">
                <p className="text-yellow-200 text-sm flex items-center gap-2">
                  <Sparkles size={16} />
                  {newMiners.size} new miner{newMiners.size > 1 ? "s" : ""}{" "}
                  detected in this upload!
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Upload History */}
        {uploadHistory.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-6 mb-8 border border-gray-700">
            <h2 className="text-xl font-semibold mb-4">Recent Uploads</h2>
            <div className="space-y-2">
              {uploadHistory
                .slice(-5)
                .reverse()
                .map((upload, idx) => (
                  <div
                    key={idx}
                    className="flex justify-between items-center text-sm"
                  >
                    <span className="text-gray-400">{upload.date}</span>
                    <span className="text-gray-300">{upload.fileName}</span>
                    <span className="text-gray-400">
                      {upload.minerCount} miners
                    </span>
                    {upload.newMinerCount > 0 && (
                      <span className="text-yellow-400">
                        +{upload.newMinerCount} new
                      </span>
                    )}
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Efficiency Distribution Chart */}
        {efficiencyDistribution.length > 0 && (
          <div className="bg-gray-800 rounded-lg p-6 mb-8 border border-gray-700">
            <h2 className="text-xl font-semibold mb-4">
              Efficiency Distribution
            </h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={efficiencyDistribution}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="range" stroke="#9CA3AF" />
                <YAxis stroke="#9CA3AF" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1F2937",
                    border: "1px solid #374151",
                  }}
                  labelStyle={{ color: "#9CA3AF" }}
                />
                <Bar dataKey="count" fill="#3B82F6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Filters */}
        <div className="bg-gray-800 rounded-lg p-6 mb-8 border border-gray-700">
          <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
            <Filter size={20} />
            Filters
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Search Miners
              </label>
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400"
                  size={16}
                />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by name..."
                  className="bg-gray-700 border border-gray-600 rounded pl-10 pr-3 py-2 w-full"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Max Efficiency (J/TH): {filterEfficiency}
              </label>
              <input
                type="range"
                min="10"
                max="50"
                value={filterEfficiency}
                onChange={(e) => setFilterEfficiency(parseInt(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>10</span>
                <span className="text-green-400">20 (Efficient)</span>
                <span>50</span>
              </div>
            </div>

            <div className="flex items-end">
              <button
                onClick={() => setShowOnlyNew(!showOnlyNew)}
                className={`px-4 py-2 rounded flex items-center gap-2 transition-colors ${
                  showOnlyNew
                    ? "bg-yellow-600 hover:bg-yellow-700"
                    : "bg-gray-700 hover:bg-gray-600"
                }`}
              >
                {showOnlyNew ? <Eye size={16} /> : <EyeOff size={16} />}
                {showOnlyNew ? "Showing New Only" : "Show All"}
              </button>
            </div>
          </div>
        </div>

        {/* Efficient Miners Summary */}
        {efficientMiners.length > 0 && (
          <div className="bg-green-900/20 border border-green-600 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-semibold mb-4 text-green-400 flex items-center gap-2">
              <Zap size={20} />
              Most Efficient Miners (&lt; 20 J/TH)
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {efficientMiners.slice(0, 6).map((miner, idx) => (
                <div key={idx} className="bg-gray-800/50 rounded p-3">
                  <p className="font-semibold text-sm">{miner.name}</p>
                  <div className="text-xs text-gray-400 mt-1">
                    <span className="text-green-400">
                      {miner.efficiency?.toFixed(1)} J/TH
                    </span>{" "}
                    •<span> {miner.hashrate} TH/s</span> •
                    <span> ${miner.price}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Miner List */}
        <div className="bg-gray-800 rounded-lg p-6 mb-8 border border-gray-700">
          <h2 className="text-xl font-semibold mb-4">
            Current Miners ({sortedMiners.length})
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-700">
                  <th
                    className="text-left py-3 px-4 cursor-pointer hover:bg-gray-700/50"
                    onClick={() => handleSort("name")}
                  >
                    <div className="flex items-center gap-1">
                      Name
                      <SortIndicator column="name" />
                    </div>
                  </th>
                  <th
                    className="text-right py-3 px-4 cursor-pointer hover:bg-gray-700/50"
                    onClick={() => handleSort("hashrate")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Hashrate
                      <SortIndicator column="hashrate" />
                    </div>
                  </th>
                  <th
                    className="text-right py-3 px-4 cursor-pointer hover:bg-gray-700/50"
                    onClick={() => handleSort("power")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Power
                      <SortIndicator column="power" />
                    </div>
                  </th>
                  <th
                    className="text-right py-3 px-4 cursor-pointer hover:bg-gray-700/50"
                    onClick={() => handleSort("efficiency")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Efficiency
                      <SortIndicator column="efficiency" />
                    </div>
                  </th>
                  <th
                    className="text-right py-3 px-4 cursor-pointer hover:bg-gray-700/50"
                    onClick={() => handleSort("price")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Price
                      <SortIndicator column="price" />
                    </div>
                  </th>
                  <th
                    className="text-right py-3 px-4 cursor-pointer hover:bg-gray-700/50"
                    onClick={() => handleSort("changeFromMax")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      vs Max
                      <SortIndicator column="changeFromMax" />
                    </div>
                  </th>
                  <th
                    className="text-right py-3 px-4 cursor-pointer hover:bg-gray-700/50"
                    onClick={() => handleSort("changeFromPrevious")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      vs Prior
                      <SortIndicator column="changeFromPrevious" />
                    </div>
                  </th>
                  <th
                    className="text-right py-3 px-4 cursor-pointer hover:bg-gray-700/50"
                    onClick={() => handleSort("dailyEarnings")}
                  >
                    <div className="flex items-center justify-end gap-1">
                      Daily $
                      <SortIndicator column="dailyEarnings" />
                    </div>
                  </th>
                  <th className="text-center py-3 px-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {sortedMiners.map((miner, index) => {
                  const priceChanges = calculatePriceChanges(miner);
                  return (
                    <tr
                      key={index}
                      className={`border-b border-gray-700 hover:bg-gray-700/50 ${
                        newMiners.has(miner.name) ? "bg-yellow-900/10" : ""
                      }`}
                    >
                      <td className="py-3 px-4">
                        {miner.name}
                        {newMiners.has(miner.name) && (
                          <Sparkles
                            className="inline ml-2 text-yellow-400"
                            size={14}
                          />
                        )}
                      </td>
                      <td className="text-right py-3 px-4">
                        {miner.hashrate} TH/s
                      </td>
                      <td className="text-right py-3 px-4">
                        {miner.powerConsumption
                          ? `${miner.powerConsumption}W`
                          : "N/A"}
                      </td>
                      <td className="text-right py-3 px-4">
                        {miner.efficiency ? (
                          <span
                            className={
                              miner.efficiency < 15
                                ? "text-green-400 font-bold"
                                : miner.efficiency <= 20
                                ? "text-green-400"
                                : miner.efficiency <= 25
                                ? "text-yellow-400"
                                : "text-red-400"
                            }
                          >
                            {miner.efficiency.toFixed(1)} J/TH
                          </span>
                        ) : (
                          <span className="text-gray-500">N/A</span>
                        )}
                      </td>
                      <td className="text-right py-3 px-4">
                        ${miner.price.toFixed(2)}
                      </td>
                      <td className="text-right py-3 px-4">
                        <span
                          className={
                            priceChanges.changeFromMax < 0
                              ? "text-green-400"
                              : priceChanges.changeFromMax > 0
                              ? "text-red-400"
                              : "text-gray-400"
                          }
                        >
                          {priceChanges.changeFromMax > 0 ? "+" : ""}
                          {priceChanges.changeFromMax}%
                        </span>
                      </td>
                      <td className="text-right py-3 px-4">
                        {priceChanges.changeFromPrevious !== null ? (
                          <span
                            className={
                              priceChanges.changeFromPrevious < 0
                                ? "text-green-400"
                                : priceChanges.changeFromPrevious > 0
                                ? "text-red-400"
                                : "text-gray-400"
                            }
                          >
                            {priceChanges.changeFromPrevious > 0 ? "+" : ""}
                            {priceChanges.changeFromPrevious}%
                          </span>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </td>
                      <td className="text-right py-3 px-4">
                        ${miner.dailyEarnings.toFixed(2)}
                      </td>
                      <td className="text-center py-3 px-4">
                        <button
                          onClick={() => setSelectedMiner(miner.name)}
                          className="text-blue-400 hover:text-blue-300"
                        >
                          <TrendingUp size={16} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Price History Chart */}
        {selectedMiner && priceHistory[selectedMiner] && (
          <div className="bg-gray-800 rounded-lg p-6 border border-gray-700">
            <h2 className="text-xl font-semibold mb-4">
              Price History: {selectedMiner}
            </h2>

            <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="bg-gray-700 rounded p-3">
                <p className="text-gray-400">Current Efficiency</p>
                <p className="text-xl font-bold">
                  {minerSpecs[selectedMiner]?.efficiency ? (
                    <span
                      className={
                        minerSpecs[selectedMiner].efficiency <= 20
                          ? "text-green-400"
                          : "text-yellow-400"
                      }
                    >
                      {minerSpecs[selectedMiner].efficiency.toFixed(1)} J/TH
                    </span>
                  ) : (
                    "N/A"
                  )}
                </p>
              </div>
              <div className="bg-gray-700 rounded p-3">
                <p className="text-gray-400">Power Draw</p>
                <p className="text-xl font-bold">
                  {minerSpecs[selectedMiner]?.powerConsumption || "N/A"} W
                </p>
              </div>
              <div className="bg-gray-700 rounded p-3">
                <p className="text-gray-400">Latest Price</p>
                <p className="text-xl font-bold">
                  $
                  {priceHistory[selectedMiner][
                    priceHistory[selectedMiner].length - 1
                  ]?.price || "N/A"}
                </p>
              </div>
              <div className="bg-gray-700 rounded p-3">
                <p className="text-gray-400">Price Change</p>
                <p className="text-xl font-bold">
                  {priceHistory[selectedMiner].length > 1
                    ? (() => {
                        const history = priceHistory[selectedMiner];
                        const change = (
                          ((history[history.length - 1].price -
                            history[0].price) /
                            history[0].price) *
                          100
                        ).toFixed(1);
                        return (
                          <span
                            className={
                              change > 0 ? "text-red-400" : "text-green-400"
                            }
                          >
                            {change > 0 ? "+" : ""}
                            {change}%
                          </span>
                        );
                      })()
                    : "N/A"}
                </p>
              </div>
            </div>

            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={priceHistory[selectedMiner]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="date" stroke="#9CA3AF" />
                <YAxis stroke="#9CA3AF" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1F2937",
                    border: "1px solid #374151",
                  }}
                  labelStyle={{ color: "#9CA3AF" }}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="price"
                  stroke="#3B82F6"
                  strokeWidth={2}
                  dot={{ fill: "#3B82F6" }}
                  name="Price (USD)"
                />
                <Line
                  type="monotone"
                  dataKey="dailyEarnings"
                  stroke="#10B981"
                  strokeWidth={2}
                  dot={{ fill: "#10B981" }}
                  name="Daily Earnings (USD)"
                />
              </LineChart>
            </ResponsiveContainer>

            <button
              onClick={() => setSelectedMiner(null)}
              className="mt-4 text-gray-400 hover:text-gray-300"
            >
              Close Chart
            </button>
          </div>
        )}

        {/* Instructions */}
        <div className="bg-gray-800 rounded-lg p-6 mt-8 border border-gray-700">
          <h2 className="text-xl font-semibold mb-4">Instructions</h2>
          <div className="space-y-2 text-gray-300">
            <p>
              • Upload Excel (.xlsx) or CSV files with miner data including
              prices, hashrates, and power consumption
            </p>
            <p>
              • The tool automatically calculates efficiency (J/TH) from power
              consumption and hashrate
            </p>
            <p>
              • New miners appearing in uploads are highlighted with a sparkle
              icon ✨
            </p>
            <p>
              • Price changes show:{" "}
              <span className="text-green-400">green = price decreased</span>,{" "}
              <span className="text-red-400">red = price increased</span>
            </p>
            <p>
              • Click column headers to sort the table - click again to reverse
              order
            </p>
            <p>
              • Use "Export No Efficiency" button to export miners missing
              efficiency data for research
            </p>
            <p>
              • Filter miners by efficiency - focus on miners below 20 J/TH for
              best energy efficiency
            </p>
            <p>• Click the trend icon to view price history for any miner</p>
            <p>
              •{" "}
              <strong>
                Data is automatically saved to browser storage and persists
                across sessions
              </strong>
            </p>
            <p>
              •{" "}
              <strong>
                Use "Clear All Data" button with caution - it permanently
                deletes all stored data
              </strong>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MinerPriceTracker;