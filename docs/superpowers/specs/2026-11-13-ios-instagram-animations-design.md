# iOS 27 & Instagram Animation System Design Specification

- **Date**: 2026-11-13
- **Topic**: Modern iOS / Instagram Micro-interactions, Spring Physics & Shimmer Polish
- **Status**: Approved by User
- **Constraint**: DO NOT COMMIT OR PUSH to git (runs strictly on local environment for user verification).

---

## 1. Objectives

Elevate the NSA Training Platform web interface into a fluid, tactile, and modern application inspired by the responsive physics of modern iOS and the polished visual feedback of Instagram:
1. **Spring Physics & Tactile Feedback**:
   - Elastic press response on buttons, icon controls, and interactive elements (`active:scale-[0.97]`).
   - Dynamic spring pop-in for Modals, Drawers, Tooltips, and Dropdowns using custom cubic-bezier curves (`cubic-bezier(0.34, 1.56, 0.64, 1)`).
2. **Instagram Specular Shimmer**:
   - Sweeping diagonal light beam for loading skeletons and placeholder states.
3. **Smooth Segmented Controls & Pills**:
   - Elastic transitions when toggling tabs, filters, or active navigation items.
4. **Staggered Entrance Transitions**:
   - Cascading content entrance on major dashboards, detail pages, and table views.
5. **Preservation & Performance**:
   - Zero layout shifts (CLS = 0).
   - Zero heavy external dependencies (pure CSS animations and Tailwind utilities for 60fps performance on all devices).
   - 100% test compatibility and TypeScript type safety.

---

## 2. Core Animation Tokens (`apps/web/src/index.css`)

### 2.1 Cubic-Bezier Timing Functions
- `--ease-spring`: `cubic-bezier(0.34, 1.56, 0.64, 1)` (snappy spring with gentle overshoot)
- `--ease-ios-sheet`: `cubic-bezier(0.16, 1, 0.3, 1)` (smooth deceleration for drawers)
- `--ease-ios-press`: `cubic-bezier(0.25, 1, 0.5, 1)` (instant tactile response)

### 2.2 Keyframes
- `springPopIn`:
  - `0%`: `opacity: 0; transform: scale(0.92) translateY(8px);`
  - `70%`: `opacity: 1; transform: scale(1.015) translateY(-1px);`
  - `100%`: `opacity: 1; transform: scale(1) translateY(0);`
- `instagramShimmer`:
  - `0%`: `background-position: -200% 0;`
  - `100%`: `background-position: 200% 0;`
- `slideInUpStagger`:
  - `0%`: `opacity: 0; transform: translateY(12px);`
  - `100%`: `opacity: 1; transform: translateY(0);`

---

## 3. Component Enhancements

1. **`Button` (`apps/web/src/components/ui.tsx`)**:
   - Active scaling: `active:scale-[0.97]` with `--ease-spring`.
   - Micro-glow on primary actions on hover.
2. **`Modal` & `Drawer` (`apps/web/src/components/ui.tsx`)**:
   - Modals use `.animate-ios-spring-pop`.
   - Enhanced backdrop blur with smooth fade.
3. **`Skeleton` (`apps/web/src/components/ui.tsx`)**:
   - Replaced flat pulse with Instagram specular gradient sweep.
4. **Dropdowns & Popovers (`apps/web/src/features/sale/SaleDropdowns.tsx` & `ui.tsx`)**:
   - Popovers scale in smoothly from their trigger origin.
5. **Interactive Cards**:
   - Subtle lift (`hover:-translate-y-0.5 hover:shadow-md`) and active press.

---

## 4. Verification Plan

1. Code verification: `npm run format:check`, `npm run lint`, `npm test`, `npm run build`.
2. Browser runtime: Live check on `http://localhost:5173`.
3. Confirm uncommitted state in local git.
