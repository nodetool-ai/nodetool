// NodeTool Documentation Theme - Interactive JavaScript
// Keeps the cyberpunk aesthetic while improving performance and accessibility.

(function() {
  'use strict';

  const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
  const sidebar = document.querySelector('.sidebar');
  const navList = document.querySelector('.nav-list');

  // --- Mobile menu toggle -----------------------------------------------------
  if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener('click', function() {
      mobileMenuToggle.classList.toggle('active');
      const expanded = mobileMenuToggle.classList.contains('active');
      mobileMenuToggle.setAttribute('aria-expanded', String(expanded));

      if (sidebar) sidebar.classList.toggle('active');
      if (navList) navList.classList.toggle('active');
    });
  }

  // --- Active link highlighting (exact + parent prefix matching) -------------
  function normalizePath(path) {
    if (!path) return '';
    try {
      // Resolve relative URLs like "/getting-started" against the current origin
      const url = new URL(path, window.location.origin);
      return url.pathname.replace(/\/index\.html?$/, '/').replace(/\/$/, '') || '/';
    } catch (err) {
      return path;
    }
  }

  function setActiveLink() {
    const currentPath = normalizePath(window.location.pathname);
    const allLinks = document.querySelectorAll('.sidebar-link, .nav-item');

    let bestSidebarLink = null;
    let bestSidebarLength = -1;

    allLinks.forEach(link => {
      const linkPath = normalizePath(link.getAttribute('href'));
      if (!linkPath) return;

      const isExact = linkPath === currentPath;
      // Only treat as parent when the link path is a directory-like prefix
      const isParent =
        linkPath !== '/' &&
        (currentPath === linkPath ||
         currentPath.startsWith(linkPath + '/'));

      if (isExact || isParent) {
        if (link.classList.contains('sidebar-link')) {
          // Choose the longest matching path as the single active sidebar link
          if (linkPath.length > bestSidebarLength) {
            bestSidebarLength = linkPath.length;
            bestSidebarLink = link;
          }
        } else {
          link.classList.add('active');
        }
      }
    });

    if (bestSidebarLink) {
      bestSidebarLink.classList.add('active');
      // Open the containing collapsible section so the active link is visible
      const parentDetails = bestSidebarLink.closest('details.nav-section');
      if (parentDetails && !parentDetails.open) {
        parentDetails.open = true;
      }
      // Scroll active link into sidebar viewport on load
      if (sidebar) {
        const rect = bestSidebarLink.getBoundingClientRect();
        const sidebarRect = sidebar.getBoundingClientRect();
        if (rect.top < sidebarRect.top || rect.bottom > sidebarRect.bottom) {
          bestSidebarLink.scrollIntoView({ block: 'center' });
        }
      }
    }
  }

  // --- Sidebar scroll persistence --------------------------------------------
  const SIDEBAR_SCROLL_KEY = 'nodetool-sidebar-scroll';
  function restoreSidebarScroll() {
    if (!sidebar) return;
    const stored = sessionStorage.getItem(SIDEBAR_SCROLL_KEY);
    if (stored !== null) {
      const parsed = parseInt(stored, 10);
      if (!Number.isNaN(parsed)) sidebar.scrollTop = parsed;
    }
  }

  function persistSidebarScroll() {
    if (!sidebar) return;
    sessionStorage.setItem(SIDEBAR_SCROLL_KEY, String(sidebar.scrollTop));
  }

  // --- Collapsible sidebar sections ------------------------------------------
  const COLLAPSED_SECTIONS_KEY = 'nodetool-sidebar-collapsed';

  function getCollapsedSet() {
    try {
      const raw = localStorage.getItem(COLLAPSED_SECTIONS_KEY);
      return new Set(raw ? JSON.parse(raw) : []);
    } catch (err) {
      return new Set();
    }
  }

  function saveCollapsedSet(set) {
    try {
      localStorage.setItem(COLLAPSED_SECTIONS_KEY, JSON.stringify([...set]));
    } catch (err) {
      // Ignore quota errors
    }
  }

  function initCollapsibleSections() {
    const sections = document.querySelectorAll('.sidebar details.nav-section');
    if (!sections.length) return;

    const collapsed = getCollapsedSet();

    sections.forEach(section => {
      const key = section.dataset.section;
      if (key && collapsed.has(key)) section.open = false;

      section.addEventListener('toggle', () => {
        if (!key) return;
        const current = getCollapsedSet();
        if (section.open) current.delete(key);
        else current.add(key);
        saveCollapsedSet(current);
      });
    });

    const collapseAll = document.querySelector('.sidebar-collapse-all');
    if (collapseAll) {
      const label = collapseAll.querySelector('.sidebar-collapse-label');
      function updateLabel() {
        const anyOpen = [...sections].some(s => s.open);
        if (label) label.textContent = anyOpen ? 'Collapse all' : 'Expand all';
      }
      updateLabel();

      collapseAll.addEventListener('click', () => {
        const anyOpen = [...sections].some(s => s.open);
        const next = getCollapsedSet();
        sections.forEach(section => {
          section.open = !anyOpen;
          if (!section.dataset.section) return;
          if (section.open) next.delete(section.dataset.section);
          else next.add(section.dataset.section);
        });
        saveCollapsedSet(next);
        updateLabel();
      });

      sections.forEach(section => section.addEventListener('toggle', updateLabel));
    }
  }

  // --- Smooth scroll for in-page anchors -------------------------------------
  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
      anchor.addEventListener('click', function(e) {
        const href = this.getAttribute('href');
        if (!href || href === '#') return;

        const target = document.querySelector(href);
        if (!target) return;

        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        // Update focus for accessibility so keyboard users land on target
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
        // Update URL hash without adding an extra history entry for every click
        history.replaceState(null, '', href);
      });
    });
  }

  // --- Copy-code buttons ------------------------------------------------------
  function addCopyButtons() {
    const codeBlocks = document.querySelectorAll('pre code');

    codeBlocks.forEach((codeBlock) => {
      const pre = codeBlock.parentElement;
      if (!pre || pre.querySelector('.copy-button')) return;

      const button = document.createElement('button');
      button.className = 'copy-button';
      button.type = 'button';
      button.textContent = 'Copy';
      button.setAttribute('aria-label', 'Copy code to clipboard');

      button.addEventListener('click', async () => {
        const code = codeBlock.textContent;
        try {
          await navigator.clipboard.writeText(code);
          button.textContent = 'Copied!';
          button.classList.add('copied');
          setTimeout(() => {
            button.textContent = 'Copy';
            button.classList.remove('copied');
          }, 2000);
        } catch (err) {
          console.error('Failed to copy code:', err);
          button.textContent = 'Error';
          setTimeout(() => { button.textContent = 'Copy'; }, 2000);
        }
      });

      pre.style.position = 'relative';
      pre.appendChild(button);
    });
  }

  // --- Copy whole page as Markdown -------------------------------------------
  function initCopyPageButton() {
    const button = document.querySelector('.copy-page-button');
    if (!button) return;

    const article = document.querySelector('.doc-page');
    const sourcePath = article ? article.dataset.sourcePath : null;

    button.addEventListener('click', async () => {
      const label = button.querySelector('span');
      try {
        let markdown = '';

        if (sourcePath) {
          const rawUrl = 'https://raw.githubusercontent.com/nodetool-ai/nodetool/main/docs/' + sourcePath;
          const response = await fetch(rawUrl);
          if (response.ok) {
            markdown = await response.text();
            markdown = markdown.replace(/^---[\s\S]*?---\s*/, '');
          }
        }

        if (!markdown) {
          const content = document.querySelector('.page-content');
          if (content) markdown = content.innerText;
        }

        await navigator.clipboard.writeText(markdown.trim());
        if (label) label.textContent = 'Copied!';
        button.classList.add('copied');

        setTimeout(() => {
          if (label) label.textContent = 'Copy Page';
          button.classList.remove('copied');
        }, 2000);
      } catch (err) {
        console.error('Failed to copy page:', err);
        if (label) label.textContent = 'Error';
        setTimeout(() => { if (label) label.textContent = 'Copy Page'; }, 2000);
      }
    });
  }

  // --- Reading progress indicator --------------------------------------------
  function initReadingProgress() {
    const bar = document.querySelector('.reading-progress-bar');
    const article = document.querySelector('.doc-page');
    if (!bar || !article) return;

    let ticking = false;

    function update() {
      const rect = article.getBoundingClientRect();
      const viewportHeight = window.innerHeight;
      const total = rect.height - viewportHeight;
      const progressed = Math.min(Math.max(-rect.top, 0), Math.max(total, 1));
      const pct = total > 0 ? (progressed / total) * 100 : 0;
      bar.style.width = pct.toFixed(2) + '%';
      ticking = false;
    }

    function onScroll() {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    update();
  }

  // --- Back-to-top button -----------------------------------------------------
  function initBackToTop() {
    const btn = document.querySelector('.back-to-top');
    if (!btn) return;

    function update() {
      const threshold = window.innerHeight * 0.6;
      if (window.scrollY > threshold) {
        btn.hidden = false;
        btn.classList.add('visible');
      } else {
        btn.classList.remove('visible');
        // Hide after transition for accessibility
        setTimeout(() => {
          if (!btn.classList.contains('visible')) btn.hidden = true;
        }, 220);
      }
    }

    btn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      const focusTarget = document.querySelector('#main-content') || document.body;
      focusTarget.focus({ preventScroll: true });
    });

    window.addEventListener('scroll', update, { passive: true });
    update();
  }

  // --- Subtle logo hover effect (no setInterval) -----------------------------
  // The previous implementation ran a random glitch every 3s which was distracting
  // and wasted CPU. We now scope the glitch effect to a CSS pseudo-element in
  // main.scss, triggered on hover. Nothing required here.

  // --- Debounce utility -------------------------------------------------------
  function debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  // --- Client-side search -----------------------------------------------------
  function initSearch() {
    const container = document.querySelector('.search-container');
    const input = document.getElementById('site-search');
    const resultsPanel = document.getElementById('search-results');
    const resultsList = document.getElementById('search-results-list');
    const searchToggle = document.querySelector('.search-toggle');

    if (!container || !input || !resultsPanel || !resultsList) return;

    function openSearch() {
      container.classList.add('open');
      if (searchToggle) searchToggle.setAttribute('aria-expanded', 'true');
      requestAnimationFrame(() => input.focus());
    }

    function closeSearch() {
      container.classList.remove('open');
      if (searchToggle) searchToggle.setAttribute('aria-expanded', 'false');
      closeResults();
    }

    if (searchToggle) {
      searchToggle.addEventListener('click', (event) => {
        event.stopPropagation();
        if (container.classList.contains('open')) closeSearch();
        else openSearch();
      });
    }

    const endpoint = container.dataset.searchIndex || '/search.json';
    let searchIndex = [];
    let searchLoaded = false;
    let activeIndex = -1;
    let currentResults = [];

    const typeClass = {
      Concept: 'concept',
      Tutorial: 'tutorial',
      Reference: 'reference',
      API: 'api',
      Node: 'node'
    };

    async function loadIndex() {
      if (searchLoaded) return searchIndex;
      try {
        const response = await fetch(endpoint, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Search index failed: ${response.status}`);
        searchIndex = await response.json();
      } catch (error) {
        console.error('Failed to load search index', error);
        renderResults([], 'Search is temporarily unavailable.');
      } finally {
        searchLoaded = true;
      }
      return searchIndex;
    }

    function closeResults() {
      resultsPanel.hidden = true;
      activeIndex = -1;
      currentResults = [];
      resultsList.innerHTML = '';
      input.setAttribute('aria-expanded', 'false');
    }

    function renderResults(results, emptyMessage) {
      resultsList.innerHTML = '';
      currentResults = results;

      if (!results.length) {
        activeIndex = -1;
        const emptyState = document.createElement('li');
        emptyState.className = 'search-empty';
        emptyState.textContent = emptyMessage || 'No matches yet. Try a different term.';
        resultsList.appendChild(emptyState);
        resultsPanel.hidden = false;
        input.setAttribute('aria-expanded', 'true');
        return;
      }

      activeIndex = 0;
      input.setAttribute('aria-expanded', 'true');

      results.forEach((item, idx) => {
        const li = document.createElement('li');
        li.className = 'search-result';
        li.dataset.url = item.url;
        li.setAttribute('role', 'option');

        const badge = document.createElement('span');
        badge.className = `search-badge ${typeClass[item.type] || 'concept'}`;
        badge.textContent = item.type || 'Concept';

        const title = document.createElement('span');
        title.className = 'search-result-title';
        title.textContent = item.title;

        const meta = document.createElement('div');
        meta.className = 'search-result-meta';
        meta.appendChild(badge);

        if (item.node_type) {
          const tag = document.createElement('span');
          tag.textContent = item.node_type;
          meta.appendChild(tag);
        } else if (item.namespace) {
          const tag = document.createElement('span');
          tag.textContent = item.namespace;
          meta.appendChild(tag);
        }

        const heading = (item.headings && item.headings[0]) ? ` · ${item.headings[0]}` : '';
        if (heading) {
          const headingEl = document.createElement('span');
          headingEl.textContent = heading;
          meta.appendChild(headingEl);
        }

        const snippet = document.createElement('div');
        snippet.className = 'search-snippet';
        const fallbackContent = item.content ? item.content.slice(0, 180) : '';
        snippet.textContent = item.summary || fallbackContent || '';

        li.appendChild(title);
        li.appendChild(meta);
        li.appendChild(snippet);

        li.addEventListener('click', () => { window.location.href = item.url; });
        li.addEventListener('mouseenter', () => setActive(idx));
        resultsList.appendChild(li);
      });

      resultsPanel.hidden = false;
    }

    function setActive(index) {
      const items = resultsList.querySelectorAll('.search-result');
      items.forEach(el => el.classList.remove('active'));
      if (items[index]) {
        items[index].classList.add('active');
        activeIndex = index;
      }
    }

    function runSearch(value) {
      const query = value.trim().toLowerCase();
      if (!query) { closeResults(); return; }

      const terms = query.split(/\s+/).filter(Boolean);
      if (!terms.length) { closeResults(); return; }

      const results = searchIndex
        .map(item => {
          const haystack = [
            item.title,
            item.summary,
            item.node_type,
            item.namespace,
            (item.headings || []).join(' '),
            (item.keywords || []).join(' '),
            item.content
          ].join(' ').toLowerCase();

          const matchesAll = terms.every(term => haystack.includes(term));
          if (!matchesAll) return null;

          let score = 0;
          terms.forEach(term => {
            if (item.title && item.title.toLowerCase().includes(term)) score += 8;
            if (item.node_type && item.node_type.toLowerCase().includes(term)) score += 5;
            if (item.namespace && item.namespace.toLowerCase().includes(term)) score += 3;
            if (item.type === 'Node') score += 2;
            if (item.headings && item.headings.join(' ').toLowerCase().includes(term)) score += 3;
            if (item.keywords && item.keywords.join(' ').toLowerCase().includes(term)) score += 2;
            if (item.summary && item.summary.toLowerCase().includes(term)) score += 1;
          });

          return { ...item, score };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score)
        .slice(0, 12);

      renderResults(results);
      setActive(0);
    }

    const debouncedSearch = debounce(runSearch, 140);

    input.addEventListener('input', async (event) => {
      if (!searchLoaded) await loadIndex();
      debouncedSearch(event.target.value);
    });

    input.addEventListener('focus', async () => {
      if (!searchLoaded) await loadIndex();
      if (input.value.trim()) runSearch(input.value);
    });

    input.addEventListener('keydown', (event) => {
      if (resultsPanel.hidden) return;
      const items = resultsList.querySelectorAll('.search-result');

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (items.length) {
          const nextIndex = (activeIndex + 1) % items.length;
          setActive(nextIndex);
          items[nextIndex].scrollIntoView({ block: 'nearest' });
        }
      }

      if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (items.length) {
          const nextIndex = activeIndex <= 0 ? items.length - 1 : activeIndex - 1;
          setActive(nextIndex);
          items[nextIndex].scrollIntoView({ block: 'nearest' });
        }
      }

      if (event.key === 'Enter') {
        const item = currentResults[activeIndex] || currentResults[0];
        if (item) window.location.href = item.url;
      }

      if (event.key === 'Escape') {
        closeResults();
        input.blur();
        if (container.classList.contains('open')) closeSearch();
      }
    });

    document.addEventListener('keydown', (event) => {
      const isInputFocused = document.activeElement === input;
      // Ignore shortcut when typing in other inputs
      const tag = document.activeElement && document.activeElement.tagName;
      const inFormField = tag === 'INPUT' || tag === 'TEXTAREA' || (document.activeElement && document.activeElement.isContentEditable);

      if (event.key === '/' && !isInputFocused && !inFormField) {
        event.preventDefault();
        if (searchToggle && window.getComputedStyle(searchToggle).display !== 'none') openSearch();
        else input.focus();
      }

      if (event.key === 'Escape' && !resultsPanel.hidden) closeResults();
    });

    document.addEventListener('click', (event) => {
      const target = event.target;
      const clickedToggle = searchToggle && searchToggle.contains(target);
      if (!container.contains(target) && !clickedToggle) {
        closeResults();
        if (container.classList.contains('open')) closeSearch();
      }
    });
  }

  // --- Init ------------------------------------------------------------------
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    initCollapsibleSections();
    setActiveLink();
    addCopyButtons();
    initCopyPageButton();
    initSmoothScroll();
    initReadingProgress();
    initBackToTop();
    restoreSidebarScroll();
    initSearch();

    if (sidebar) {
      sidebar.addEventListener('scroll', persistSidebarScroll, { passive: true });
      window.addEventListener('beforeunload', persistSidebarScroll);
    }

    document.addEventListener('click', function(e) {
      if (sidebar && sidebar.classList.contains('active')) {
        if (!sidebar.contains(e.target) && mobileMenuToggle && !mobileMenuToggle.contains(e.target)) {
          sidebar.classList.remove('active');
        }
      }

      if (navList && navList.classList.contains('active')) {
        if (!navList.contains(e.target) && mobileMenuToggle && !mobileMenuToggle.contains(e.target)) {
          navList.classList.remove('active');
          mobileMenuToggle.classList.remove('active');
          mobileMenuToggle.setAttribute('aria-expanded', 'false');
        }
      }
    });

    // Close mobile sidebar with Escape
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (sidebar && sidebar.classList.contains('active')) sidebar.classList.remove('active');
      if (navList && navList.classList.contains('active')) {
        navList.classList.remove('active');
        if (mobileMenuToggle) {
          mobileMenuToggle.classList.remove('active');
          mobileMenuToggle.setAttribute('aria-expanded', 'false');
        }
      }
    });
  }
})();
