(function initZeusFloatingPosition(globalScope) {
  function toNumber(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function normalizeMode(strategy) {
    const mode = String(strategy?.mode || strategy?.type || 'anchored').toLowerCase();
    return mode === 'fixed' ? 'fixed' : 'anchored';
  }

  function resolveAvoidElements(strategy, anchor, button) {
    const selector = String(strategy?.avoidSelector || '').trim();
    if (!selector || !anchor || !anchor.querySelectorAll) {
      return [];
    }

    try {
      return Array.from(anchor.querySelectorAll(selector)).filter((element) => {
        if (!element || !element.isConnected || element === button) return false;
        const rect = element.getBoundingClientRect();
        return (rect.width > 0 && rect.height > 0) || (typeof element.offsetWidth === 'number' && element.offsetWidth > 0);
      });
    } catch (_) {
      return [];
    }
  }

  function ensureRelativeAnchor(anchor) {
    if (!anchor || !(anchor instanceof Element)) {
      return;
    }

    if (anchor.dataset.zeusAnchorPositioned === '1') {
      return;
    }

    const computed = window.getComputedStyle(anchor);
    if (computed.position === 'static') {
      anchor.style.position = 'relative';
      anchor.dataset.zeusAnchorPositioned = '1';
    }
  }

  function create(options) {
    const button = options?.button || null;
    const getStrategy = typeof options?.getStrategy === 'function' ? options.getStrategy : () => ({ mode: 'anchored' });

    if (!button) {
      return Object.freeze({
        update() {},
        setTarget() {},
        destroy() {}
      });
    }

    let currentInput = options?.input || null;
    let currentAnchor = options?.anchor || null;
    let rafId = null;
    let isDestroyed = false;

    function getButtonSize() {
      return {
        width: 28,
        height: 28
      };
    }

    function applyAnchored(strategy) {
      if (!currentAnchor || !currentInput) {
        return;
      }

      ensureRelativeAnchor(currentAnchor);

      const baseRight = Math.max(6, toNumber(strategy?.right, 12));
      const baseBottom = Math.max(6, toNumber(strategy?.bottom, 10));
      const buttonSize = getButtonSize();

      let right = baseRight;
      let bottom = baseBottom;

      const avoidElements = resolveAvoidElements(strategy, currentAnchor, button);
      if (avoidElements.length > 0) {
        const anchorRect = currentAnchor.getBoundingClientRect();
        // Sort from rightmost to leftmost so that obstacles closest to the right edge
        // are cleared sequentially without landing on obstacles to their left.
        const sorted = [...avoidElements].sort((a, b) => {
          return b.getBoundingClientRect().left - a.getBoundingClientRect().left;
        });

        const maxPasses = Math.max(3, sorted.length + 1);
        for (let pass = 0; pass < maxPasses; pass++) {
          let shifted = false;
          for (const avoidElement of sorted) {
            const avoidRect = avoidElement.getBoundingClientRect();

            const buttonLeft = anchorRect.right - right - buttonSize.width;
            const buttonRight = anchorRect.right - right;
            const buttonTop = anchorRect.bottom - bottom - buttonSize.height;
            const buttonBottom = anchorRect.bottom - bottom;

            const overlapsHorizontally = buttonRight > avoidRect.left && buttonLeft < avoidRect.right;
            const overlapsVertically = buttonBottom > avoidRect.top && buttonTop < avoidRect.bottom;

            if (overlapsHorizontally && overlapsVertically) {
              const neededRight = Math.round(anchorRect.right - avoidRect.left + 8);
              if (neededRight > right) {
                right = neededRight;
                shifted = true;
              }
            }
          }
          if (!shifted) {
            break;
          }
        }
      }

      button.style.position = 'absolute';
      button.style.left = 'auto';
      button.style.top = 'auto';
      button.style.right = `${right}px`;
      button.style.bottom = `${bottom}px`;
      button.style.zIndex = String(Math.max(10, toNumber(strategy?.zIndex, 30)));
    }

    function applyFixed(strategy) {
      if (!currentInput) {
        return;
      }

      const inputRect = currentInput.getBoundingClientRect();
      const buttonSize = getButtonSize();
      const offsetX = Math.max(6, toNumber(strategy?.offsetX, 12));
      const offsetY = Math.max(6, toNumber(strategy?.offsetY, 12));
      const viewportPadding = Math.max(4, toNumber(strategy?.viewportPadding, 8));

      const left = clamp(
        inputRect.right - buttonSize.width - offsetX,
        viewportPadding,
        Math.max(viewportPadding, window.innerWidth - buttonSize.width - viewportPadding)
      );

      const top = clamp(
        inputRect.bottom - buttonSize.height - offsetY,
        viewportPadding,
        Math.max(viewportPadding, window.innerHeight - buttonSize.height - viewportPadding)
      );

      button.style.position = 'fixed';
      button.style.left = `${Math.round(left)}px`;
      button.style.top = `${Math.round(top)}px`;
      button.style.right = 'auto';
      button.style.bottom = 'auto';
      button.style.zIndex = String(Math.max(1000, toNumber(strategy?.zIndex, 2147483000)));
    }

    function applyNow() {
      if (isDestroyed || !button.isConnected) {
        return;
      }

      const strategy = getStrategy(currentInput, currentAnchor) || { mode: 'anchored' };
      const mode = normalizeMode(strategy);

      if (mode === 'fixed') {
        applyFixed(strategy);
      } else {
        applyAnchored(strategy);
      }
    }

    function scheduleUpdate(immediate = false) {
      if (isDestroyed) {
        return;
      }

      if (immediate) {
        if (rafId !== null) {
          window.cancelAnimationFrame(rafId);
          rafId = null;
        }
        applyNow();
        return;
      }

      if (rafId !== null) {
        return;
      }

      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        applyNow();
      });
    }

    const onViewportChange = () => scheduleUpdate();

    window.addEventListener('resize', onViewportChange, { passive: true });
    window.addEventListener('scroll', onViewportChange, { passive: true, capture: true });
    document.addEventListener('focusin', onViewportChange, true);

    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', onViewportChange, { passive: true });
      window.visualViewport.addEventListener('scroll', onViewportChange, { passive: true });
    }

    return Object.freeze({
      update(options) {
        scheduleUpdate(options === true || options?.immediate === true);
      },
      setTarget(input, anchor) {
        currentInput = input || null;
        currentAnchor = anchor || null;
        scheduleUpdate(true);
      },
      destroy() {
        isDestroyed = true;

        if (rafId !== null) {
          window.cancelAnimationFrame(rafId);
          rafId = null;
        }

        window.removeEventListener('resize', onViewportChange);
        window.removeEventListener('scroll', onViewportChange, true);
        document.removeEventListener('focusin', onViewportChange, true);

        if (window.visualViewport) {
          window.visualViewport.removeEventListener('resize', onViewportChange);
          window.visualViewport.removeEventListener('scroll', onViewportChange);
        }
      }
    });
  }

  globalScope.ZeusFloatingPosition = Object.freeze({
    create
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
