document.addEventListener('DOMContentLoaded', function () {
  const DEFAULT_UPDATE_THRESHOLD_DAYS = 6;
  const DEFAULT_UPDATE_INDICATOR = {
    freshEmoji: '✅',
    staleEmoji: '❌',
  };

  const defaultConfig = {
    ageBands: [
      { maxDays: 7, color: '#f9e79f' },
      { maxDays: 30, color: '#f0ad4e' },
      { maxDays: 90, color: '#e67e22' },
      { maxDays: 9999, color: '#d9534f' },
    ],
    updateThresholdDays: DEFAULT_UPDATE_THRESHOLD_DAYS,
    updateIndicator: { ...DEFAULT_UPDATE_INDICATOR },
  };

  const defaultStorage = { defaultConfig: defaultConfig, boards: {} };

  const statusDiv = document.getElementById('status');
  const tableBody = document.querySelector('#ageBandsTable tbody');
  const boardSelect = document.getElementById('boardSelect');
  const thresholdInput = document.getElementById('thresholdInput');
  const freshEmojiInput = document.getElementById('freshEmojiInput');
  const staleEmojiInput = document.getElementById('staleEmojiInput');

  let fullConfig = null;
  let currentBoardId = null; // null means default config

  // Load config from chrome.storage.sync or fallback to defaults.
  function loadConfig(callback) {
    if (
      typeof chrome !== 'undefined' &&
      chrome.storage &&
      chrome.storage.sync
    ) {
      chrome.storage.sync.get(
        { vtbEnhancerConfig: defaultStorage },
        function (data) {
          let cfg = data.vtbEnhancerConfig;
          // Migrate old format { ageBands: [...] }
          if (cfg && cfg.ageBands) {
            cfg = { defaultConfig: cfg, boards: {} };
          }
          callback(normalizeConfigStructure(cfg));
        }
      );
    } else {
      callback(normalizeConfigStructure(defaultStorage));
    }
  }

  // Save configuration using chrome.storage.sync.
  function saveConfig(config, callback) {
    if (
      typeof chrome !== 'undefined' &&
      chrome.storage &&
      chrome.storage.sync
    ) {
      chrome.storage.sync.set({ vtbEnhancerConfig: config }, function () {
        if (callback) callback();
      });
    } else {
      localStorage.setItem('vtbEnhancerConfig', JSON.stringify(config));
      if (callback) callback();
    }
  }

  function normalizeConfigStructure(config) {
    let cfg = config;
    if (!cfg || typeof cfg !== 'object') {
      cfg = JSON.parse(JSON.stringify(defaultStorage));
    }

    if (!cfg.defaultConfig || typeof cfg.defaultConfig !== 'object') {
      cfg.defaultConfig = JSON.parse(JSON.stringify(defaultConfig));
    }

    if (!Array.isArray(cfg.defaultConfig.ageBands)) {
      cfg.defaultConfig.ageBands = defaultConfig.ageBands.map((b) => ({ ...b }));
    }

    if (
      typeof cfg.defaultConfig.updateThresholdDays !== 'number' ||
      cfg.defaultConfig.updateThresholdDays < 0
    ) {
      cfg.defaultConfig.updateThresholdDays = DEFAULT_UPDATE_THRESHOLD_DAYS;
    }

    if (
      !cfg.defaultConfig.updateIndicator ||
      typeof cfg.defaultConfig.updateIndicator !== 'object'
    ) {
      cfg.defaultConfig.updateIndicator = { ...DEFAULT_UPDATE_INDICATOR };
    } else {
      cfg.defaultConfig.updateIndicator = normalizeIndicator(
        cfg.defaultConfig.updateIndicator,
        DEFAULT_UPDATE_INDICATOR
      );
    }

    if (!cfg.boards || typeof cfg.boards !== 'object') {
      cfg.boards = {};
    }

    Object.keys(cfg.boards).forEach((boardId) => {
      let boardCfg = cfg.boards[boardId];
      if (!boardCfg || typeof boardCfg !== 'object') {
        cfg.boards[boardId] = { name: typeof boardCfg === 'string' ? boardCfg : boardId };
        boardCfg = cfg.boards[boardId];
      } else if (!boardCfg.name) {
        boardCfg.name = boardId;
      }
      boardCfg.updateIndicator = normalizeIndicator(
        boardCfg.updateIndicator,
        cfg.defaultConfig.updateIndicator
      );
    });

    return cfg;
  }

  function normalizeIndicator(source, fallback) {
    const base = fallback || DEFAULT_UPDATE_INDICATOR;
    if (!source || typeof source !== 'object') {
      return { ...base };
    }
    const fresh =
      typeof source.freshEmoji === 'string' && source.freshEmoji.trim()
        ? source.freshEmoji
        : base.freshEmoji;
    const stale =
      typeof source.staleEmoji === 'string' && source.staleEmoji.trim()
        ? source.staleEmoji
        : base.staleEmoji;
    return { freshEmoji: fresh, staleEmoji: stale };
  }

  // Render the table and threshold inputs based directly on a provided configuration object.
  function renderConfigToUI(config) {
    const thresholdValue =
      typeof config.updateThresholdDays === 'number' && config.updateThresholdDays >= 0
        ? config.updateThresholdDays
        : defaultConfig.updateThresholdDays;
    thresholdInput.value = thresholdValue;

    const indicator = normalizeIndicator(config.updateIndicator, defaultConfig.updateIndicator);
    freshEmojiInput.value = indicator.freshEmoji;
    staleEmojiInput.value = indicator.staleEmoji;

    tableBody.innerHTML = '';
    config.ageBands.forEach((band) => {
      const row = createRow(band);
      tableBody.appendChild(row);
    });
  }

  function refreshTable() {
    let bands = getBandsFromTable();
    bands.sort((a, b) => a.maxDays - b.maxDays);
    if (bands.length === 0 || bands[bands.length - 1].maxDays !== 9999) {
      bands.push({ maxDays: 9999, color: '#d9534f' });
    }
    tableBody.innerHTML = '';
    bands.forEach((band) => {
      const row = createRow(band);
      tableBody.appendChild(row);
    });
  }

  function createRow(band) {
    const tr = document.createElement('tr');

    const tdDays = document.createElement('td');
    if (band.maxDays === 9999) {
      const span = document.createElement('span');
      span.textContent = '∞';
      tdDays.appendChild(span);
    } else {
      const inputDays = document.createElement('input');
      inputDays.type = 'number';
      inputDays.min = '0';
      inputDays.value = band.maxDays;
      tdDays.appendChild(inputDays);
    }
    tr.appendChild(tdDays);

    const tdColor = document.createElement('td');
    const inputColor = document.createElement('input');
    inputColor.type = 'color';
    inputColor.value = band.color;
    tdColor.appendChild(inputColor);
    tr.appendChild(tdColor);

    const tdAction = document.createElement('td');
    if (band.maxDays !== 9999) {
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'action-btn';
      deleteBtn.textContent = '✕';
      deleteBtn.title = 'Delete this age band';
      deleteBtn.addEventListener('click', () => {
        tr.remove();
        refreshTable();
      });
      tdAction.appendChild(deleteBtn);
    }
    tr.appendChild(tdAction);

    return tr;
  }

  function getBandsFromTable() {
    const newBands = [];
    const rows = tableBody.querySelectorAll('tr');
    rows.forEach((row) => {
      const daysInput = row.querySelector('td:nth-child(1) input');
      let maxDays;
      if (daysInput) {
        maxDays = parseInt(daysInput.value, 10);
        if (isNaN(maxDays) || maxDays < 0 || maxDays === 0) return;
      } else {
        maxDays = 9999;
      }
      const colorInput = row.querySelector('td:nth-child(2) input');
      newBands.push({ maxDays: maxDays, color: colorInput.value });
    });
    return newBands;
  }

  function getThresholdFromInput() {
    let value = parseFloat(thresholdInput.value);
    if (isNaN(value) || value < 0) {
      value = defaultConfig.updateThresholdDays;
    }
    return value;
  }

  function getIndicatorFromInputs() {
    const fresh = freshEmojiInput.value.trim() || defaultConfig.updateIndicator.freshEmoji;
    const stale = staleEmojiInput.value.trim() || defaultConfig.updateIndicator.staleEmoji;
    return { freshEmoji: fresh, staleEmoji: stale };
  }

  function populateBoardSelect() {
    boardSelect.innerHTML = '';
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Default (All Boards)';
    boardSelect.appendChild(defaultOption);
    Object.keys(fullConfig.boards).forEach((id) => {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = fullConfig.boards[id].name || id;
      boardSelect.appendChild(opt);
    });
    boardSelect.value = currentBoardId || '';
  }

  function getCurrentConfig() {
    if (!currentBoardId) return fullConfig.defaultConfig;
    const board = fullConfig.boards[currentBoardId];
    if (board) {
      const ageBands = board.ageBands
        ? board.ageBands.map((b) => ({ ...b }))
        : fullConfig.defaultConfig.ageBands.map((b) => ({ ...b }));
      const threshold =
        typeof board.updateThresholdDays === 'number' && board.updateThresholdDays >= 0
          ? board.updateThresholdDays
          : fullConfig.defaultConfig.updateThresholdDays;
      return {
        ageBands,
        updateThresholdDays: threshold,
        updateIndicator: normalizeIndicator(
          board.updateIndicator,
          fullConfig.defaultConfig.updateIndicator
        ),
      };
    }
    return {
      ageBands: fullConfig.defaultConfig.ageBands.map((b) => ({ ...b })),
      updateThresholdDays: fullConfig.defaultConfig.updateThresholdDays,
      updateIndicator: { ...fullConfig.defaultConfig.updateIndicator },
    };
  }

  boardSelect.addEventListener('change', () => {
    currentBoardId = boardSelect.value || null;
    renderConfigToUI(getCurrentConfig());
  });

  document.getElementById('addRowBtn').addEventListener('click', () => {
    let bands = getBandsFromTable();
    const infinityBand =
      bands.find((b) => b.maxDays === 9999) || { maxDays: 9999, color: '#d9534f' };
    bands.push({ maxDays: 1, color: '#ffffff' });
    bands = bands.filter((b) => b.maxDays !== 9999);
    bands.sort((a, b) => a.maxDays - b.maxDays);
    bands.push(infinityBand);
    tableBody.innerHTML = '';
    bands.forEach((band) => tableBody.appendChild(createRow(band)));
  });

  document.getElementById('saveBtn').addEventListener('click', () => {
    const newBands = getBandsFromTable();
    const thresholdValue = getThresholdFromInput();
    const indicatorValue = getIndicatorFromInputs();
    if (currentBoardId) {
      if (!fullConfig.boards[currentBoardId]) {
        fullConfig.boards[currentBoardId] = {
          name: boardSelect.options[boardSelect.selectedIndex].text,
        };
      }
      fullConfig.boards[currentBoardId].ageBands = newBands;
      fullConfig.boards[currentBoardId].updateThresholdDays = thresholdValue;
      fullConfig.boards[currentBoardId].updateIndicator = indicatorValue;
    } else {
      fullConfig.defaultConfig.ageBands = newBands;
      fullConfig.defaultConfig.updateThresholdDays = thresholdValue;
      fullConfig.defaultConfig.updateIndicator = indicatorValue;
    }
    saveConfig(fullConfig, function () {
      statusDiv.textContent = 'Configuration saved.';
      setTimeout(() => {
        statusDiv.textContent = '';
      }, 2000);
    });
  });

  document.getElementById('resetBtn').addEventListener('click', () => {
    if (currentBoardId) {
      if (fullConfig.boards[currentBoardId]) {
        delete fullConfig.boards[currentBoardId].ageBands;
        delete fullConfig.boards[currentBoardId].updateThresholdDays;
        delete fullConfig.boards[currentBoardId].updateIndicator;
      }
    } else {
      fullConfig.defaultConfig.ageBands = defaultConfig.ageBands.map((b) => ({ ...b }));
      fullConfig.defaultConfig.updateThresholdDays = defaultConfig.updateThresholdDays;
      fullConfig.defaultConfig.updateIndicator = { ...defaultConfig.updateIndicator };
    }
    renderConfigToUI(getCurrentConfig());
    saveConfig(fullConfig, function () {
      statusDiv.textContent = 'Configuration reset to default.';
      setTimeout(() => {
        statusDiv.textContent = '';
      }, 2000);
    });
  });

  loadConfig(function (config) {
    fullConfig = config;
    populateBoardSelect();
    renderConfigToUI(getCurrentConfig());
  });
});
