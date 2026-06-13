/*
 * REACH Dashboard — shared calendar widget.
 *
 * Loaded from /<repo>/calendar.js by every per-date dashboard page.
 *
 * Data flow:
 *   - The page embeds <script id="calendar-data"> with at least {anchorDate}
 *     and (optionally, for offline fallback) datesWithData & generatedDates.
 *   - On load, we fetch /<repo>/dates.json which holds the *live* archive
 *     (datesWithData + generatedDates), rewritten every run by the pipeline.
 *   - If the fetch fails (offline, file missing, opening the page from disk),
 *     we fall back to whatever the inline JSON contains.
 *
 * That way old pages — written months ago with stale inline JSON — still
 * navigate the full current archive without having to be rewritten.
 */
(function() {
  var dataEl = document.getElementById('calendar-data');
  var inline = {};
  try { inline = JSON.parse(dataEl.textContent) || {}; } catch (e) { inline = {}; }

  var anchorDate = inline.anchorDate || '';
  // Default to the inline arrays so the calendar is usable even before the
  // fetch resolves (or if it errors out completely).
  var dataSet = new Set(inline.datesWithData || []);
  var genSet  = new Set(inline.generatedDates || []);

  // Path to the shared dates manifest. Pages live at /<repo>/YYYY_MM_DD/,
  // so '../dates.json' resolves to the repo root.
  var DATES_URL = '../dates.json';

  // ---- DOM handles --------------------------------------------------------
  var toggle = document.getElementById('calendar-toggle');
  var dropdown = document.getElementById('calendar-dropdown');
  var grid = document.getElementById('cal-grid');
  var monthLabel = document.getElementById('cal-month-label');
  var prevBtn = document.getElementById('cal-prev-month');
  var nextBtn = document.getElementById('cal-next-month');

  if (!toggle || !dropdown || !grid) {
    // Page doesn't have the calendar markup — nothing to do.
    return;
  }

  function parseDate(s) {
    var p = s.split('_');
    return { year: +p[0], month: +p[1], day: +p[2] };
  }
  function fmtDate(y, m, d) {
    return y + '_' + String(m).padStart(2,'0') + '_' + String(d).padStart(2,'0');
  }

  var anchor = parseDate(anchorDate || fmtDate(
    new Date().getFullYear(), new Date().getMonth()+1, new Date().getDate(),
  ));
  var viewYear = anchor.year;
  var viewMonth = anchor.month;

  var MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
  var DAYS = ['Mo','Tu','We','Th','Fr','Sa','Su'];

  // ---- Event wiring -------------------------------------------------------
  toggle.addEventListener('click', function(e) {
    e.stopPropagation();
    var isOpen = dropdown.style.display !== 'none';
    dropdown.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) renderMonth();
  });

  document.addEventListener('click', function(e) {
    if (!dropdown.contains(e.target) && e.target !== toggle) {
      dropdown.style.display = 'none';
    }
  });
  dropdown.addEventListener('click', function(e) { e.stopPropagation(); });

  if (prevBtn) prevBtn.addEventListener('click', function() {
    viewMonth--;
    if (viewMonth < 1) { viewMonth = 12; viewYear--; }
    renderMonth();
  });
  if (nextBtn) nextBtn.addEventListener('click', function() {
    viewMonth++;
    if (viewMonth > 12) { viewMonth = 1; viewYear++; }
    renderMonth();
  });

  // ---- Render -------------------------------------------------------------
  function renderMonth() {
    if (!monthLabel) return;
    monthLabel.textContent = MONTHS[viewMonth - 1] + ' ' + viewYear;
    grid.innerHTML = '';

    for (var i = 0; i < 7; i++) {
      var hdr = document.createElement('div');
      hdr.className = 'day-header';
      hdr.textContent = DAYS[i];
      grid.appendChild(hdr);
    }

    var firstDay = new Date(viewYear, viewMonth - 1, 1).getDay();
    var startCol = (firstDay + 6) % 7;
    var daysInMonth = new Date(viewYear, viewMonth, 0).getDate();

    for (var i = 0; i < startCol; i++) {
      var empty = document.createElement('div');
      empty.className = 'cal-day';
      grid.appendChild(empty);
    }

    for (var d = 1; d <= daysInMonth; d++) {
      var cell = document.createElement('div');
      cell.className = 'cal-day';
      cell.textContent = d;

      var key = fmtDate(viewYear, viewMonth, d);
      var isAnchor = (key === anchorDate);
      var hasData = dataSet.has(key);
      var isGenerated = genSet.has(key);

      if (isGenerated) {
        cell.classList.add('generated');
        cell.title = key + ' (click to view)';
        cell.setAttribute('data-date', key);
        cell.addEventListener('click', onDateClick);
      } else if (hasData) {
        cell.classList.add('has-data');
        cell.title = key + ' (click to generate)';
        cell.setAttribute('data-date', key);
        cell.addEventListener('click', onDateClick);
      } else {
        cell.classList.add('no-data');
      }

      if (isAnchor) cell.classList.add('anchor');
      grid.appendChild(cell);
    }
  }

  function onDateClick(e) {
    var el = e.target.closest('.cal-day');
    if (!el) return;
    var dateKey = el.getAttribute('data-date');
    if (!dateKey) return;

    if (genSet.has(dateKey)) {
      window.location.href = '../' + dateKey + '/index.html';
    } else {
      var isLocal = window.location.hostname === 'localhost' ||
                    window.location.hostname === '127.0.0.1';
      if (isLocal) {
        window.location.href = '../' + dateKey + '/index.html';
      } else {
        showGeneratePrompt(dateKey);
      }
    }
  }

  function showGeneratePrompt(dateKey) {
    var existing = document.getElementById('generate-overlay');
    if (existing) existing.remove();

    var overlay = document.createElement('div');
    overlay.id = 'generate-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;' +
      'background:rgba(0,0,0,0.5);display:flex;align-items:center;' +
      'justify-content:center;z-index:200;';
    overlay.innerHTML =
      '<div style="background:white;padding:28px 32px;border-radius:12px;' +
      'max-width:480px;text-align:center;box-shadow:0 4px 20px rgba(0,0,0,0.3);">' +
      '<h3 style="color:#1a365d;margin-bottom:12px;">Page Not Generated Yet</h3>' +
      '<p style="color:#4a5568;margin-bottom:16px;">Date <strong>' + dateKey +
      '</strong> has observation data but the dashboard page has not been generated.</p>' +
      '<p style="color:#4a5568;margin-bottom:8px;">It will appear automatically after the next daily run, or you can trigger a manual run from the GitHub Actions tab.</p>' +
      '<button id="gen-overlay-close" style="margin-top:16px;padding:8px 20px;border-radius:6px;border:none;' +
      'background:#3182ce;color:white;cursor:pointer;font-size:0.9em;">OK</button></div>';
    document.body.appendChild(overlay);

    document.getElementById('gen-overlay-close').addEventListener('click', function() {
      overlay.remove();
    });
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) overlay.remove();
    });
  }

  // ---- Fetch the live archive --------------------------------------------
  // Replace the inline (possibly stale) data with the live manifest if we can
  // reach it. Done after wiring so the calendar is interactive immediately.
  fetch(DATES_URL, { cache: 'no-cache' })
    .then(function(res) {
      if (!res.ok) throw new Error('dates.json HTTP ' + res.status);
      return res.json();
    })
    .then(function(live) {
      if (live && Array.isArray(live.datesWithData)) {
        dataSet = new Set(live.datesWithData);
      }
      if (live && Array.isArray(live.generatedDates)) {
        genSet = new Set(live.generatedDates);
      }
      // If the calendar is currently open, re-render so the live data shows.
      if (dropdown.style.display !== 'none') renderMonth();
    })
    .catch(function() {
      // Silent fallback — inline data is already in dataSet/genSet.
    });
})();
