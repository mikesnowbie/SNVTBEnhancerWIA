/*
  ServiceNow Visual Task Board Enhancer - Work Item Age
  Version 0.7
  - Waits until the board has fully loaded all cards (using a MutationObserver with a debounce)
    before processing any cards or displaying a status message.
  - Processes each card to calculate and display an "Age" badge. It prefers the card’s "Actual start date", which teams can manage independently of when the record was opened, and treats "Start date" as the same starting point before finally falling back to "Opened" when no start date exists.
  - Badge background color is determined by configurable age bands loaded from chrome.storage.sync.
  - Continues watching the DOM for new card elements and applies the badge automatically.
*/
(function () {
  if (!window.location.href.includes('vtb.do')) return;

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

  const boardIdMatch = window.location.href.match(/sysparm_board=([^&]+)/);
  const boardId = boardIdMatch ? boardIdMatch[1] : null;

  function getConfig(callback) {
    if (
      typeof chrome !== 'undefined' &&
      chrome.storage &&
      chrome.storage.sync
    ) {
      chrome.storage.sync.get(
        { vtbEnhancerConfig: defaultStorage },
        function (data) {
          let cfg = data.vtbEnhancerConfig;
          if (cfg && cfg.ageBands) {
            cfg = { defaultConfig: cfg, boards: {} };
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
            cfg.defaultConfig.updateIndicator = {
              freshEmoji:
                typeof cfg.defaultConfig.updateIndicator.freshEmoji === 'string' &&
                cfg.defaultConfig.updateIndicator.freshEmoji.trim()
                  ? cfg.defaultConfig.updateIndicator.freshEmoji
                  : DEFAULT_UPDATE_INDICATOR.freshEmoji,
              staleEmoji:
                typeof cfg.defaultConfig.updateIndicator.staleEmoji === 'string' &&
                cfg.defaultConfig.updateIndicator.staleEmoji.trim()
                  ? cfg.defaultConfig.updateIndicator.staleEmoji
                  : DEFAULT_UPDATE_INDICATOR.staleEmoji,
            };
          }

          if (!cfg.boards || typeof cfg.boards !== 'object') {
            cfg.boards = {};
          }

          Object.keys(cfg.boards).forEach((key) => {
            const boardCfg = cfg.boards[key];
            if (!boardCfg || typeof boardCfg !== 'object') return;
            if (typeof boardCfg.updateThresholdDays !== 'number') {
              boardCfg.updateThresholdDays = cfg.defaultConfig.updateThresholdDays;
            }

            if (!boardCfg.updateIndicator || typeof boardCfg.updateIndicator !== 'object') {
              boardCfg.updateIndicator = { ...cfg.defaultConfig.updateIndicator };
            } else {
              boardCfg.updateIndicator = {
                freshEmoji:
                  typeof boardCfg.updateIndicator.freshEmoji === 'string' &&
                  boardCfg.updateIndicator.freshEmoji.trim()
                    ? boardCfg.updateIndicator.freshEmoji
                    : cfg.defaultConfig.updateIndicator.freshEmoji,
                staleEmoji:
                  typeof boardCfg.updateIndicator.staleEmoji === 'string' &&
                  boardCfg.updateIndicator.staleEmoji.trim()
                    ? boardCfg.updateIndicator.staleEmoji
                    : cfg.defaultConfig.updateIndicator.staleEmoji,
              };
            }
          });
          callback(cfg);
        }
      );
    } else {
      callback(defaultStorage);
    }
  }

  function saveConfig(cfg, callback) {
    if (
      typeof chrome !== 'undefined' &&
      chrome.storage &&
      chrome.storage.sync
    ) {
      chrome.storage.sync.set({ vtbEnhancerConfig: cfg }, () => {
        if (callback) callback();
      });
    } else {
      localStorage.setItem('vtbEnhancerConfig', JSON.stringify(cfg));
      if (callback) callback();
    }
  }

  function updateBoardInfo(cfg) {
    if (!boardId) return;
    // Prevent prototype pollution
    if (boardId === '__proto__' || boardId === 'constructor' || boardId === 'prototype') return;
    const label = document.querySelector('label.sn-navhub-title');
    if (!label) return;
    const name = label.textContent.trim();
    if (!cfg.boards[boardId]) {
      cfg.boards[boardId] = { name: name };
      saveConfig(cfg);
    } else if (cfg.boards[boardId].name !== name) {
      cfg.boards[boardId].name = name;
      saveConfig(cfg);
    }
  }

  // Load config then run the main logic.
  getConfig(function (fullConfig) {
    const boardConfig = boardId ? fullConfig.boards[boardId] : null;
    const boardIndicator =
      (boardConfig && boardConfig.updateIndicator) ||
      fullConfig.defaultConfig.updateIndicator ||
      DEFAULT_UPDATE_INDICATOR;
    const normalizedIndicator = {
      freshEmoji:
        typeof boardIndicator.freshEmoji === 'string' &&
        boardIndicator.freshEmoji.trim()
          ? boardIndicator.freshEmoji
          : DEFAULT_UPDATE_INDICATOR.freshEmoji,
      staleEmoji:
        typeof boardIndicator.staleEmoji === 'string' &&
        boardIndicator.staleEmoji.trim()
          ? boardIndicator.staleEmoji
          : DEFAULT_UPDATE_INDICATOR.staleEmoji,
    };

    const config = {
      ageBands:
        boardConfig && boardConfig.ageBands
          ? boardConfig.ageBands
          : fullConfig.defaultConfig.ageBands,
      updateThresholdDays:
        boardConfig && typeof boardConfig.updateThresholdDays === 'number'
          ? boardConfig.updateThresholdDays
          : fullConfig.defaultConfig.updateThresholdDays || DEFAULT_UPDATE_THRESHOLD_DAYS,
      updateIndicator: normalizedIndicator,
    };
    // --- Utility Functions ---
    function showDebugMessage(msg) {
      const div = document.createElement('div');
      div.textContent = msg;
      Object.assign(div.style, {
        position: 'fixed',
        top: '10px',
        right: '10px',
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        color: '#fff',
        padding: '5px 10px',
        borderRadius: '4px',
        zIndex: '9999',
        fontSize: '14px',
      });
      document.body.appendChild(div);
      setTimeout(() => div.remove(), 3000);
    }

    const MS_PER_DAY = 1000 * 60 * 60 * 24;

    function calculateDaysDiff(dateStr) {
      const d = new Date(dateStr);
      if (isNaN(d)) return null;
      return Math.floor((Date.now() - d.getTime()) / MS_PER_DAY);
    }

    function parseServiceNowDateTime(dateStr) {
      if (!dateStr || typeof dateStr !== 'string') return null;
      const match = dateStr.trim().match(
        /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/
      );
      if (!match) {
        const fallback = new Date(dateStr);
        return isNaN(fallback) ? null : fallback;
      }
      const [, year, month, day, hour, minute, second] = match.map((v, idx) =>
        idx === 0 ? v : parseInt(v, 10)
      );
      const parsedDate = new Date(
        year,
        month - 1,
        day,
        hour,
        minute,
        second
      );
      return isNaN(parsedDate) ? null : parsedDate;
    }

    function annotateLastUpdated(card) {
      let timeElement = card.querySelector(
        'sn-time-ago[timestamp="sysUpdatedOn"] time[data-original-title]'
      );
      if (!timeElement) {
        timeElement = card.querySelector('sn-time-ago time[data-original-title]');
      }
      if (!timeElement) return;

      if (timeElement.querySelector('.vtb-enhancer-update-indicator')) return;

      const originalTitle = timeElement.getAttribute('data-original-title');
      const lastUpdated = parseServiceNowDateTime(originalTitle);
      if (!lastUpdated) return;

      let elapsedMs = Date.now() - lastUpdated.getTime();
      if (!Number.isFinite(elapsedMs)) return;
      if (elapsedMs < 0) elapsedMs = 0;

      const daysSinceUpdate = elapsedMs / MS_PER_DAY;
      const threshold =
        typeof config.updateThresholdDays === 'number'
          ? config.updateThresholdDays
          : DEFAULT_UPDATE_THRESHOLD_DAYS;
      const isStale = daysSinceUpdate > threshold;
      const indicatorSpan = document.createElement('span');
      indicatorSpan.className = 'vtb-enhancer-update-indicator';
      indicatorSpan.setAttribute('aria-hidden', 'true');
      indicatorSpan.style.marginLeft = '4px';
      const indicator = config.updateIndicator || DEFAULT_UPDATE_INDICATOR;
      const freshEmoji = indicator.freshEmoji || DEFAULT_UPDATE_INDICATOR.freshEmoji;
      const staleEmoji = indicator.staleEmoji || DEFAULT_UPDATE_INDICATOR.staleEmoji;
      indicatorSpan.textContent = isStale ? staleEmoji : freshEmoji;

      const srSpan = document.createElement('span');
      srSpan.className = 'sr-only vtb-enhancer-update-indicator-text';
      srSpan.textContent = isStale
        ? `Card has not been updated within the configured threshold (${staleEmoji}).`
        : `Card updated within the configured threshold (${freshEmoji}).`;

      timeElement.appendChild(indicatorSpan);
      timeElement.appendChild(srSpan);
    }

    function normalizeDateLabel(text) {
      return text.trim().replace(/\s*:\s*$/, '').toLocaleLowerCase();
    }

    const DATE_LABELS = {
      ACTUAL_START: 'actual start date',
      START: 'start date',
      OPENED: 'opened',
    };

    const DATE_PRIORITY = [
      DATE_LABELS.ACTUAL_START,
      DATE_LABELS.START,
      DATE_LABELS.OPENED,
    ];

    // Return the card's starting point for calculating age.
    // Both "Actual start date" and "Start date" mark when work begins, so treat them as
    // interchangeable with "Actual start date" preferred when both exist. If neither
    // start date is provided, fall back to "Opened" as a backup that represents when
    // the record was created.
    function findStartDate(card) {
      const liList = card.querySelectorAll('li.ng-scope');
      const detectedDates = {};

      for (const li of liList) {
        const spans = li.querySelectorAll(
          'span.sn-widget-list-table-cell.ng-binding'
        );
        if (spans.length < 2) continue;

        const value = spans[1].textContent.trim();
        if (!value) continue;

        const normalizedLabel = normalizeDateLabel(spans[0].textContent);
        if (DATE_PRIORITY.includes(normalizedLabel) && !detectedDates[normalizedLabel]) {
          detectedDates[normalizedLabel] = value;
        }
      }

      for (const label of DATE_PRIORITY) {
        if (detectedDates[label]) {
          return detectedDates[label];
        }
      }

      return null;
    }

    function findState(card) {
      const liList = card.querySelectorAll('li.ng-scope');
      for (const li of liList) {
        const spans = li.querySelectorAll(
          'span.sn-widget-list-table-cell.ng-binding'
        );
        if (spans.length >= 2 && spans[0].textContent.trim() === 'State') {
          return spans[1].textContent.trim();
        }
      }
      return null;
    }

    function getBadgeColor(age) {
      for (const band of config.ageBands) {
        if (age < band.maxDays) return band.color;
      }
      return '#000000';
    }

    // Returns black or white depending on background brightness.
    function getContrastColor(hexColor) {
      try {
        if (hexColor[0] === '#') hexColor = hexColor.substring(1);
        const r = parseInt(hexColor.substr(0, 2), 16);
        const g = parseInt(hexColor.substr(2, 2), 16);
        const b = parseInt(hexColor.substr(4, 2), 16);
        const brightness = (r * 299 + g * 587 + b * 114) / 1000;
        return brightness > 128 ? '#000000' : '#ffffff';
      } catch (e) {
        return '#000000';
      }
    }

    function createBadge(text, bgColor) {
      const badge = document.createElement('div');
      badge.textContent = text;
      const textColor = getContrastColor(bgColor);
      Object.assign(badge.style, {
        backgroundColor: bgColor,
        color: textColor,
        padding: '4px 8px',
        borderRadius: '4px',
        fontSize: '12px',
        fontWeight: 'bold',
        position: 'absolute',
        bottom: '0px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: '1000',
      });
      return badge;
    }

    let updatedCount = 0;

    const completionPatterns = [
      /\bresolved\b/,
      /\bclosed\b/,
      /\bcancel(?:ed|led)\b/,
      /^complete/,
      /\bdiscarded\b/,
      /\bdone\b/,
      /\bfulfilled\b/,
      /\bfinished\b/,
      /\bfinali[sz]ed\b/,
      /\baccomplished\b/,
    ];

    function isCompletionState(text) {
      const normalizedText = text.trim().toLowerCase();
      return completionPatterns.some((pattern) => pattern.test(normalizedText));
    }

    function processCard(card) {
      if (card.hasAttribute('data-task-age-enhanced')) return;
      try {
        annotateLastUpdated(card);
        const state = findState(card);
        if (state) {
          if (isCompletionState(state)) {
            const badge = createBadge('Done', '#28a745');
            if (getComputedStyle(card).position === 'static') {
              card.style.position = 'relative';
            }
            card.appendChild(badge);
            card.setAttribute('data-task-age-enhanced', 'true');
            updatedCount++;
            return;
          }
        }
        const startDate = findStartDate(card);
        if (!startDate) return;
        const age = calculateDaysDiff(startDate);
        if (age === null) return;
        const badgeColor = getBadgeColor(age);
        const badge = createBadge(
          `Age: ${age} day${age !== 1 ? 's' : ''}`,
          badgeColor
        );
        if (getComputedStyle(card).position === 'static') {
          card.style.position = 'relative';
        }
        card.appendChild(badge);
        card.setAttribute('data-task-age-enhanced', 'true');
        updatedCount++;
      } catch (err) {
        console.error('Work Item Age Error:', err);
      }
    }

    function processExistingCards() {
      const cards = document.querySelectorAll('.vtb-card-component-wrapper');
      if (!cards.length) return;
      cards.forEach((card) => processCard(card));
    }

    function observeCards() {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.classList.contains('vtb-card-component-wrapper'))
                processCard(node);
              node
                .querySelectorAll?.('.vtb-card-component-wrapper')
                .forEach(processCard);
            }
          });
        });
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    // Wait until the board appears to be fully loaded (using a 1-second debounce)
    function waitForBoardLoad(callback) {
      let timer = null;
      const observer = new MutationObserver(() => {
        const cards = document.querySelectorAll('.vtb-card-component-wrapper');
        if (cards.length > 0) {
          if (timer) clearTimeout(timer);
          timer = setTimeout(() => {
            observer.disconnect();
            callback();
          }, 1000);
        }
      });
      observer.observe(document.body, { childList: true, subtree: true });
      const initialCards = document.querySelectorAll(
        '.vtb-card-component-wrapper'
      );
      if (initialCards.length > 0) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          observer.disconnect();
          callback();
        }, 1000);
      }
    }

    function init() {
      waitForBoardLoad(() => {
        updateBoardInfo(fullConfig);
        processExistingCards();
        showDebugMessage(`Updated ${updatedCount} cards with Work Item Age`);
        observeCards();
      });
    }

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', init);
    } else {
      init();
    }
  });
})();
