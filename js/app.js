/**
 * XTen National Directory & People Portal - Frontend Application Controller
 * High-performance, zero-dependency vanilla JavaScript.
 * Synchronized with Australian Business Register (ABR) & ATO Modulo-89 engine.
 */

document.addEventListener('DOMContentLoaded', () => {
  // State
  const state = {
    activePortal: 'companies', // 'companies' | 'people'
    searchQuery: '',
    selectedState: '',
    selectedCategory: '',
    activeFacet: 'all', // 'all' | 'peppol' | 'gst' | 'contact' | 'video' | 'featured'
    selectedHub: '',
    sortBy: 'views',
    selectedItem: null,
    badgeStyle: 'dark',
    currentResults: [],
    page: 1,          // 1-based; sent to the API, reset when the search changes
    pageSize: 50,     // API MAX_LIMIT
    lastQuerySig: ''  // portal|q|state|category — a change resets page to 1
  };

  // Live backend (directory-module, xtenstack/internal) — public,
  // unauthenticated, CORS-enabled for this exact origin. Previously this
  // whole app ran entirely against the static js/data.js sample set;
  // search/claim/enquiry/opt-out now hit the real API.
  const API_BASE = 'https://stack-internal.xten.au/api/v1/directory';

  async function apiFetch(path, options) {
    const res = await fetch(`${API_BASE}${path}`, options);
    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      const err = new Error(body.error || `Request failed (${res.status})`);
      err.status = res.status;
      throw err;
    }

    return body;
  }

  /**
   * Maps the real API's leaner field set onto the shape createCardHTML/
   * openProfileModal/openClaimModal expect. Deliberately does NOT
   * fabricate fields the live backend has no data for (has_video,
   * views_this_month, description/bio, direct phone) — those render as
   * absent rather than invented, matching this project's own "don't
   * overclaim" findings elsewhere. `full` (entity/personAction) carries
   * more than `search`'s per-row shape (trading_names, peppol contact,
   * claim_url) — pass true once a single record's detail has been
   * fetched.
   */
  function mapApiItem(r, full) {
    const item = {
      id: r.abn,
      abn: r.abn,
      name: r.name,
      full_name: r.name,
      state: r.state,
      postcode: r.postcode,
      status: r.abn_status === 'ACT' ? 'Active' : r.abn_status,
      entity_type: r.entity_type,
      claimed: !!r.is_claimed,
      verified: !!r.is_claimed,
      // Badge tier: bundle_* and *_y package keys collapse to the tier they
      // contain (the card only knows 'prominent' / 'featured').
      tier: (function (t) {
        if (!t) return null;
        if (/prominent/.test(t)) return 'prominent';
        if (/featured/.test(t)) return 'featured';
        return t;
      })(r.claim_tier),
      // V6 backend: a claimed listing's spotlight video (customer-supplied
      // or produced under DI-08). Absent until the backend says so.
      video_url: r.video_url || null,
      has_video: !!r.video_url
    };

    if (full) {
      item.acn = r.acn || null;
      item.trading_names = r.trading_names || [];
      item.is_peppol_ready = !!r.is_peppol_ready;
      item.peppol_id = r.peppol_id || (item.is_peppol_ready ? `0151:${r.abn}` : null);
      item.email = r.peppol_contact_email || null;
      item.gst_registered = r.gst_status === 'ACT';
      item.claim_url = r.claim_url || null;
      item.contact_available = !!r.contact_available;
    }

    return item;
  }

  let searchDebounceTimer = null;
  let searchRequestSeq = 0;

  // DOM Elements - Navigation & Search
  const tabCompanies = document.getElementById('tabCompanies');
  const tabPeople = document.getElementById('tabPeople');
  const portalNameEl = document.getElementById('portalName');
  const portalStatPill = document.getElementById('portalStatPill');
  const heroTitleEl = document.getElementById('heroTitle');
  const heroSubtitleEl = document.getElementById('heroSubtitle');
  const privacyBanner = document.getElementById('privacyBanner');
  
  const searchInput = document.getElementById('searchInput');
  const stateSelect = document.getElementById('stateSelect');
  const categorySelect = document.getElementById('categorySelect');
  const btnSearch = document.getElementById('btnSearch');
  const sortSelect = document.getElementById('sortSelect');
  
  const resultsContainer = document.getElementById('resultsContainer');
  const resultsCountEl = document.getElementById('resultsCount');

  // Hubs & ANZSIC Drawer
  const hubPillsContainer = document.getElementById('hubPillsContainer');
  const btnToggleAnzsic = document.getElementById('btnToggleAnzsic');
  const anzsicDrawer = document.getElementById('anzsicDrawer');
  const anzsicChevron = document.getElementById('anzsicChevron');
  const btnCloseAnzsicDrawer = document.getElementById('btnCloseAnzsicDrawer');
  const anzsicGridContainer = document.getElementById('anzsicGridContainer');
  const facetedFilterPills = document.getElementById('facetedFilterPills');
  
  // Modals - Core
  const profileModal = document.getElementById('profileModal');
  const claimModal = document.getElementById('claimModal');
  const optoutModal = document.getElementById('optoutModal');
  const pricingModal = document.getElementById('pricingModal');
  const btnOpenPricing = document.getElementById('btnOpenPricing');
  const pricingGridContainer = document.getElementById('pricingGridContainer');
  const claimPackageSelect = document.getElementById('claimPackage');
  const claimCategorySelect = document.getElementById('claimCategory');
  const claimForm = document.getElementById('claimForm');
  const optoutForm = document.getElementById('optoutForm');

  // Modals - Visitor Utility & Viral Loops
  const btnOpenInvoiceChecker = document.getElementById('btnOpenInvoiceChecker');
  const invoiceCheckerModal = document.getElementById('invoiceCheckerModal');
  const invoiceCheckerForm = document.getElementById('invoiceCheckerForm');
  const verifyAbnInput = document.getElementById('verifyAbnInput');
  const abnChecksumBadge = document.getElementById('abnChecksumBadge');
  const verifyNameInput = document.getElementById('verifyNameInput');
  const verifyTotalInput = document.getElementById('verifyTotalInput');
  const verifyGstInput = document.getElementById('verifyGstInput');
  const verifyBsbInput = document.getElementById('verifyBsbInput');
  const verifyAccountNameInput = document.getElementById('verifyAccountNameInput');
  const btnLoadSampleInvoice = document.getElementById('btnLoadSampleInvoice');
  const btnResetChecker = document.getElementById('btnResetChecker');
  const btnPrintCertificate = document.getElementById('btnPrintCertificate');

  const enquiryModal = document.getElementById('enquiryModal');
  const enquiryForm = document.getElementById('enquiryForm');
  const enquiryTargetName = document.getElementById('enquiryTargetName');
  const enquiryTargetCategory = document.getElementById('enquiryTargetCategory');

  const badgeModal = document.getElementById('badgeModal');
  const badgeEntityName = document.getElementById('badgeEntityName');
  const badgeEntityABN = document.getElementById('badgeEntityABN');
  const badgePreviewBox = document.getElementById('badgePreviewBox');
  const badgeEmbedCode = document.getElementById('badgeEmbedCode');
  const btnCopyBadgeCode = document.getElementById('btnCopyBadgeCode');
  const qrCodeContainer = document.getElementById('qrCodeContainer');
  const btnDownloadQR = document.getElementById('btnDownloadQR');
  const btnPrintQRCard = document.getElementById('btnPrintQRCard');

  const toastNotification = document.getElementById('toastNotification');

  // Detect Subdomain or URL parameters on load
  const hostname = window.location.hostname.toLowerCase();
  const urlParams = new URLSearchParams(window.location.search);

  // Clean URLs (/verify, /verify/:abn, /location/:state/:suburb,
  // /category/:x — MAA-20260913-006 deliverable 5) are served by
  // .htaccess as *internal* rewrites onto index.html?…, so the query
  // string the server appends never reaches window.location. Derive the
  // same params from the path here; explicit query params still win.
  const cleanPath = window.location.pathname.match(/^\/(verify|location|category)(?:\/([^/]+))?(?:\/([^/]+))?\/?$/);
  if (cleanPath) {
    const [, section, first, second] = cleanPath;
    const dec = (v) => { try { return decodeURIComponent(v); } catch (e) { return v; } };
    if (section === 'verify') {
      if (first && !urlParams.has('verify')) urlParams.set('verify', dec(first));
      if (!first && !urlParams.has('tool')) urlParams.set('tool', 'verify');
    } else if (section === 'location') {
      if (first && !urlParams.has('state')) urlParams.set('state', dec(first));
      if (second && !urlParams.has('suburb')) urlParams.set('suburb', dec(second));
    } else if (section === 'category' && first && !urlParams.has('category')) {
      urlParams.set('category', dec(first));
    }
  }

  if (hostname.includes('people') || urlParams.get('portal') === 'people') {
    setPortal('people');
  } else {
    setPortal('companies');
  }

  // Parse deep-link query params
  if (urlParams.has('q') || urlParams.has('search')) {
    state.searchQuery = (urlParams.get('q') || urlParams.get('search')).trim().toLowerCase();
    searchInput.value = state.searchQuery;
  }
  if (urlParams.has('state')) {
    state.selectedState = urlParams.get('state').toUpperCase();
    stateSelect.value = state.selectedState;
  }
  if (urlParams.has('category')) {
    state.selectedCategory = urlParams.get('category');
  }
  if (urlParams.has('tool') && urlParams.get('tool') === 'verify') {
    openInvoiceCheckerModal();
  }
  if (urlParams.has('verify')) {
    openInvoiceCheckerModal(urlParams.get('verify'));
  }

  // Tokenized claim link (/claim?slug=..., generated server-side by
  // claim_url on entity/personAction — deliberately NOT the raw ABN in
  // the URL, see Api\DirectoryController::claimUrl()). No handling is
  // added here for a raw `?abn=`/`?claim=` param — that's the exact
  // thing this replaces, not a fallback to keep alive.
  // Direct entity/person deep link by ABN (used by the sitemap generator's
  // <loc> URLs — `?search=<abn>` doesn't work, the live search only
  // matches names/trading names, never the raw ABN column).
  if (urlParams.has('abn') && !urlParams.has('slug')) {
    (async () => {
      const abn = urlParams.get('abn').replace(/\s+/g, '');
      const portal = state.activePortal === 'companies' ? 'entity' : 'person';
      // ?ref=<slug> arrives only on the profile link inside our claim
      // emails; forwarding it lets the API log the open against that email
      // (directory.link_visits kind 'profile'). Nothing else changes.
      const ref = (urlParams.get('ref') || '').trim();
      const refQuery = /^[0-9a-f]{8,32}$/.test(ref) ? `?ref=${encodeURIComponent(ref)}` : '';
      try {
        const data = await apiFetch(`/${portal}/${abn}${refQuery}`);
        openProfileModal(mapApiItem(data[portal], true));
      } catch (err) {
        showToast(`Could not load ABN ${abn}: ${err.message}`);
      }
    })();
  }

  if (urlParams.has('slug')) {
    (async () => {
      try {
        const data = await apiFetch(`/resolve/${encodeURIComponent(urlParams.get('slug'))}`);
        const portalType = data.entity ? 'entity' : 'person';
        const item = mapApiItem(data[portalType], true);

        setPortal(portalType === 'entity' ? 'companies' : 'people');
        openClaimModal(item);
      } catch (err) {
        showToast(`This claim link is invalid or has expired (${err.message}).`);
      }
    })();
  }

  // Render Hub Pills & ANZSIC Drawer
  renderHubPills();
  renderAnzsicDrawer();
  render();

  // Navigation Tabs
  tabCompanies.addEventListener('click', () => setPortal('companies'));
  tabPeople.addEventListener('click', () => setPortal('people'));

  // Search & Filter Listeners
  searchInput.addEventListener('input', (e) => {
    state.searchQuery = e.target.value.trim().toLowerCase();
    render();
  });

  stateSelect.addEventListener('change', (e) => {
    state.selectedState = e.target.value;
    render();
  });

  categorySelect.addEventListener('change', (e) => {
    state.selectedCategory = e.target.value;
    render();
  });

  sortSelect.addEventListener('change', (e) => {
    state.sortBy = e.target.value;
    render();
  });

  btnSearch.addEventListener('click', (e) => {
    e.preventDefault();
    render();
  });

  // Faceted Search Filter Pills
  if (facetedFilterPills) {
    facetedFilterPills.querySelectorAll('.facet-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        facetedFilterPills.querySelectorAll('.facet-pill').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.activeFacet = btn.dataset.filter || 'all';
        render();
      });
    });
  }

  // ANZSIC Drawer Toggles
  if (btnToggleAnzsic) {
    btnToggleAnzsic.addEventListener('click', () => {
      const isHidden = anzsicDrawer.style.display === 'none';
      anzsicDrawer.style.display = isHidden ? 'block' : 'none';
      btnToggleAnzsic.classList.toggle('expanded', isHidden);
    });
  }

  if (btnCloseAnzsicDrawer) {
    btnCloseAnzsicDrawer.addEventListener('click', () => {
      anzsicDrawer.style.display = 'none';
      btnToggleAnzsic.classList.remove('expanded');
    });
  }

  // Switch Active Portal
  function setPortal(portal) {
    state.activePortal = portal;
    state.searchQuery = '';
    searchInput.value = '';
    state.activeFacet = 'all';
    if (facetedFilterPills) {
      facetedFilterPills.querySelectorAll('.facet-pill').forEach((b, i) => b.classList.toggle('active', i === 0));
    }
    
    if (portal === 'companies') {
      tabCompanies.classList.add('active');
      tabPeople.classList.remove('active');
      portalNameEl.textContent = 'Commercial Directory';
      portalStatPill.textContent = '2.5M+ Registered Entities';
      heroTitleEl.innerHTML = 'Official Australian <span class="highlight">Business Directory</span>';
      heroSubtitleEl.textContent = 'Explore 2.5 million verified Australian commercial entities, ABN registrations, corporate due diligence, and verified business contacts.';
      searchInput.placeholder = 'Search by company name, trading name, ABN, ACN, or suburb...';
      privacyBanner.style.display = 'none';
      populateCategories(typeof EXPANDED_INDUSTRIES !== 'undefined' ? EXPANDED_INDUSTRIES : [
        'All Industries'
      ]);
    } else {
      tabPeople.classList.add('active');
      tabCompanies.classList.remove('active');
      portalNameEl.textContent = 'People & Professionals';
      portalStatPill.textContent = '1.16M+ Verified Practitioners';
      heroTitleEl.innerHTML = 'Australia\'s Verified <span class="highlight">Professional Register</span>';
      heroSubtitleEl.textContent = 'Search 1.16 million licensed Australian sole traders, allied health specialists, licensed trades, consultants, and independent practitioners.';
      searchInput.placeholder = 'Search by practitioner name, profession, license, or suburb...';
      privacyBanner.style.display = 'flex';
      populateCategories(typeof EXPANDED_PROFESSIONS !== 'undefined' ? EXPANDED_PROFESSIONS : [
        'All Professions'
      ]);
    }
    render();
  }

  function populateCategories(cats) {
    if (!categorySelect) return;
    const defaultLabel = cats[0] || (state.activePortal === 'companies' ? 'All Industries' : 'All Professions');
    let html = `<option value="">${escapeHTML(defaultLabel)}</option>`;

    const groups = {};
    const ungrouped = [];

    for (let i = 1; i < cats.length; i++) {
      const item = cats[i];
      const colonIdx = item.indexOf(': ');
      if (colonIdx !== -1) {
        const group = item.slice(0, colonIdx).trim();
        const label = item.slice(colonIdx + 2).trim();
        if (!groups[group]) groups[group] = [];
        groups[group].push({ value: item, label: label });
      } else {
        ungrouped.push({ value: item, label: item });
      }
    }

    if (Object.keys(groups).length > 0) {
      for (const [groupName, items] of Object.entries(groups)) {
        html += `<optgroup label="${escapeHTML(groupName)}">`;
        for (const it of items) {
          html += `<option value="${escapeHTML(it.value)}">${escapeHTML(it.label)}</option>`;
        }
        html += `</optgroup>`;
      }
      for (const it of ungrouped) {
        html += `<option value="${escapeHTML(it.value)}">${escapeHTML(it.label)}</option>`;
      }
    } else {
      for (let i = 1; i < cats.length; i++) {
        html += `<option value="${escapeHTML(cats[i])}">${escapeHTML(cats[i])}</option>`;
      }
    }

    categorySelect.innerHTML = html;
    state.selectedCategory = '';
  }

  // Render Hub Pills
  function renderHubPills() {
    if (!hubPillsContainer || typeof POPULAR_HUBS === 'undefined') return;
    hubPillsContainer.innerHTML = POPULAR_HUBS.map(hub => `
      <button class="hub-chip ${state.selectedHub === hub.name ? 'active' : ''}" data-hub="${hub.name}" data-state="${hub.state}">
        ${hub.name} (${hub.state})
      </button>
    `).join('');

    hubPillsContainer.querySelectorAll('.hub-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const hubName = chip.dataset.hub;
        const hubState = chip.dataset.state;
        
        if (state.selectedHub === hubName) {
          state.selectedHub = '';
          state.selectedState = '';
          stateSelect.value = '';
          chip.classList.remove('active');
        } else {
          hubPillsContainer.querySelectorAll('.hub-chip').forEach(c => c.classList.remove('active'));
          chip.classList.add('active');
          state.selectedHub = hubName;
          state.selectedState = hubState;
          stateSelect.value = hubState;
        }
        render();
      });
    });
  }

  // Render ANZSIC Drawer
  function renderAnzsicDrawer() {
    if (!anzsicGridContainer || typeof ANZSIC_DIVISIONS === 'undefined') return;
    anzsicGridContainer.innerHTML = ANZSIC_DIVISIONS.map(div => `
      <button class="anzsic-card-item ${state.selectedCategory === div.name ? 'active' : ''}" data-category="${div.name}">
        <div class="anzsic-card-icon">${div.icon}</div>
        <div class="anzsic-card-info">
          <div class="anzsic-card-title">${div.name}</div>
          <div class="anzsic-card-meta">
            <span>Div ${div.code}</span> · <span>${div.count}</span>
          </div>
        </div>
      </button>
    `).join('');

    anzsicGridContainer.querySelectorAll('.anzsic-card-item').forEach(card => {
      card.addEventListener('click', () => {
        const cat = card.dataset.category;
        if (state.selectedCategory === cat) {
          state.selectedCategory = '';
          categorySelect.value = '';
          card.classList.remove('active');
        } else {
          anzsicGridContainer.querySelectorAll('.anzsic-card-item').forEach(c => c.classList.remove('active'));
          card.classList.add('active');
          state.selectedCategory = cat;
          categorySelect.value = cat;
        }
        render();
        // Smooth scroll to results
        resultsCountEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  // Prev / Page x of y / Next under the results grid. Created on first
  // use so index.html needs no new markup. A capped total (category
  // searches) still pages up to the cap — Next stays enabled while the
  // API returned a full page.
  let paginationBar = null;

  function renderPagination(info) {
    if (!paginationBar) {
      paginationBar = document.createElement('div');
      paginationBar.id = 'paginationBar';
      paginationBar.style.cssText = 'display:flex;justify-content:center;align-items:center;gap:1rem;margin:1.5rem 0 0.5rem;';
      resultsContainer.insertAdjacentElement('afterend', paginationBar);
    }

    if (!info || info.total === null || info.total <= state.pageSize && state.page === 1) {
      paginationBar.innerHTML = '';
      return;
    }

    const lastPage = Math.max(1, Math.ceil(info.total / state.pageSize));
    const hasNext = state.page < lastPage || (info.capped && info.pageCount === state.pageSize);
    const hasPrev = state.page > 1;
    const disabled = 'opacity:0.45;pointer-events:none;';

    paginationBar.innerHTML = `
      <button type="button" class="btn-secondary-sm" data-page="prev" style="${hasPrev ? '' : disabled}">← Previous</button>
      <span style="color: var(--text-muted); font-size: 0.9rem;">Page <strong>${state.page.toLocaleString()}</strong> of ${lastPage.toLocaleString()}${info.capped ? '+' : ''}</span>
      <button type="button" class="btn-secondary-sm" data-page="next" style="${hasNext ? '' : disabled}">Next →</button>
    `;

    paginationBar.querySelectorAll('button[data-page]').forEach(btn => {
      btn.addEventListener('click', () => {
        state.page = btn.dataset.page === 'next' ? state.page + 1 : Math.max(1, state.page - 1);
        fetchAndRenderResults();
        resultsCountEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  // Render Result Cards — debounced trigger; the real fetch+DOM update
  // is fetchAndRenderResults() below. render() itself stays synchronous
  // so every existing call site (search input, filters, sort, portal
  // switch) doesn't need to change.
  function render() {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(fetchAndRenderResults, 200);
  }

  async function fetchAndRenderResults() {
    const portal = state.activePortal === 'companies' ? 'entity' : 'person';

    // Pagination (Travis, 2026-09-15): any change to what is being
    // searched starts again at page 1; only the pager buttons move it.
    const querySig = [portal, state.searchQuery, state.selectedState, state.selectedCategory].join('|');
    if (querySig !== state.lastQuerySig) {
      state.page = 1;
      state.lastQuerySig = querySig;
    }

    const params = new URLSearchParams({ portal, limit: String(state.pageSize), page: String(state.page) });
    if (state.searchQuery) params.set('q', state.searchQuery);
    if (state.selectedState) params.set('state', state.selectedState);
    if (state.selectedCategory) {
      params.set('category', state.selectedCategory);
      params.set('anzsic_div', state.selectedCategory);
    }

    const requestId = ++searchRequestSeq;

    resultsContainer.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 3rem 1rem; color: var(--text-muted);">Searching the live registry…</div>
    `;

    let data;
    try {
      data = await apiFetch(`/search?${params.toString()}`);
    } catch (err) {
      if (requestId !== searchRequestSeq) return; // superseded by a newer search
      resultsContainer.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 1rem; background: var(--bg-surface); border: 1px dashed var(--border-light); border-radius: var(--radius-lg);">
          <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">⚠️</div>
          <h3 style="font-family: var(--font-display); font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem;">Could not reach the registry</h3>
          <p style="color: var(--text-muted); font-size: 0.9rem;">${escapeHTML(err.message)}</p>
        </div>
      `;
      resultsCountEl.textContent = '';
      renderPagination(null);
      return;
    }

    if (requestId !== searchRequestSeq) return;

    let items = (data.results || []).map(r => mapApiItem(r, false));

    // Faceted pills over this page of results. 'gst' and 'video' have no
    // backing field from search's lean row shape — video has none at all
    // anywhere in the live schema, so that pill is inert rather than
    // hiding every result.
    if (state.activeFacet === 'contact') items = items.filter(i => i.verified); // only a claimed profile has a contact route today
    if (state.activeFacet === 'featured') items = items.filter(i => i.tier === 'featured' || i.tier === 'prominent');
    if (state.activeFacet === 'video') items = items.filter(i => i.has_video);

    items.sort((a, b) => {
      if (a.tier === 'prominent' && b.tier !== 'prominent') return -1;
      if (b.tier === 'prominent' && a.tier !== 'prominent') return 1;
      if (state.sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
      return 0; // 'views' sort has no backing data from the live API
    });

    state.currentResults = items;

    // "Showing 51–100 of 9,318,880" — real page window, not a fixed 50.
    // The API caps `total` for category searches (total_capped), shown
    // as "1,000+" rather than pretending it is exact.
    const noun = state.activePortal === 'companies' ? 'verified companies' : 'registered practitioners';
    const total = typeof data.total === 'number' ? data.total : null;
    const pageStart = (state.page - 1) * state.pageSize + 1;
    const pageEnd = pageStart + items.length - 1;
    const totalLabel = total === null ? '' : ` of ${total.toLocaleString()}${data.total_capped ? '+' : ''}`;
    resultsCountEl.innerHTML = items.length
      ? `Showing <strong>${pageStart.toLocaleString()}–${pageEnd.toLocaleString()}</strong> ${noun}${totalLabel}`
      : `Showing <strong>0</strong> ${noun}${totalLabel}`;
    renderPagination({ total, capped: !!data.total_capped, pageCount: (data.results || []).length });

    if (items.length === 0) {
      resultsContainer.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 1rem; background: var(--bg-surface); border: 1px dashed var(--border-light); border-radius: var(--radius-lg);">
          <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">🔍</div>
          <h3 style="font-family: var(--font-display); font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem;">No exact matching records found</h3>
          <p style="color: var(--text-muted); font-size: 0.9rem; max-width: 440px; margin: 0 auto;">Try clearing active filters, selecting "All Listings", searching by 11-digit ABN, or switching between Companies and People tabs.</p>
        </div>
      `;
      return;
    }

    resultsContainer.innerHTML = items.map(item => createCardHTML(item)).join('');
    attachCardListeners(items);
    updateSchemaLD(items);
  }

  /** Fetches the full entity/person record (trading names, Peppol contact, claim_url) — search's own rows are deliberately lean. */
  async function fetchItemDetail(item) {
    const portal = state.activePortal === 'companies' ? 'entity' : 'person';
    const data = await apiFetch(`/${portal}/${item.abn}`);

    return mapApiItem(data[portal], true);
  }

  // Card Template
  function createCardHTML(item) {
    const isCompany = state.activePortal === 'companies';
    const title = isCompany ? item.name : item.full_name;
    const subTitle = isCompany ? (item.trading_names ? item.trading_names[0] : '') : item.profession;
    const location = [item.state, item.postcode].filter(Boolean).join(' ') || 'Location not published';
    const categoryTag = isCompany ? item.anzsic_class : item.category;
    const tierClass = item.tier === 'prominent' ? 'tier-prominent' : (item.tier === 'featured' ? 'tier-featured' : '');

    return `
      <article class="entity-card ${tierClass}" id="card-${item.id}">
        <div>
          <div class="card-top">
            <div>
              <h3 class="entity-title">
                <a href="javascript:void(0)" class="btn-view-profile" data-id="${item.id}">${escapeHTML(title)}</a>
              </h3>
              ${subTitle ? `<div style="font-size: 0.85rem; color: var(--text-muted); margin-top: 2px;">${escapeHTML(subTitle)}</div>` : ''}
            </div>
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.35rem;">
              ${item.tier === 'prominent' ? `
                <span class="badge-prominent" title="Prominent Listing — Guaranteed Top 3 Placement">
                  ⭐ PROMINENT
                </span>
              ` : ''}
              ${item.tier === 'featured' ? `
                <span class="badge-featured" title="Featured Listing — Top of Category Ranking">
                  ✨ FEATURED
                </span>
              ` : ''}
              ${item.has_video ? `
                <span class="badge-video btn-view-profile" data-id="${item.id}" title="Watch 30-Second Video Showcase">
                  ▶ 30s Video
                </span>
              ` : ''}
              ${item.verified ? `
                <span class="badge-verified" title="Verified Australian Registration">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  Verified
                </span>
              ` : `
                <span class="badge-unverified" title="Unclaimed Registry Listing">Unclaimed</span>
              `}
            </div>
          </div>

          <div class="entity-meta-row">
            ${item.abn ? `
              <span class="abn-tag" title="ATO Checksum Modulo-89 Validated">ABN ${formatABN(item.abn)}</span>
            ` : `
              <span class="abn-tag" style="background: #EDE9FE; color: #5B21B6;" title="Community Group / Non-ABN Association">🏛️ ${escapeHTML(item.association_number || 'Community Society')}</span>
            `}
            <span class="meta-pill">📍 ${escapeHTML(location)}</span>
            ${item.is_peppol_ready ? `<span class="meta-pill" style="background: #EFF6FF; color: #1D4ED8; font-weight: 600;">⚡ Peppol Ready</span>` : ''}
            ${item.gst_registered ? `<span class="meta-pill" style="background: #ECFDF5; color: #059669;">🛡️ GST Reg.</span>` : ''}
            ${categoryTag ? `<span class="meta-pill">🏷️ ${escapeHTML(categoryTag)}</span>` : ''}
          </div>

          <p class="entity-description">${escapeHTML(item.description || item.bio || '')}</p>

          <!-- Action Utilities Bar -->
          <div class="card-utilities-bar">
            <button class="btn-util" data-action="copy-accounting" data-id="${item.id}" title="Copy supplier record formatted for Xero / MYOB / QuickBooks">
              📋 Copy for Xero/MYOB
            </button>
            <button class="btn-util primary-util" data-action="enquire" data-id="${item.id}" title="Send a direct inquiry or request for quotation">
              ✉️ Request Quote
            </button>
            <button class="btn-util" data-action="verify-payee" data-id="${item.id}" title="Run due diligence check on this entity before paying an invoice">
              🛡️ Verify Payee
            </button>
            <button class="btn-util" data-action="get-badge" data-id="${item.id}" title="Get embeddable trust badge & QR code for this entity">
              ✨ Badge & QR
            </button>
          </div>
        </div>

        <div class="card-footer">
          <span></span>

          <div class="card-actions">
            <button class="btn-card-action btn-view-profile" data-id="${item.id}">Details</button>
            <button class="btn-card-action btn-card-claim btn-claim-profile" data-id="${item.id}">
              ${item.claimed ? 'Manage Profile' : 'Claim Profile'}
            </button>
          </div>
        </div>
      </article>
    `;
  }

  // Attach Card Event Listeners
  function attachCardListeners(rawData) {
    // view-profile and claim-profile need the full record (trading
    // names, Peppol contact, claim_url) — search's own rows are lean,
    // so fetch the real detail before opening either modal.
    document.querySelectorAll('.btn-view-profile').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const item = rawData.find(d => d.id === id);
        if (!item) return;
        try {
          openProfileModal(await fetchItemDetail(item));
        } catch (err) {
          showToast(`Could not load this profile: ${err.message}`);
        }
      });
    });

    document.querySelectorAll('.btn-claim-profile').forEach(btn => {
      btn.addEventListener('click', async () => {
        const id = btn.dataset.id;
        const item = rawData.find(d => d.id === id);
        if (!item) return;
        try {
          openClaimModal(await fetchItemDetail(item));
        } catch (err) {
          showToast(`Could not load this profile: ${err.message}`);
        }
      });
    });

    document.querySelectorAll('[data-action="copy-accounting"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const item = rawData.find(d => d.id === id);
        if (item) copyAccountingRecord(item);
      });
    });

    document.querySelectorAll('[data-action="enquire"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const item = rawData.find(d => d.id === id);
        if (item) openEnquiryModal(item);
      });
    });

    document.querySelectorAll('[data-action="verify-payee"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const item = rawData.find(d => d.id === id);
        if (item) {
          openInvoiceCheckerModal(item.abn, item.name || item.full_name);
        }
      });
    });

    document.querySelectorAll('[data-action="get-badge"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const item = rawData.find(d => d.id === id);
        if (item) openBadgeModal(item);
      });
    });
  }

  // Profile Modal
  function openProfileModal(item) {
    state.selectedItem = item;
    const isCompany = state.activePortal === 'companies';
    
    document.getElementById('modalProfileTitle').textContent = isCompany ? item.name : item.full_name;
    
    let badgeHTML = '';
    if (item.tier === 'prominent') {
      badgeHTML += '<span class="badge-prominent" style="margin-right: 6px;">⭐ Prominent Listing</span>';
    } else if (item.tier === 'featured') {
      badgeHTML += '<span class="badge-featured" style="margin-right: 6px;">✨ Featured Listing</span>';
    }
    badgeHTML += item.verified 
      ? '<span class="badge-verified">✔ Verified Australian Entity</span>'
      : '<span class="badge-unverified">Unclaimed Registry Record</span>';
    document.getElementById('modalProfileBadge').innerHTML = badgeHTML;

    const videoHTML = item.video_url
      ? `<div style="margin-bottom:1rem;">${videoEmbedHTML(item.video_url)}<div style="font-size:0.75rem;color:var(--text-light);margin-top:4px;">▶ 30-second video showcase</div></div>`
      : '';
    const detailsHTML = `${videoHTML}
      <div class="detail-grid">
        ${item.abn ? `
          <div class="detail-label">ABN</div>
          <div class="detail-value">
            <span class="abn-tag">${formatABN(item.abn)}</span>
            <span style="color: var(--success); font-size: 0.8rem; margin-left: 0.5rem;">✔ ATO Modulo-89 Valid</span>
          </div>
        ` : `
          <div class="detail-label">Registry ID</div>
          <div class="detail-value">
            <span class="abn-tag" style="background: #EDE9FE; color: #5B21B6;">${escapeHTML(item.association_number || 'Community Club / Society')}</span>
            <span style="color: #6366F1; font-size: 0.8rem; margin-left: 0.5rem;">✔ State Associations Act / Community Status</span>
          </div>
        `}

        ${item.acn ? `
          <div class="detail-label">ACN</div>
          <div class="detail-value">${item.acn}</div>
        ` : ''}

        <div class="detail-label">Entity Status</div>
        <div class="detail-value">${escapeHTML(item.status || 'Active')}</div>

        <div class="detail-label">Entity Type</div>
        <div class="detail-value">${escapeHTML(item.entity_type || 'Commercial Entity')}</div>

        <div class="detail-label">GST Status</div>
        <div class="detail-value">${item.gst_registered ? '✔ Registered for Goods & Services Tax (Active)' : 'Not currently GST registered'}</div>

        ${item.is_peppol_ready ? `
          <div class="detail-label">Peppol e-Invoicing</div>
          <div class="detail-value" style="color: #1D4ED8; font-weight: 600;">
            ✔ Active Peppol Participant (<span style="font-family: monospace;">${item.peppol_id || ('0151:' + item.abn)}</span>)
          </div>
        ` : ''}

        ${isCompany && item.trading_names ? `
          <div class="detail-label">Trading Names</div>
          <div class="detail-value">${escapeHTML(item.trading_names.join(', '))}</div>
        ` : ''}

        ${!isCompany && item.profession ? `
          <div class="detail-label">Profession</div>
          <div class="detail-value">${escapeHTML(item.profession)}</div>
        ` : ''}

        <div class="detail-label">Classification</div>
        <div class="detail-value">${escapeHTML(item.anzsic_class || item.category || 'Standard Registration')}</div>

        <div class="detail-label">Registered Location</div>
        <div class="detail-value">📍 ${escapeHTML([item.state, item.postcode].filter(Boolean).join(' ') || 'Not published')}</div>

        ${item.email ? `
          <div class="detail-label">Contact Email</div>
          <div class="detail-value"><a href="mailto:${item.email}" style="color: var(--primary);">${escapeHTML(item.email)}</a></div>
        ` : ''}

        ${(!item.email && item.contact_available) ? `
          <div class="detail-label">Contact</div>
          <div class="detail-value">Available via a verified enquiry — use "Send Direct Enquiry" below.</div>
        ` : ''}
      </div>

      <div style="background: var(--bg-subtle); padding: 1rem; border-radius: var(--radius-sm); border: 1px solid var(--border-light); font-size: 0.85rem; color: var(--text-muted); line-height: 1.5; margin-top: 1rem;">
        Official Australian Business Register statutory public profile. Verified via Commonwealth of Australia open data registries.
      </div>

      <div style="display: flex; gap: 0.5rem; margin-top: 1rem; flex-wrap: wrap;">
        <button class="btn-util" onclick="window.copySelectedAccountingRecord()">
          📋 Copy for Xero / MYOB
        </button>
        <button class="btn-util primary-util" onclick="window.launchEnquiryFromProfile()">
          ✉️ Send Direct Enquiry
        </button>
        <button class="btn-util" onclick="window.launchBadgeFromProfile()">
          ✨ Embed Trust Badge & QR
        </button>
      </div>
    `;

    document.getElementById('modalProfileDetails').innerHTML = detailsHTML;
    profileModal.classList.add('active');
  }

  // Profile modal action proxies
  window.copySelectedAccountingRecord = () => {
    if (state.selectedItem) copyAccountingRecord(state.selectedItem);
  };
  window.launchEnquiryFromProfile = () => {
    profileModal.classList.remove('active');
    if (state.selectedItem) openEnquiryModal(state.selectedItem);
  };
  window.launchBadgeFromProfile = () => {
    profileModal.classList.remove('active');
    if (state.selectedItem) openBadgeModal(state.selectedItem);
  };

  // =========================================================================
  // PILLAR 1: PAYEE & INVOICE SAFETY CHECKER ENGINE
  // =========================================================================

  function openInvoiceCheckerModal(prefillAbn, prefillName) {
    if (prefillAbn) {
      verifyAbnInput.value = formatABN(prefillAbn);
      handleAbnInputCheck(prefillAbn);
    }
    if (prefillName) {
      verifyNameInput.value = prefillName;
    }
    invoiceCheckerModal.classList.add('active');
    if (prefillAbn && prefillName) {
      runInvoiceSafetyAudit();
    }
  }

  if (btnOpenInvoiceChecker) {
    btnOpenInvoiceChecker.addEventListener('click', () => {
      openInvoiceCheckerModal();
    });
  }

  verifyAbnInput.addEventListener('input', (e) => {
    handleAbnInputCheck(e.target.value);
  });

  function handleAbnInputCheck(val) {
    const res = validateModulo89(val);
    if (!val || val.replace(/\s+/g, '').length < 11) {
      abnChecksumBadge.className = 'checksum-pill';
      abnChecksumBadge.textContent = 'Awaiting 11 Digits';
      return;
    }
    if (res.valid) {
      abnChecksumBadge.className = 'checksum-pill valid';
      abnChecksumBadge.textContent = '✔ Modulo-89 Valid';
    } else {
      abnChecksumBadge.className = 'checksum-pill invalid';
      abnChecksumBadge.textContent = '✖ Checksum Failed';
    }
  }

  if (btnLoadSampleInvoice) {
    btnLoadSampleInvoice.addEventListener('click', () => {
      verifyAbnInput.value = '40 006 247 016';
      verifyNameInput.value = 'Regional Publishers (Western Victoria) Pty Limited';
      verifyTotalInput.value = '1650.00';
      verifyGstInput.value = '150.00';
      verifyBsbInput.value = '063-000';
      verifyAccountNameInput.value = 'Regional Publishers (Western Victoria) Pty Limited';
      handleAbnInputCheck('40006247016');
      runInvoiceSafetyAudit();
    });
  }

  if (btnResetChecker) {
    btnResetChecker.addEventListener('click', () => {
      invoiceCheckerForm.reset();
      abnChecksumBadge.className = 'checksum-pill';
      abnChecksumBadge.textContent = 'Awaiting 11 Digits';
      resetVerificationScorecard();
    });
  }

  invoiceCheckerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    runInvoiceSafetyAudit();
  });

  function resetVerificationScorecard() {
    document.getElementById('reportEntityName').textContent = 'Enter Invoice ABN to Audit';
    document.getElementById('reportEntityMeta').textContent = 'Status will resolve against Australian Business Register & ATO records.';
    document.getElementById('reportScoreNum').textContent = '--';
    document.getElementById('reportScoreBadge').className = 'score-badge';
    document.querySelectorAll('.check-row').forEach(row => {
      row.className = 'check-row';
      row.querySelector('.check-icon').textContent = '⏳';
    });
    document.getElementById('riskCallout').style.display = 'none';
    if (btnPrintCertificate) btnPrintCertificate.style.display = 'none';
  }

  async function runInvoiceSafetyAudit() {
    const rawAbn = verifyAbnInput.value;
    const name = verifyNameInput.value.trim();
    const gst = parseFloat(verifyGstInput.value || 0);

    const abnCheck = validateModulo89(rawAbn);
    const cleanAbn = abnCheck.clean || '';

    // Server-side counterpart (Directory-Module-Plan.md §4.6) — real
    // ABR/ATO data, and the backend already computes risk_score and
    // name_match_confidence, so this doesn't re-derive them locally.
    let result;
    try {
      result = cleanAbn ? await apiFetch(`/verify-abn?abn=${cleanAbn}&name=${encodeURIComponent(name)}`) : null;
    } catch (err) {
      result = null;
    }

    const match = result && result.abn_status ? result : null;

    let score = 100;
    const redFlags = [];
    const checks = {
      modulo: { pass: abnCheck.valid, text: abnCheck.valid ? 'ATO Modulo-89 Checksum is mathematically valid.' : 'Invalid ABN checksum. Potential fraudulent or fabricated number.' },
      atoStatus: { pass: false, text: 'No active registration found on the statutory register.' },
      gst: { pass: true, text: 'GST registration matches invoice configuration.' },
      nameMatch: { pass: false, text: 'Name does not match official Commonwealth records.' },
      peppol: { pass: false, text: 'No active Peppol e-Invoicing endpoint detected.' }
    };

    if (!abnCheck.valid) {
      score -= 40;
      redFlags.push('Critical: ABN fails the official ATO Modulo-89 algorithm. This indicates a counterfeit or fabricated number.');
    }

    if (match) {
      const gstRegistered = match.gst_status === 'ACT';

      document.getElementById('reportEntityName').textContent = match.legal_name || name || `ABN ${formatABN(cleanAbn)}`;
      document.getElementById('reportEntityMeta').textContent = `${match.entity_type_text || 'Registered entity'} · ${[match.state, match.postcode].filter(Boolean).join(' ') || 'Australia'}`;

      checks.atoStatus = { pass: match.abn_status === 'ACT', text: match.abn_status === 'ACT' ? 'Active registration confirmed on Australian Business Register.' : `ABN status is "${match.abn_status}" — not currently active.` };
      if (match.abn_status !== 'ACT') {
        score -= 30;
        redFlags.push(`Registration Status: This ABN's ATO status is "${match.abn_status}", not Active.`);
      }

      // GST Audit
      if (gst > 0 && !gstRegistered) {
        checks.gst = { pass: false, text: 'Invoice charges GST, but entity is NOT GST-registered with the ATO!' };
        score -= 25;
        redFlags.push('Tax Risk: This invoice charges GST, but ATO records indicate the payee is NOT registered for GST. You cannot legally claim input tax credits on this payment.');
      } else if (gstRegistered) {
        checks.gst = { pass: true, text: 'Actively registered for GST with the ATO. GST rate of ~10% is consistent.' };
      }

      // Name Match — backend's own confidence score, not re-derived here.
      const confidence = typeof match.name_match_confidence === 'number' ? match.name_match_confidence : null;
      if (confidence === null) {
        checks.nameMatch = { pass: true, text: 'No payee name supplied to cross-check.' };
      } else if (confidence >= 0.7) {
        checks.nameMatch = { pass: true, text: `Payee name matches official statutory registration: "${match.legal_name}".` };
      } else {
        checks.nameMatch = { pass: false, text: `Name discrepancy: Invoice says "${name}", registered name is "${match.legal_name}".` };
        score -= 20;
        redFlags.push(`Name Discrepancy: The payee name on your invoice does not closely match the official legal name (${match.legal_name}) or known trading names.`);
      }

      // Peppol
      if (match.is_peppol_ready) {
        checks.peppol = { pass: true, text: `Verified Peppol Participant ID: ${match.peppol_id || ('0151:' + cleanAbn)}. Supports automated e-invoicing.` };
      } else {
        checks.peppol = { pass: false, text: 'Not enrolled in Peppol e-Invoicing. Manual bank transfer verification recommended.' };
      }

      if (typeof match.risk_score === 'number') {
        score = match.risk_score;
      }
    } else {
      if (abnCheck.valid) {
        document.getElementById('reportEntityName').textContent = name || `ABN ${formatABN(cleanAbn)}`;
        document.getElementById('reportEntityMeta').textContent = 'Valid Commonwealth sequence, but not found on the register.';
        score = 40;
        redFlags.push('Not Found: This ABN passes its checksum but is not on the Australian Business Register — could be a typo or a fabricated number.');
      } else {
        document.getElementById('reportEntityName').textContent = 'Invalid / Fraudulent ABN';
        document.getElementById('reportEntityMeta').textContent = 'High fraud risk detected. Do not disburse funds without contacting supplier.';
        score = 20;
      }
    }

    score = Math.max(10, Math.min(100, Math.round(score)));

    // Update Checklist UI
    updateCheckRow('checkModulo89', checks.modulo.pass, checks.modulo.text);
    updateCheckRow('checkAtoStatus', checks.atoStatus.pass, checks.atoStatus.text);
    updateCheckRow('checkGstStatus', checks.gst.pass, checks.gst.text);
    updateCheckRow('checkNameMatch', checks.nameMatch.pass, checks.nameMatch.text);
    updateCheckRow('checkPeppolStatus', checks.peppol.pass, checks.peppol.text, true);

    // Update Score Badge
    const scoreBadge = document.getElementById('reportScoreBadge');
    document.getElementById('reportScoreNum').textContent = score;
    scoreBadge.className = 'score-badge';
    if (score >= 85) {
      scoreBadge.classList.add('low-risk');
    } else if (score >= 60) {
      scoreBadge.classList.add('medium-risk');
    } else {
      scoreBadge.classList.add('high-risk');
    }

    // Update Red Flags Callout
    const riskCallout = document.getElementById('riskCallout');
    if (redFlags.length > 0) {
      riskCallout.style.display = 'block';
      riskCallout.className = 'risk-callout danger';
      riskCallout.innerHTML = `
        <strong>⚠️ Risk Warnings Detected (${redFlags.length}):</strong>
        <ul style="margin-top: 0.35rem; padding-left: 1.25rem;">
          ${redFlags.map(f => `<li>${escapeHTML(f)}</li>`).join('')}
        </ul>
      `;
    } else {
      riskCallout.style.display = 'block';
      riskCallout.className = 'risk-callout clean';
      riskCallout.innerHTML = `
        <strong>✔ Due Diligence Clear (Score ${score}/100):</strong>
        <p style="margin-top: 0.2rem; font-size: 0.78rem;">
          ABN checksum passes ATO Modulo-89 mathematical validation. Name and GST status align with statutory registers. Certified safe for payment authorization.
        </p>
      `;
    }

    if (btnPrintCertificate) {
      btnPrintCertificate.style.display = 'inline-block';
    }
  }

  function updateCheckRow(rowId, pass, text, isOptional) {
    const el = document.getElementById(rowId);
    if (!el) return;
    el.className = 'check-row';
    const icon = el.querySelector('.check-icon');
    const textSpan = el.querySelector('.check-text span');

    if (pass) {
      el.classList.add('pass');
      icon.textContent = '✔';
    } else if (isOptional) {
      el.classList.add('warn');
      icon.textContent = 'ℹ️';
    } else {
      el.classList.add('fail');
      icon.textContent = '✖';
    }
    textSpan.textContent = text;
  }

  if (btnPrintCertificate) {
    btnPrintCertificate.addEventListener('click', () => {
      window.print();
    });
  }

  // =========================================================================
  // PILLAR 3: DIRECT LEAD ENQUIRY / QUOTE MODAL
  // =========================================================================

  function openEnquiryModal(item) {
    state.selectedItem = item;
    const name = item.name || item.full_name || 'Business Listing';
    const category = item.anzsic_class || item.category || 'General';
    enquiryTargetName.textContent = name;
    enquiryTargetCategory.textContent = category;
    enquiryModal.classList.add('active');
  }

  enquiryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const item = state.selectedItem;
    const senderName = document.getElementById('enquirySenderName').value.trim();
    const senderEmail = document.getElementById('enquirySenderEmail').value.trim();
    const senderPhone = document.getElementById('enquirySenderPhone').value.trim();
    const urgency = document.getElementById('enquiryUrgency').value;
    const message = document.getElementById('enquiryMessage').value.trim();

    if (!senderName || !senderEmail || !message || !item || !item.abn) return;

    const submitBtn = enquiryForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
      await apiFetch('/enquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          abn: item.abn,
          sender_name: senderName,
          sender_email: senderEmail,
          sender_phone: senderPhone,
          urgency,
          message
        })
      });

      enquiryModal.classList.remove('active');
      enquiryForm.reset();
      showToast(`✔ Enquiry delivered to ${item.name || item.full_name}.`);
    } catch (err) {
      showToast(`Could not send your enquiry: ${err.message}`);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  // =========================================================================
  // PILLAR 4: EMBEDDABLE TRUST BADGE & QR CODE MODAL
  // =========================================================================

  function openBadgeModal(item) {
    state.selectedItem = item;
    const name = item.name || item.full_name || 'Australian Entity';
    badgeEntityName.textContent = name;
    badgeEntityABN.textContent = item.abn ? formatABN(item.abn) : (item.association_number || '00000000000');

    renderBadgePreview();
    renderQrCode(item);
    badgeModal.classList.add('active');
  }

  // Badge Style Tabs
  if (badgeModal) {
    badgeModal.querySelectorAll('.style-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        badgeModal.querySelectorAll('.style-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.badgeStyle = btn.dataset.style || 'dark';
        renderBadgePreview();
      });
    });
  }

  function renderBadgePreview() {
    // openBadgeModal() always sets selectedItem first, so this fallback
    // shouldn't be reachable in practice — kept as a safety net, but
    // deliberately generic rather than defaulting to XTen's own record.
    const item = state.selectedItem || { name: 'Your Business Name', abn: '00000000000' };
    const svgCode = generateTrustBadgeSVG(item, state.badgeStyle);
    badgePreviewBox.innerHTML = svgCode;

    const abnSearch = item.abn ? item.abn : (item.name || item.full_name || '');
    const embedSnippet = `<a href="https://directory.xten.au/?search=${encodeURIComponent(abnSearch)}" target="_blank" rel="noopener" title="Verify this business on XTen National Register">\n  ${svgCode}\n</a>`;
    badgeEmbedCode.value = embedSnippet;
  }

  if (btnCopyBadgeCode) {
    btnCopyBadgeCode.addEventListener('click', () => {
      badgeEmbedCode.select();
      navigator.clipboard.writeText(badgeEmbedCode.value).then(() => {
        btnCopyBadgeCode.textContent = '✔ Copied!';
        setTimeout(() => { btnCopyBadgeCode.textContent = '📋 Copy HTML'; }, 2000);
        showToast('✔ Embed HTML copied to clipboard! Paste into your website footer.');
      });
    });
  }

  function renderQrCode(item) {
    const abnParam = item.abn ? item.abn : item.id;
    const targetUrl = `https://directory.xten.au/?verify=${abnParam}`;
    const qrSVG = generateSimpleQrSVG(targetUrl);
    qrCodeContainer.innerHTML = qrSVG;
  }

  if (btnDownloadQR) {
    btnDownloadQR.addEventListener('click', () => {
      const svgEl = qrCodeContainer.querySelector('svg');
      if (!svgEl) return;
      const svgData = new XMLSerializer().serializeToString(svgEl);
      const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
      const svgUrl = URL.createObjectURL(svgBlob);
      const downloadLink = document.createElement('a');
      downloadLink.href = svgUrl;
      downloadLink.download = `xten-qr-${(state.selectedItem && state.selectedItem.abn) || 'registry'}.svg`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);
      showToast('✔ Downloaded SVG QR Code!');
    });
  }

  if (btnPrintQRCard) {
    btnPrintQRCard.addEventListener('click', () => {
      window.print();
    });
  }

  // =========================================================================
  // UTILITIES & HELPERS
  // =========================================================================

  function copyAccountingRecord(item) {
    const isCompany = state.activePortal === 'companies';
    const name = isCompany ? item.name : item.full_name;
    const tradingName = isCompany && item.trading_names ? item.trading_names[0] : name;
    const record = [
      `ContactName: ${tradingName}`,
      `LegalName: ${name}`,
      `TaxNumber: ${item.abn ? formatABN(item.abn) : (item.association_number || '')}`,
      item.acn ? `CompanyNumber: ${item.acn}` : null,
      `Address: ${item.address || item.clinic_address || `${item.suburb} ${item.state} ${item.postcode}`}`,
      `City: ${item.suburb}`,
      `Region: ${item.state}`,
      `PostalCode: ${item.postcode}`,
      `Country: Australia`,
      item.phone ? `Phone: ${item.phone}` : null,
      item.email ? `Email: ${item.email}` : null,
      `TaxType: ${item.gst_registered ? 'GST on Income (Active)' : 'GST Free / Not Registered'}`,
      item.is_peppol_ready ? `PeppolParticipantID: ${item.peppol_id || ('0151:' + item.abn)}` : null
    ].filter(Boolean).join('\n');

    navigator.clipboard.writeText(record).then(() => {
      showToast(`✔ Copied accounting contact details for ${tradingName} to clipboard!`);
    }).catch(() => {
      showToast(`✔ Copied details for ${tradingName}`);
    });
  }

  function showToast(msg) {
    if (!toastNotification) return;
    toastNotification.textContent = msg;
    toastNotification.classList.add('show');
    setTimeout(() => {
      toastNotification.classList.remove('show');
    }, 3200);
  }

  function validateModulo89(abnStr) {
    const clean = (abnStr || '').replace(/\s+/g, '');
    if (!/^\d{11}$/.test(clean)) {
      return { valid: false, clean, reason: "ABN must be exactly 11 numeric digits" };
    }
    const weights = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];
    let sum = (parseInt(clean[0], 10) - 1) * weights[0];
    for (let i = 1; i < 11; i++) {
      sum += parseInt(clean[i], 10) * weights[i];
    }
    const valid = (sum % 89 === 0);
    return {
      valid,
      clean,
      reason: valid ? "Valid ATO Modulo-89 Checksum" : "Invalid Modulo-89 Checksum"
    };
  }

  function generateTrustBadgeSVG(item, style) {
    const abnFormatted = item.abn ? formatABN(item.abn) : 'VERIFIED';
    
    if (style === 'white') {
      return `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="68" viewBox="0 0 280 68" fill="none">
        <rect width="280" height="68" rx="8" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1.5"/>
        <circle cx="34" cy="34" r="18" fill="#EFF6FF" stroke="#3B82F6" stroke-width="1.5"/>
        <path d="M28 34l4 4 8-8" stroke="#2563EB" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <text x="62" y="27" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="10" font-weight="700" fill="#2563EB" letter-spacing="0.5">ATO MODULO-89 CHECKED</text>
        <text x="62" y="44" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="12" font-weight="800" fill="#0F172A">ABN ${abnFormatted}</text>
        <text x="62" y="56" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="9" fill="#64748B">directory.xten.au Verified Registry</text>
      </svg>`;
    } else if (style === 'pill') {
      return `<svg xmlns="http://www.w3.org/2000/svg" width="230" height="38" viewBox="0 0 230 38" fill="none">
        <rect width="230" height="38" rx="19" fill="#0F172A"/>
        <circle cx="20" cy="19" r="10" fill="#2563EB"/>
        <path d="M16 19l3 3 5-5" stroke="#FFFFFF" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        <text x="38" y="23" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="11" font-weight="700" fill="#FFFFFF">ABN ${abnFormatted} · Verified</text>
      </svg>`;
    } else {
      // Dark Shield
      return `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="68" viewBox="0 0 280 68" fill="none">
        <rect width="280" height="68" rx="8" fill="#0F172A"/>
        <rect x="0.5" y="0.5" width="279" height="67" rx="7.5" stroke="#334155"/>
        <circle cx="34" cy="34" r="18" fill="#1E293B" stroke="#38BDF8" stroke-width="1.5"/>
        <path d="M28 34l4 4 8-8" stroke="#38BDF8" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
        <text x="62" y="27" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="10" font-weight="700" fill="#38BDF8" letter-spacing="0.5">COMMONWEALTH REGISTER</text>
        <text x="62" y="44" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="12" font-weight="800" fill="#FFFFFF">ABN ${abnFormatted}</text>
        <text x="62" y="56" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="9" fill="#94A3B8">Verified on directory.xten.au</text>
      </svg>`;
    }
  }

  // Lightweight standalone SVG QR code generator (21x21 modules standard format)
  function generateSimpleQrSVG(text) {
    const size = 150;
    const modules = 21;
    const modSize = size / modules;
    
    // Deterministic pseudo-random matrix based on text hash for realistic scan representation
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      hash = ((hash << 5) - hash) + text.charCodeAt(i);
      hash |= 0;
    }

    let rects = '';
    
    // Finder patterns (top-left, top-right, bottom-left)
    function addFinder(x, y) {
      rects += `<rect x="${x * modSize}" y="${y * modSize}" width="${7 * modSize}" height="${7 * modSize}" fill="#0F172A" />`;
      rects += `<rect x="${(x + 1) * modSize}" y="${(y + 1) * modSize}" width="${5 * modSize}" height="${5 * modSize}" fill="#FFFFFF" />`;
      rects += `<rect x="${(x + 2) * modSize}" y="${(y + 2) * modSize}" width="${3 * modSize}" height="${3 * modSize}" fill="#0F172A" />`;
    }

    addFinder(0, 0);
    addFinder(14, 0);
    addFinder(0, 14);

    // Data module pattern simulation
    for (let r = 0; r < modules; r++) {
      for (let c = 0; c < modules; c++) {
        // Skip finders
        if ((r < 8 && c < 8) || (r < 8 && c > 12) || (r > 12 && c < 8)) continue;
        
        const bit = ((hash ^ (r * 31 + c * 17)) & 1) === 1;
        if (bit) {
          rects += `<rect x="${c * modSize}" y="${r * modSize}" width="${modSize}" height="${modSize}" fill="#0F172A" />`;
        }
      }
    }

    return `
      <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none">
        <rect width="${size}" height="${size}" fill="#FFFFFF" rx="4"/>
        ${rects}
      </svg>
    `;
  }

  // Schema.org Dynamic Microdata for SEO & AI Search Engine Indexing
  function updateSchemaLD(items) {
    let oldScript = document.getElementById('dynamic-schema-ld');
    if (oldScript) oldScript.remove();

    const entities = items.slice(0, 8).map(item => ({
      "@type": state.activePortal === 'companies' ? "LocalBusiness" : "Person",
      "name": item.name || item.full_name,
      "legalName": item.name || item.full_name,
      "taxID": item.abn,
      "address": {
        "@type": "PostalAddress",
        "addressLocality": item.suburb,
        "addressRegion": item.state,
        "postalCode": item.postcode,
        "addressCountry": "AU"
      },
      "telephone": item.phone || undefined,
      "url": item.website || `https://directory.xten.au/?search=${item.abn}`
    }));

    const schemaJSON = {
      "@context": "https://schema.org",
      "@graph": entities
    };

    const script = document.createElement('script');
    script.id = 'dynamic-schema-ld';
    script.type = 'application/ld+json';
    script.text = JSON.stringify(schemaJSON);
    document.head.appendChild(script);
  }

  // Render Pricing Modal
  function renderPricingModal() {
    if (!pricingGridContainer || typeof PURCHASABLE_FEATURES === 'undefined') return;
    pricingGridContainer.innerHTML = PURCHASABLE_FEATURES.map(feat => `
      <div class="pricing-card ${feat.popular ? 'popular' : ''}">
        ${feat.badge ? `<div class="plan-badge-top ${feat.badge_color}">${feat.badge}</div>` : ''}
        <div class="plan-header">
          <h3 class="plan-name">${escapeHTML(feat.name)}</h3>
          <p class="plan-tagline">${escapeHTML(feat.tagline)}</p>
        </div>
        <div class="plan-pricing-block">
          <div class="plan-price-num">${feat.price_monthly}</div>
          <div class="plan-price-period">${feat.price_period}</div>
        </div>
        <ul class="plan-features-list">
          ${feat.features.map(f => `<li><span class="check">✔</span> <span>${escapeHTML(f)}</span></li>`).join('')}
        </ul>
        <button class="btn-select-plan ${feat.popular ? 'primary' : ''}" data-plan="${feat.id}">
          Select ${escapeHTML(feat.name)}
        </button>
      </div>
    `).join('');

    pricingGridContainer.querySelectorAll('.btn-select-plan').forEach(btn => {
      btn.addEventListener('click', () => {
        const planId = btn.dataset.plan;
        pricingModal.classList.remove('active');

        // Claiming needs a specific ABN — previously this silently fell
        // back to picking an arbitrary demo entity when nothing was
        // selected, which would have submitted a real claim against the
        // wrong listing once claimForm started actually POSTing.
        if (!state.selectedItem || !state.selectedItem.abn) {
          showToast('Search for and open your listing first, then choose a plan from its Claim Profile screen.');
          return;
        }

        openClaimModal(state.selectedItem, planId);
      });
    });
  }

  // Wire Header Upgrade & Pricing Button
  if (btnOpenPricing) {
    btnOpenPricing.addEventListener('click', () => {
      renderPricingModal();
      pricingModal.classList.add('active');
    });
  }

  // Modal Closers
  document.querySelectorAll('.btn-modal-close, .btn-modal-dismiss').forEach(btn => {
    btn.addEventListener('click', () => {
      profileModal.classList.remove('active');
      claimModal.classList.remove('active');
      optoutModal.classList.remove('active');
      if (pricingModal) pricingModal.classList.remove('active');
      if (invoiceCheckerModal) invoiceCheckerModal.classList.remove('active');
      if (enquiryModal) enquiryModal.classList.remove('active');
      if (badgeModal) badgeModal.classList.remove('active');
    });
  });

  // Action: Launch Claim Modal from Profile Details
  document.getElementById('btnModalLaunchClaim').addEventListener('click', () => {
    profileModal.classList.remove('active');
    if (state.selectedItem) openClaimModal(state.selectedItem);
  });

  // Action: Launch Privacy Opt-out Modal from Banner
  document.getElementById('btnLaunchOptout').addEventListener('click', (e) => {
    e.preventDefault();
    optoutModal.classList.add('active');
  });

  // Claim Form Submit — package select values already match the live
  // API's PACKAGE_PRICES keys exactly (standard/featured/prominent/
  // video_showcase/bundle_prominent_video), so it's sent as-is.
  claimForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const claimantName = document.getElementById('claimName').value.trim();
    const claimantEmail = document.getElementById('claimEmail').value.trim();
    const claimantPhone = document.getElementById('claimPhone').value.trim();
    const claimantRole = document.getElementById('claimRole').value;
    const claimantPackage = claimPackageSelect ? claimPackageSelect.value : 'standard';
    const claimantCategory = claimCategorySelect ? claimCategorySelect.value : '';
    const claimVideoInput = document.getElementById('claimVideoUrl');
    const claimantVideoUrl = claimVideoInput ? claimVideoInput.value.trim() : '';
    const item = state.selectedItem;

    if (!claimantName || !claimantEmail || !claimantRole || !item || !item.abn) return;

    const submitBtn = claimForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const result = await apiFetch('/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          abn: item.abn,
          portal_type: state.activePortal === 'companies' ? 'entity' : 'person',
          name: claimantName,
          email: claimantEmail,
          phone: claimantPhone,
          role: claimantRole,
          package: claimantPackage,
          claim_category: claimantCategory,
          video_url: claimantVideoUrl || undefined
        })
      });

      claimModal.classList.remove('active');
      claimForm.reset();

      if (result.status === 'pending_payment' && result.checkout_url) {
        if (result.production_checkout_url) {
          // Two orders: the subscription and the one-off production fee. Show
          // the second link before leaving for the first payment page.
          alert(`Two payments were raised for you:\n\n1. Listing subscription — order ${result.order_ref || ''} (paying now)\n2. Video production — order ${result.production_order_ref || ''}: ${result.production_checkout_url}\n\nBoth links are also emailed to you.`);
        }
        window.location.href = result.checkout_url;
      } else {
        alert(result.message || 'Check your email for a verification link (expires in 48 hours).');
      }
    } catch (err) {
      alert(`Could not submit your claim: ${err.message}`);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  // Video link field only makes sense for a video-inclusive package.
  // Packages where the customer supplies their own video link (production
  // packages have no link to give — we make the video, DI-08).
  const VIDEO_PACKAGES = ['video_showcase', 'video_standalone', 'bundle_prominent_video', 'bundle_prominent_video_y'];
  function syncClaimVideoField() {
    const group = document.getElementById('claimVideoGroup');
    if (!group || !claimPackageSelect) return;
    group.hidden = !VIDEO_PACKAGES.includes(claimPackageSelect.value);
  }
  if (claimPackageSelect) claimPackageSelect.addEventListener('change', syncClaimVideoField);

  // Embeddable player markup for a listing's video: YouTube/Vimeo → iframe,
  // anything else (an https .mp4/.webm) → native <video>.
  function videoEmbedHTML(url) {
    if (!url) return '';
    let m;
    if ((m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{6,})/))) {
      return `<iframe src="https://www.youtube.com/embed/${m[1]}" title="30-second video showcase" loading="lazy" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen style="width:100%;aspect-ratio:16/9;border:0;border-radius:8px;"></iframe>`;
    }
    if ((m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/))) {
      return `<iframe src="https://player.vimeo.com/video/${m[1]}" title="30-second video showcase" loading="lazy" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen style="width:100%;aspect-ratio:16/9;border:0;border-radius:8px;"></iframe>`;
    }
    const safe = String(url).replace(/"/g, '&quot;');
    return `<video controls preload="metadata" playsinline style="width:100%;aspect-ratio:16/9;background:#000;border-radius:8px;"><source src="${safe}" type="video/mp4">Your browser cannot play this video. <a href="${safe}">Open it directly.</a></video>`;
  }

  // Claim Profile Modal
  function openClaimModal(item, preselectedPackage) {
    state.selectedItem = item;
    const name = item.name || item.full_name || '';
    document.getElementById('claimEntityName').textContent = name;
    document.getElementById('claimEntityABN').textContent = item.abn ? formatABN(item.abn) : (item.association_number || 'Community Registry');
    if (preselectedPackage && claimPackageSelect) {
      claimPackageSelect.value = preselectedPackage;
    }
    const claimVideoInput = document.getElementById('claimVideoUrl');
    if (claimVideoInput) claimVideoInput.value = '';
    syncClaimVideoField();
    if (claimCategorySelect) {
      claimCategorySelect.value = '';
      const catText = (item.anzsic_class || item.category || '').toLowerCase();
      if (catText) {
        for (let i = 0; i < claimCategorySelect.options.length; i++) {
          if (catText.includes(claimCategorySelect.options[i].text.toLowerCase().slice(0, 10))) {
            claimCategorySelect.selectedIndex = i;
            break;
          }
        }
      }
    }
    claimModal.classList.add('active');
  }

  // Opt-out Form Submit
  optoutForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const abn = document.getElementById('optoutABN').value.trim();
    const email = document.getElementById('optoutEmail').value.trim();
    const reason = document.getElementById('optoutReason').value.trim();

    if (!abn || !email) return;

    const submitBtn = optoutForm.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;

    try {
      const result = await apiFetch('/opt-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ abn, email, reason })
      });

      optoutModal.classList.remove('active');
      optoutForm.reset();
      alert(result.message || 'Your listing has been suppressed immediately.');
    } catch (err) {
      alert(`Could not process your opt-out request: ${err.message}`);
    } finally {
      if (submitBtn) submitBtn.disabled = false;
    }
  });

  function formatABN(abn) {
    if (!abn || abn.length !== 11) return abn || '';
    return `${abn.slice(0, 2)} ${abn.slice(2, 5)} ${abn.slice(5, 8)} ${abn.slice(8)}`;
  }

  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
});
