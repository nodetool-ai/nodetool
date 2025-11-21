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
