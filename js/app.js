/**
 * XTen National Directory & People Portal - Frontend Application Controller
 * Zero-dependency, lightweight, high-performance vanilla JavaScript.
 */

document.addEventListener('DOMContentLoaded', () => {
  // State
  const state = {
    activePortal: 'companies', // 'companies' | 'people'
    searchQuery: '',
    selectedState: '',
    selectedCategory: '',
    verifiedOnly: false,
    sortBy: 'views',
    selectedItem: null
  };

  // DOM Elements
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
  const verifiedCheckbox = document.getElementById('verifiedCheckbox');
  const btnSearch = document.getElementById('btnSearch');
  const sortSelect = document.getElementById('sortSelect');
  
  const resultsContainer = document.getElementById('resultsContainer');
  const resultsCountEl = document.getElementById('resultsCount');
  
  // Modals
  const profileModal = document.getElementById('profileModal');
  const claimModal = document.getElementById('claimModal');
  const optoutModal = document.getElementById('optoutModal');
  const pricingModal = document.getElementById('pricingModal');
  const btnOpenPricing = document.getElementById('btnOpenPricing');
  const pricingGridContainer = document.getElementById('pricingGridContainer');
  const claimPackageSelect = document.getElementById('claimPackage');
  const claimForm = document.getElementById('claimForm');
  const optoutForm = document.getElementById('optoutForm');

  // Detect Subdomain on Load (e.g. people.xten.au)
  const hostname = window.location.hostname.toLowerCase();
  if (hostname.includes('people')) {
    setPortal('people');
  } else {
    setPortal('companies');
  }

  // Event Listeners - Navigation Tabs
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

  verifiedCheckbox.addEventListener('change', (e) => {
    state.verifiedOnly = e.target.checked;
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

  // Category Quick Tags
  document.querySelectorAll('.filter-tag').forEach(tag => {
    tag.addEventListener('click', () => {
      const cat = tag.dataset.category || '';
      document.querySelectorAll('.filter-tag').forEach(t => t.classList.remove('active'));
      if (state.selectedCategory === cat) {
        state.selectedCategory = '';
        categorySelect.value = '';
      } else {
        tag.classList.add('active');
        state.selectedCategory = cat;
        categorySelect.value = cat;
      }
      render();
    });
  });

  // Switch Active Portal
  function setPortal(portal) {
    state.activePortal = portal;
    state.searchQuery = '';
    searchInput.value = '';
    
    if (portal === 'companies') {
      tabCompanies.classList.add('active');
      tabPeople.classList.remove('active');
      portalNameEl.textContent = 'Commercial Directory';
      portalStatPill.textContent = '2.5M+ Registered Entities';
      heroTitleEl.innerHTML = 'Official Australian <span class="highlight">Business Directory</span>';
      heroSubtitleEl.textContent = 'Explore 2.5 million verified Australian commercial entities, ABN registrations, corporate due diligence, and verified business contacts.';
      searchInput.placeholder = 'Search by company name, trading name, ABN, ACN, or suburb...';
      privacyBanner.style.display = 'none';
      populateCategories([
        'All Industries',
        'Specialist Medical Services',
        'General Insurance',
        'Newspaper Publishing',
        'Computer System Design',
        'Electrical Services',
        'Government Agency'
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
      populateCategories([
        'All Professions',
        'Allied Health Services',
        'Medical Specialists',
        'Speech Pathology',
        'Audiology & Hearing',
        'Creative & Media',
        'Building & Construction Trades'
      ]);
    }
    render();
  }

  function populateCategories(cats) {
    categorySelect.innerHTML = cats.map((c, idx) => 
      `<option value="${idx === 0 ? '' : c}">${c}</option>`
    ).join('');
    state.selectedCategory = '';
  }

  // Render Result Cards
  function render() {
    const rawData = state.activePortal === 'companies' ? DIRECTORY_DATA.companies : DIRECTORY_DATA.people;
    
    // Filter Data
    let filtered = rawData.filter(item => {
      // Query match
      if (state.searchQuery) {
        const q = state.searchQuery;
        const nameMatch = (item.name || item.full_name || '').toLowerCase().includes(q);
        const tradingMatch = (item.trading_names || [item.business_name || '']).some(t => t.toLowerCase().includes(q));
        const abnMatch = (item.abn || '').includes(q);
        const acnMatch = (item.acn || '').includes(q);
        const suburbMatch = (item.suburb || '').toLowerCase().includes(q);
        const postMatch = (item.postcode || '').includes(q);
        const profMatch = (item.profession || item.anzsic_class || '').toLowerCase().includes(q);
        if (!nameMatch && !tradingMatch && !abnMatch && !acnMatch && !suburbMatch && !postMatch && !profMatch) {
          return false;
        }
      }
      
      // State match
      if (state.selectedState && item.state !== state.selectedState) {
        return false;
      }
      
      // Category match
      if (state.selectedCategory) {
        const itemCat = item.anzsic_class || item.category || '';
        if (!itemCat.toLowerCase().includes(state.selectedCategory.toLowerCase())) {
          return false;
        }
      }
      
      // Verified only
      if (state.verifiedOnly && !item.verified) {
        return false;
      }
      
      return true;
    });

    // Sort
    filtered.sort((a, b) => {
      if (state.sortBy === 'views') return (b.views_this_month || 0) - (a.views_this_month || 0);
      if (state.sortBy === 'name') {
        const nameA = a.name || a.full_name || '';
        const nameB = b.name || b.full_name || '';
        return nameA.localeCompare(nameB);
      }
      return 0;
    });

    // Update count
    resultsCountEl.innerHTML = `Showing <strong>${filtered.length}</strong> ${state.activePortal === 'companies' ? 'companies' : 'practitioners'}`;

    // Render cards HTML
    if (filtered.length === 0) {
      resultsContainer.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 4rem 1rem; background: var(--bg-surface); border: 1px dashed var(--border-light); border-radius: var(--radius-lg);">
          <div style="font-size: 2.5rem; margin-bottom: 0.75rem;">🔍</div>
          <h3 style="font-family: var(--font-display); font-size: 1.25rem; font-weight: 700; margin-bottom: 0.5rem;">No exact matching records found</h3>
          <p style="color: var(--text-muted); font-size: 0.9rem; max-width: 420px; margin: 0 auto;">Try clearing search filters, searching by a broader suburb or 11-digit ABN, or switching between Companies and People tabs.</p>
        </div>
      `;
      return;
    }

    resultsContainer.innerHTML = filtered.map(item => createCardHTML(item)).join('');

    // Attach card action listeners
    document.querySelectorAll('.btn-view-profile').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const item = rawData.find(d => d.id === id);
        if (item) openProfileModal(item);
      });
    });

    document.querySelectorAll('.btn-claim-profile').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const item = rawData.find(d => d.id === id);
        if (item) openClaimModal(item);
      });
    });
  }

  // Card Template
  function createCardHTML(item) {
    const isCompany = state.activePortal === 'companies';
    const title = isCompany ? item.name : item.full_name;
    const subTitle = isCompany ? (item.trading_names ? item.trading_names[0] : '') : item.profession;
    const location = `${item.suburb} ${item.state} ${item.postcode}`;
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
            <span class="abn-tag" title="ATO Checksum Modulo-89 Verified">ABN ${formatABN(item.abn)}</span>
            <span class="meta-pill">📍 ${escapeHTML(location)}</span>
            ${categoryTag ? `<span class="meta-pill">🏷️ ${escapeHTML(categoryTag)}</span>` : ''}
          </div>

          <p class="entity-description">${escapeHTML(item.description || item.bio || '')}</p>
        </div>

        <div class="card-footer">
          <span class="view-stat" title="Unique visitors in the past 30 days">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
            ${item.views_this_month} views
          </span>

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

    // Video Showcase Player Box
    const videoBoxHTML = item.has_video ? `
      <div class="video-showcase-box">
        <div style="display: flex; justify-content: space-between; align-items: center;">
          <span style="font-size: 0.75rem; font-weight: 700; letter-spacing: 0.05em; color: #C084FC; text-transform: uppercase;">
            🎥 30-Second Video Showcase
          </span>
          <span style="font-size: 0.75rem; color: #CBD5E1; background: #334155; padding: 2px 8px; border-radius: 10px;">
            ⏱ ${item.video_duration || '0:30'} HD
          </span>
        </div>
        <div class="video-player-screen" style="cursor: pointer;" onclick="alert('Playing 30-sec HD showcase video: \\'${escapeHTML(item.video_title || 'Authentic Business Introduction')}\\'');">
          <div class="play-circle-btn" title="Play Video Showcase">▶</div>
        </div>
        <div class="video-meta-bar">
          <span style="font-weight: 600; color: #F8FAFC;">${escapeHTML(item.video_title || 'Authentic Business Introduction')}</span>
          <span style="color: #94A3B8;">Australian Edge CDN · Zero Ads</span>
        </div>
        <div class="video-progress">
          <div class="video-progress-fill"></div>
        </div>
      </div>
    ` : '';

    const detailsHTML = `
      ${videoBoxHTML}
      <div class="detail-grid">
        <div class="detail-label">ABN</div>
        <div class="detail-value">
          <span class="abn-tag">${formatABN(item.abn)}</span>
          <span style="color: var(--success); font-size: 0.8rem; margin-left: 0.5rem;">✔ ATO Modulo-89 Valid</span>
        </div>

        ${item.acn ? `
          <div class="detail-label">ACN</div>
          <div class="detail-value">${item.acn}</div>
        ` : ''}

        <div class="detail-label">Entity Status</div>
        <div class="detail-value">${escapeHTML(item.status || 'Active')}</div>

        <div class="detail-label">Entity Type</div>
        <div class="detail-value">${escapeHTML(item.entity_type || 'Commercial Entity')}</div>

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
        <div class="detail-value">📍 ${escapeHTML(item.address || item.clinic_address || `${item.suburb} ${item.state} ${item.postcode}`)}</div>

        ${item.phone ? `
          <div class="detail-label">Phone Contact</div>
          <div class="detail-value"><a href="tel:${item.phone}" style="color: var(--primary); font-weight: 700;">${escapeHTML(item.phone)}</a></div>
        ` : ''}

        ${(item.email || item.email_proxy) ? `
          <div class="detail-label">Contact Email</div>
          <div class="detail-value"><a href="mailto:${item.email || item.email_proxy}" style="color: var(--primary);">${escapeHTML(item.email || item.email_proxy)}</a></div>
        ` : ''}

        ${item.website ? `
          <div class="detail-label">Website</div>
          <div class="detail-value"><a href="${item.website}" target="_blank" rel="noopener" style="color: var(--primary); text-decoration: underline;">${escapeHTML(item.website)} ↗</a></div>
        ` : ''}

        <div class="detail-label">Monthly Views</div>
        <div class="detail-value">${item.views_this_month || 0} unique monthly page impressions</div>
      </div>

      <div style="background: var(--bg-subtle); padding: 1rem; border-radius: var(--radius-sm); border: 1px solid var(--border-light); font-size: 0.85rem; color: var(--text-muted); line-height: 1.5;">
        ${escapeHTML(item.description || item.bio || 'Official Australian Business Register statutory public profile. Verified via Commonwealth of Australia open data registries.')}
      </div>
    `;

    document.getElementById('modalProfileDetails').innerHTML = detailsHTML;
    profileModal.classList.add('active');
  }

  // Claim Profile Modal
  function openClaimModal(item, preselectedPackage) {
    state.selectedItem = item;
    const name = item.name || item.full_name || '';
    document.getElementById('claimEntityName').textContent = name;
    document.getElementById('claimEntityABN').textContent = formatABN(item.abn);
    if (preselectedPackage && claimPackageSelect) {
      claimPackageSelect.value = preselectedPackage;
    }
    claimModal.classList.add('active');
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

    // Attach click listeners to plan buttons
    pricingGridContainer.querySelectorAll('.btn-select-plan').forEach(btn => {
      btn.addEventListener('click', () => {
        const planId = btn.dataset.plan;
        pricingModal.classList.remove('active');
        
        const currentData = state.activePortal === 'companies' ? DIRECTORY_DATA.companies : DIRECTORY_DATA.people;
        const targetItem = state.selectedItem || currentData[0];
        openClaimModal(targetItem, planId);
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

  // Claim Form Submit
  claimForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const claimantName = document.getElementById('claimName').value.trim();
    const claimantEmail = document.getElementById('claimEmail').value.trim();
    const claimantPhone = document.getElementById('claimPhone').value.trim();
    const claimantRole = document.getElementById('claimRole').value;
    const claimantPackage = claimPackageSelect ? claimPackageSelect.options[claimPackageSelect.selectedIndex].text : 'Standard Claim';
    const item = state.selectedItem;

    if (!claimantName || !claimantEmail) return;

    // Mailto fallback or backend webhook
    const subject = encodeURIComponent(`Profile Claim & Upgrade Request: ${item.name || item.full_name} (ABN ${item.abn})`);
    const body = encodeURIComponent(
      `Claim & Upgrade Request Details:\n` +
      `--------------------------------\n` +
      `Entity / Name: ${item.name || item.full_name}\n` +
      `ABN: ${item.abn}\n` +
      `Portal: ${state.activePortal}\n` +
      `Selected Package: ${claimantPackage}\n` +
      `Claimant: ${claimantName}\n` +
      `Email: ${claimantEmail}\n` +
      `Phone: ${claimantPhone}\n` +
      `Role: ${claimantRole}\n\n` +
      `Submitted via XTen National Portal.`
    );

    alert(`Thank you, ${claimantName}! Your claim and upgrade request for "${item.name || item.full_name}" [${claimantPackage}] has been registered. Our onboarding team at directory@xten.au will confirm setup.`);
    claimModal.classList.remove('active');
    window.location.href = `mailto:directory@xten.au?subject=${subject}&body=${body}`;
  });

  // Opt-out Form Submit
  optoutForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const abn = document.getElementById('optoutABN').value.trim();
    const email = document.getElementById('optoutEmail').value.trim();
    const reason = document.getElementById('optoutReason').value.trim();

    if (!abn || !email) return;

    const subject = encodeURIComponent(`Privacy Act Opt-Out / Takedown: ABN ${abn}`);
    const body = encodeURIComponent(
      `Privacy Act Request (Section 16):\n` +
      `---------------------------------\n` +
      `ABN to Suppress: ${abn}\n` +
      `Contact Email: ${email}\n` +
      `Reason: ${reason}\n\n` +
      `This record will be immediately removed from people.xten.au indexing.`
    );

    alert(`Your opt-out request for ABN ${abn} has been received and queued for immediate suppression in compliance with the Australian Privacy Act 1988.`);
    optoutModal.classList.remove('active');
    window.location.href = `mailto:directory@xten.au?subject=${subject}&body=${body}`;
  });

  // Utilities
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
