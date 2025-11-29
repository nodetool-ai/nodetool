// NodeTool Futuristic Theme - Interactive JavaScript

(function() {
  'use strict';

  // Mobile menu toggle
  const mobileMenuToggle = document.querySelector('.mobile-menu-toggle');
  const sidebar = document.querySelector('.sidebar');
  const navList = document.querySelector('.nav-list');

  if (mobileMenuToggle) {
    mobileMenuToggle.addEventListener('click', function() {
      if (sidebar) {
        sidebar.classList.toggle('active');
      }
      if (navList) {
        navList.classList.toggle('active');
      }
    });
  }

  // Active link highlighting
  function setActiveLink() {
    const currentPath = window.location.pathname;
    const links = document.querySelectorAll('.sidebar-link, .nav-item');

    links.forEach(link => {
      const linkPath = link.getAttribute('href');
      if (linkPath && currentPath.includes(linkPath) && linkPath !== '/') {
        link.classList.add('active');
      }
    });
  }

  // Sidebar scroll position persistence across page loads
  const SIDEBAR_SCROLL_KEY = 'nodetool-sidebar-scroll';
  function restoreSidebarScroll() {
    if (!sidebar) return;
    const stored = sessionStorage.getItem(SIDEBAR_SCROLL_KEY);
    if (stored !== null) {
      sidebar.scrollTop = parseInt(stored, 10);
    }
  }

  function persistSidebarScroll() {
    if (!sidebar) return;
    sessionStorage.setItem(SIDEBAR_SCROLL_KEY, sidebar.scrollTop);
  }

  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const href = this.getAttribute('href');
      if (href !== '#') {
        e.preventDefault();
        const target = document.querySelector(href);
        if (target) {
          target.scrollIntoView({
            behavior: 'smooth',
            block: 'start'
          });
        }
      }
    });
  });

  // Add copy button to code blocks
  function addCopyButtons() {
    const codeBlocks = document.querySelectorAll('pre code');

    codeBlocks.forEach((codeBlock) => {
      const pre = codeBlock.parentElement;
      const button = document.createElement('button');
      button.className = 'copy-button';
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
        }
      });

      pre.style.position = 'relative';
      pre.appendChild(button);
    });
  }

  // Add CSS for copy button dynamically
  const copyButtonStyles = `
    .copy-button {
      position: absolute;
      top: 0.5rem;
      right: 0.5rem;
      padding: 0.4rem 0.8rem;
      background: var(--color-bg-elevated);
      color: var(--color-accent-cyan);
      border: 1px solid var(--color-border);
      border-radius: 4px;
      font-family: var(--font-mono);
      font-size: 0.8rem;
      cursor: pointer;
      transition: all var(--transition-fast);
      opacity: 0;
    }

    pre:hover .copy-button {
      opacity: 1;
    }

    .copy-button:hover {
      background: var(--color-accent-cyan);
      color: var(--color-bg-primary);
      border-color: var(--color-accent-cyan);
      box-shadow: var(--glow-cyan);
    }

    .copy-button.copied {
      background: var(--color-accent-green);
      color: var(--color-bg-primary);
      border-color: var(--color-accent-green);
    }
  `;

  const styleSheet = document.createElement('style');
  styleSheet.textContent = copyButtonStyles;
  document.head.appendChild(styleSheet);

  // Intersection Observer for fade-in animations
  function setupScrollAnimations() {
    const observerOptions = {
      threshold: 0.1,
      rootMargin: '0px 0px -50px 0px'
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, observerOptions);

    document.querySelectorAll('h2, h3, .page-content > p, .page-content > ul, .page-content > ol').forEach(el => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(20px)';
      el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
      observer.observe(el);
    });

    // Add visible class styles
    const animationStyles = `
      .visible {
        opacity: 1 !important;
        transform: translateY(0) !important;
      }
    `;

    const animStyle = document.createElement('style');
    animStyle.textContent = animationStyles;
    document.head.appendChild(animStyle);
  }

  // Cyber glitch effect on logo (subtle)
  function addLogoGlitch() {
    const logo = document.querySelector('.logo-text');
    if (!logo) return;

    setInterval(() => {
      if (Math.random() > 0.95) {
        logo.style.textShadow = '2px 0 var(--color-accent-magenta), -2px 0 var(--color-accent-cyan)';
        setTimeout(() => {
          logo.style.textShadow = '';
        }, 50);
      }
    }, 3000);
  }

  // Debounce utility for input-driven handlers
  function debounce(fn, delay) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  }

  // Client-side search loader + renderer
  function initSearch() {
    const container = document.querySelector('.search-container');
    const input = document.getElementById('site-search');
    const resultsPanel = document.getElementById('search-results');
    const resultsList = document.getElementById('search-results-list');

    if (!container || !input || !resultsPanel || !resultsList) return;

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

        li.addEventListener('click', () => {
          window.location.href = item.url;
        });

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
      if (!query) {
        closeResults();
        return;
      }

      const terms = query.split(/\s+/).filter(Boolean);
      if (!terms.length) {
        closeResults();
        return;
      }

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
      if (!searchLoaded) {
        await loadIndex();
      }
      debouncedSearch(event.target.value);
    });

    input.addEventListener('focus', async () => {
      if (!searchLoaded) {
        await loadIndex();
      }
      if (input.value.trim()) {
        runSearch(input.value);
      }
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
        if (item) {
          window.location.href = item.url;
        }
      }

      if (event.key === 'Escape') {
        closeResults();
        input.blur();
      }
    });

    document.addEventListener('keydown', (event) => {
      const isInputFocused = document.activeElement === input;
      if (event.key === '/' && !isInputFocused) {
        event.preventDefault();
        input.focus();
      }

      if (event.key === 'Escape' && !resultsPanel.hidden) {
        closeResults();
      }
    });

    document.addEventListener('click', (event) => {
      const target = event.target;
      if (!container.contains(target)) {
        closeResults();
      }
    });
  }

  // Initialize everything when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  function init() {
    setActiveLink();
    addCopyButtons();
    setupScrollAnimations();
    addLogoGlitch();
    restoreSidebarScroll();
    initSearch();

    if (sidebar) {
      sidebar.addEventListener('scroll', persistSidebarScroll, { passive: true });
      window.addEventListener('beforeunload', persistSidebarScroll);
    }

    // Close mobile menu when clicking outside
    document.addEventListener('click', function(e) {
      if (sidebar && sidebar.classList.contains('active')) {
        if (!sidebar.contains(e.target) && !mobileMenuToggle.contains(e.target)) {
          sidebar.classList.remove('active');
        }
      }
    });

    console.log('%c🚀 NodeTool Documentation Theme Loaded', 'color: #00d9ff; font-size: 14px; font-weight: bold;');
  }
})();
