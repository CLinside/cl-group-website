/* No dependencies. Load with <script src="le-ciel-header.js" defer></script>. */
(() => {
  "use strict";

  // Change these two numbers if you want a different scroll/visibility threshold.
  const HEADER_CHANGE_AFTER_PX = 40;
  const VIDEO_VISIBLE_FRACTION = 0.15;

  function start() {
    const header = document.querySelector("[data-lc-header]");
    if (!header || header.dataset.lcReady === "true") return;
    header.dataset.lcReady = "true";

    const menuButton = header.querySelector("[data-lc-menu-toggle]");
    const menu = header.querySelector("[data-lc-menu]");
    const hero = document.querySelector("[data-lc-video-hero]");
    const video = hero && hero.querySelector("[data-lc-video]");
    let scrollFrame = 0;
    let checkVideoWithoutObserver = null;

    function updateHeader() {
      header.classList.toggle("lc-header--solid", window.scrollY > HEADER_CHANGE_AFTER_PX);
    }

    function closeMenu(restoreFocus = false) {
      if (!menuButton || !menu) return;
      menu.hidden = true;
      menuButton.setAttribute("aria-expanded", "false");
      header.classList.remove("lc-header--menu-open");
      if (restoreFocus) menuButton.focus();
    }

    if (menuButton && menu) {
      menuButton.addEventListener("click", () => {
        const open = menu.hidden;
        menu.hidden = !open;
        menuButton.setAttribute("aria-expanded", String(open));
        header.classList.toggle("lc-header--menu-open", open);
      });
      menu.addEventListener("click", (event) => {
        if (event.target.closest("a")) closeMenu();
      });
      document.addEventListener("click", (event) => {
        if (!header.contains(event.target)) closeMenu();
      });
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape" && !menu.hidden) closeMenu(true);
      });
    }

    function onScroll() {
      if (scrollFrame) return;
      scrollFrame = window.requestAnimationFrame(() => {
        scrollFrame = 0;
        updateHeader();
        if (checkVideoWithoutObserver) checkVideoWithoutObserver();
      });
    }

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pageshow", updateHeader);
    updateHeader();
    if (!hero || !video) return;

    const toggle = hero.querySelector("[data-lc-video-toggle]");
    const toggleLabel = hero.querySelector("[data-lc-video-label]");
    const playIcon = hero.querySelector("[data-lc-play-icon]");
    const pauseIcon = hero.querySelector("[data-lc-pause-icon]");
    const status = hero.querySelector("[data-lc-video-status]");
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let inView = false;
    let userPaused = false;
    let userStarted = false;
    let autoplayBlocked = false;
    let mediaFailed = false;
    let playPending = null;
    let retryFrame = 0;
    let pageAway = false;
    let observer = null;

    // Set the properties too, which is helpful for inline playback on mobile.
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.loop = true;

    function wantsPlayback() {
      return inView && !document.hidden && !pageAway && !userPaused &&
        !mediaFailed && (!motion.matches || userStarted);
    }

    function showStatus(message) {
      if (status) status.textContent = message;
    }

    function updateControl() {
      const playing = !video.paused && !video.ended;
      const label = playing ? "Pause video" : "Play video";
      if (toggleLabel) toggleLabel.textContent = label;
      if (toggle) {
        toggle.setAttribute("aria-label", label);
        toggle.disabled = mediaFailed;
      }
      if (playIcon) playIcon.hidden = playing;
      if (pauseIcon) pauseIcon.hidden = !playing;
    }

    function queueRetry() {
      if (retryFrame) return;
      retryFrame = window.requestAnimationFrame(() => {
        retryFrame = 0;
        syncPlayback();
      });
    }

    function syncPlayback() {
      if (!wantsPlayback()) {
        // pause() also cancels a play request that is still waiting for media.
        if (!video.paused || playPending) video.pause();
        updateControl();
        return;
      }
      if (autoplayBlocked || playPending || (!video.paused && !video.ended)) return;

      let request;
      try {
        request = video.play();
      } catch (error) {
        autoplayBlocked = true;
        showStatus("Press play to watch.");
        updateControl();
        return;
      }

      // Older browsers may return no promise from play().
      if (!request || typeof request.then !== "function") {
        if (!wantsPlayback()) video.pause();
        updateControl();
        return;
      }

      const pending = Promise.resolve(request);
      playPending = pending;
      pending.then(() => {
        if (playPending !== pending) return;
        playPending = null;
        // The visitor may have scrolled away before play() finished.
        if (!wantsPlayback()) video.pause();
        showStatus("");
        updateControl();
      }).catch((error) => {
        if (playPending !== pending) return;
        playPending = null;
        if (error && error.name === "AbortError") {
          // A quick down/up scroll can cancel the old request before resuming.
          if (wantsPlayback()) queueRetry();
        } else if (!mediaFailed) {
          autoplayBlocked = true;
          showStatus("Press play to watch.");
        }
        updateControl();
      });
    }

    function updateVisibilityFromBounds() {
      const rect = hero.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      const width = Math.max(0, Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0));
      const height = Math.max(0, Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0));
      const area = rect.width * rect.height;
      inView = area > 0 && width * height / area >= VIDEO_VISIBLE_FRACTION;
      syncPlayback();
    }

    if ("IntersectionObserver" in window) {
      observer = new window.IntersectionObserver((entries) => {
        for (const entry of entries) {
          if (entry.target !== hero) continue;
          inView = entry.isIntersecting && entry.intersectionRatio >= VIDEO_VISIBLE_FRACTION;
        }
        syncPlayback();
      }, { threshold: [0, VIDEO_VISIBLE_FRACTION, 1] });
      observer.observe(hero);
    } else {
      checkVideoWithoutObserver = updateVisibilityFromBounds;
    }

    if (toggle) {
      toggle.addEventListener("click", () => {
        if (!video.paused && !video.ended) {
          userPaused = true;
          video.pause();
        } else {
          userPaused = false;
          userStarted = true;
          autoplayBlocked = false;
          showStatus("");
          syncPlayback();
        }
        updateControl();
      });
    }

    video.addEventListener("play", () => {
      if (!wantsPlayback()) video.pause();
      updateControl();
    });
    video.addEventListener("playing", () => {
      if (!wantsPlayback()) video.pause();
      updateControl();
    });
    video.addEventListener("pause", updateControl);
    video.addEventListener("error", () => {
      mediaFailed = true;
      video.pause();
      showStatus("The video is unavailable. Please try again later.");
      updateControl();
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) syncPlayback();
      else updateVisibilityFromBounds();
    });
    window.addEventListener("resize", updateVisibilityFromBounds, { passive: true });
    window.addEventListener("pagehide", () => {
      pageAway = true;
      syncPlayback();
    });
    window.addEventListener("pageshow", () => {
      pageAway = false;
      updateVisibilityFromBounds();
    });
    if (typeof motion.addEventListener === "function") {
      motion.addEventListener("change", syncPlayback);
    } else if (typeof motion.addListener === "function") {
      motion.addListener(syncPlayback);
    }

    updateControl();
    updateVisibilityFromBounds();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
